import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketServer } from "socket.io";
import { config } from "./config.js";
import { db, healthcheck, audit } from "./db.js";
import {
  decryptSipSecret,
  encryptSipSecret,
  hashPassword,
  sanitizeUser,
  signToken,
  signSuperAdminToken,
  verifyPassword,
  verifyToken
} from "./security.js";
import { AmiClient } from "./ami.js";
import { CallTracker } from "./callTracker.js";
import { provisionTenantSipAccount, deprovisionSipAccount } from "./sipProvisioning.js";
import {
  allocateTenantExtension,
  assertTenantUserCapacity,
  createDefaultTenantRoles,
  hasPermission,
  loadRolePermissions,
  normalizeWorkspace,
  parseJson,
  releaseTenantExtension,
  requirePermission,
  tenantFeatureEnabled,
  tenantUsageSummary
} from "./saas.js";
import { PERMISSIONS } from "./permissions.js";
import createCampaignRoutes from "./campaignRoutes.js";
import {
  DEFAULT_TEAM_PRIVILEGES,
  TEAM_PRIVILEGES,
  normalizeTeamPrivileges,
  parseTeamPrivileges,
  supervisorAgentIdsForPrivilege,
  supervisorTeamAccess,
  supervisorTeamIdsForPrivilege
} from "./teamAccess.js";

const app = express();
app.set("trust proxy", config.trustProxy);
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));

function corsOriginCheck(origin, callback) {
  if (!origin || config.frontendOrigins.includes(origin)) return callback(null, true);
  return callback(new Error(`Origin not allowed: ${origin}`));
}

app.use(cors({ origin: corsOriginCheck, credentials: false }));
app.use(express.json({ limit: "512kb" }));

const server = http.createServer(app);
const io = new SocketServer(server, {
  path: "/socket.io",
  cors: { origin: corsOriginCheck, methods: ["GET", "POST"] }
});
export const ami = new AmiClient(config.ami);
const tracker = new CallTracker(io, config.recordingRoot);
let amiConnected = false;
const loginAttempts = new Map();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function bearer(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function normalizeDid(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

function nullableLimit(value, unlimited = false) {
  if (unlimited === true || String(unlimited).toLowerCase() === "true") return null;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("Plan limits must be zero or a positive integer");
  return parsed;
}

function legacyRoleForRoleName(roleName) {
  if (["Tenant Owner", "Tenant Admin"].includes(roleName)) return "ADMIN";
  if (roleName === "Supervisor") return "SUPERVISOR";
  return "AGENT";
}

function isTenantOwnerRoleName(roleName) {
  return String(roleName || "").trim() === "Tenant Owner";
}

function isTenantOwner(user) {
  return isTenantOwnerRoleName(user?.role_name || user?.roleName);
}

function isSupervisor(user) {
  return String(user?.role_name || user?.roleName || "").trim() === "Supervisor";
}

function normalizeDateFilter(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

async function safeAstDbDelete(family, key) {
  if (!key) return;
  await ami.action({ Action: "DBDel", Family: family, Key: key }).catch(() => undefined);
}

async function syncAgentDid(sipUsername, callerIdNumber) {
  const did = normalizeDid(callerIdNumber);
  if (!sipUsername || !did) return;
  await ami.action({ Action: "DBPut", Family: "ringnex_did", Key: sipUsername, Val: did });
  await ami.action({ Action: "DBPut", Family: "ringnex_inbound_did", Key: did, Val: sipUsername });
}

async function clearAgentDid(sipUsername, callerIdNumber = null) {
  if (!sipUsername) return;
  await safeAstDbDelete("ringnex_did", sipUsername);
  const did = normalizeDid(callerIdNumber);
  if (did) await safeAstDbDelete("ringnex_inbound_did", did);
}

async function callAccessScope(user, teamPrivilege) {
  if (isSupervisor(user)) {
    return { type: "agents", agentIds: await supervisorAgentIdsForPrivilege(user.id, user.tenant_id, teamPrivilege) };
  }

  const canViewTenant =
    hasPermission(user, "VIEW_REPORTS") ||
    hasPermission(user, "MONITOR_CALLS") ||
    hasPermission(user, "MANAGE_AGENTS");

  return canViewTenant
    ? { type: "tenant", agentIds: null }
    : { type: "agents", agentIds: [user.id] };
}

function appendCallAgentScope(where, params, scope, column = "c.agent_user_id") {
  if (scope.type !== "agents") return where;
  if (!scope.agentIds?.length) return `${where} AND 1=0`;
  params.push(...scope.agentIds);
  return `${where} AND ${column} IN (${scope.agentIds.map(() => "?").join(",")})`;
}

function appendRequestedAgent(where, params, scope, requestedAgentId, column = "c.agent_user_id") {
  const agentId = String(requestedAgentId || "").trim();
  if (!agentId) return where;
  if (scope.type === "agents" && !scope.agentIds.includes(agentId)) return `${where} AND 1=0`;
  params.push(agentId);
  return `${where} AND ${column}=?`;
}

async function tenantSeatCount(tenantId, activeOnly = true) {
  const params = [tenantId];
  const activeClause = activeOnly ? "AND u.active=1" : "";
  const [[row]] = await db.execute(
    `SELECT COUNT(*) AS total
       FROM users u
       LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
      WHERE u.tenant_id=? ${activeClause} AND COALESCE(r.name,'')<>'Tenant Owner'`,
    params
  );
  return Number(row.total || 0);
}

async function teamActionAccess(user, teamId, privilege = null) {
  const [teamRows] = await db.execute(
    "SELECT id FROM teams WHERE id=? AND tenant_id=? LIMIT 1",
    [teamId, user.tenant_id]
  );
  if (!teamRows[0]) return null;

  if (hasPermission(user, "MANAGE_TEAMS")) {
    return { global: true, privileges: Object.fromEntries(TEAM_PRIVILEGES.map(({ key }) => [key, true])) };
  }
  if (!hasPermission(user, "VIEW_TEAMS") || !isSupervisor(user)) return null;
  const access = await supervisorTeamAccess(user.id, user.tenant_id, teamId);
  if (!access) return null;
  if (privilege && access.privileges?.[privilege] !== true) return null;
  return { global: false, ...access };
}

function teamAccessFlags(access) {
  const privileges = access?.privileges || {};
  const global = Boolean(access?.global);
  const canAddMembers = global || privileges.ADD_TEAM_MEMBERS === true;
  const canRemoveMembers = global || privileges.REMOVE_TEAM_MEMBERS === true;
  return {
    canEditSettings: global || privileges.EDIT_TEAM_SETTINGS === true,
    canAddMembers,
    canRemoveMembers,
    canViewMembers: global || privileges.VIEW_TEAM_MEMBERS === true || canAddMembers || canRemoveMembers,
    canManageAssignment: global
  };
}

const ASTERISK_TELEPHONY_PERMISSIONS = Object.freeze([
  "MAKE_CALLS",
  "RECEIVE_CALLS",
  "HOLD_CALL",
  "SEND_DTMF",
  "BLIND_TRANSFER",
  "WARM_TRANSFER",
  "ADD_PARTICIPANT",
  "RECORD_CALL",
  "MONITOR_CALLS",
  "LISTEN_LIVE_CALLS",
  "WHISPER_CALLS",
  "BARGE_CALLS"
]);

async function syncAgentAsteriskPermissions({
  sipUsername,
  roleId,
  tenant,
  active = true
}) {
  if (!sipUsername) return;

  const tenantId = tenant?.tenant_id || tenant?.id || null;
  let permissionSourceEnabled = Boolean(active);

  if (permissionSourceEnabled && roleId && tenantId) {
    const [roleRows] = await db.execute(
      "SELECT active FROM roles WHERE id=? AND tenant_id=? LIMIT 1",
      [roleId, tenantId]
    );
    permissionSourceEnabled = Number(roleRows[0]?.active) === 1;
  }

  const permissions = permissionSourceEnabled
    ? await loadRolePermissions(roleId, tenant)
    : [];

  for (const permission of ASTERISK_TELEPHONY_PERMISSIONS) {
    const value = permissions.includes(permission) ? "1" : "0";

    await ami.action({
      Action: "DBPut",
      Family: "ringnex_perm",
      Key: `${sipUsername}/${permission}`,
      Val: value
    });

    // Temporary backwards-compatible alias while the live dialplan
    // still reads ringnex_make_calls for MAKE_CALLS.
    if (permission === "MAKE_CALLS") {
      await ami.action({
        Action: "DBPut",
        Family: "ringnex_make_calls",
        Key: sipUsername,
        Val: value
      });
    }
  }
}

async function syncRoleAsteriskPermissions({
  tenantId,
  roleId,
  tenant
}) {
  let tenantContext = tenant;

  if (!tenantContext) {
    const [tenantRows] = await db.execute(
      "SELECT id,features_json FROM tenants WHERE id=? LIMIT 1",
      [tenantId]
    );
    tenantContext = tenantRows[0];
  }

  if (!tenantContext) return;

  const [users] = await db.execute(
    `SELECT sip_username,active
       FROM users
      WHERE tenant_id=? AND role_id=? AND sip_username IS NOT NULL`,
    [tenantId, roleId]
  );

  for (const user of users) {
    await syncAgentAsteriskPermissions({
      sipUsername: user.sip_username,
      roleId,
      tenant: tenantContext,
      active: Number(user.active) === 1
    });
  }
}

async function syncTenantAsteriskPermissions(tenantId) {
  const [tenantRows] = await db.execute(
    "SELECT id,features_json FROM tenants WHERE id=? LIMIT 1",
    [tenantId]
  );

  const tenant = tenantRows[0];
  if (!tenant) return;

  const [users] = await db.execute(
    `SELECT sip_username,role_id,active
       FROM users
      WHERE tenant_id=? AND sip_username IS NOT NULL`,
    [tenantId]
  );

  for (const user of users) {
    await syncAgentAsteriskPermissions({
      sipUsername: user.sip_username,
      roleId: user.role_id,
      tenant,
      active: Number(user.active) === 1
    });
  }
}
async function syncAllAsteriskMappings() {
  const [tenants] = await db.execute(`SELECT id,status,features_json FROM tenants`);
  for (const tenant of tenants) {
    await syncTenantRouting({ tenantId: tenant.id, status: tenant.status });
  }
  const [users] = await db.execute(
    `SELECT tenant_id,sip_username,extension,caller_id_number,role_id
       FROM users WHERE sip_username IS NOT NULL AND extension IS NOT NULL AND active=1`
  );
  for (const user of users) {
    await syncTenantRouting({
      tenantId: user.tenant_id,
      sipUsername: user.sip_username,
      extension: user.extension,
      status: tenants.find((tenant) => tenant.id === user.tenant_id)?.status || "INACTIVE"
    });
    if (user.caller_id_number) await syncAgentDid(user.sip_username, user.caller_id_number);

    const tenant = tenants.find((item) => item.id === user.tenant_id);
    await syncAgentAsteriskPermissions({
      sipUsername: user.sip_username,
      roleId: user.role_id,
      tenant
    });
  }
}

async function syncTenantRouting({ tenantId, sipUsername, extension, status = "ACTIVE" }) {
  if (!tenantId) return;
  await ami.action({ Action: "DBPut", Family: "ringnex_tenant_status", Key: tenantId, Val: status });
  if (sipUsername) {
    await ami.action({ Action: "DBPut", Family: "ringnex_tenant", Key: sipUsername, Val: tenantId });
  }
  if (sipUsername && extension) {
    await ami.action({
      Action: "DBPut",
      Family: "ringnex_ext",
      Key: `${tenantId}/${extension}`,
      Val: sipUsername
    });
  }
}

async function resolveTenantDid(tenantId, value) {
  const digits = normalizeDid(value);
  if (!digits) return null;
  const candidates = [digits, `+${digits}`];
  const [rows] = await db.query(
    `SELECT id, number, assigned_user_id, status
       FROM tenant_dids
      WHERE tenant_id=? AND number IN (?,?) AND status <> 'DISABLED'
      LIMIT 1`,
    [tenantId, ...candidates]
  );
  return rows[0] || null;
}

async function loadTenantUser(userId) {
  const [rows] = await db.execute(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.role_id,
            u.sip_username, u.sip_secret_ciphertext, u.extension, u.caller_id_number,
            u.team_name, u.status, u.active,
            r.name AS role_name, r.active AS role_active,
            t.name AS tenant_name, t.workspace, t.status AS tenant_status,
            t.features_json, t.price_per_user, t.max_users, t.outbound_minutes, t.inbound_minutes,
            t.extension_start, t.next_extension, t.timezone
       FROM users u
       JOIN tenants t ON t.id=u.tenant_id
       LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
      WHERE u.id=? LIMIT 1`,
    [userId]
  );
  const user = rows[0];
  if (!user || !user.active || user.role_active === 0) return null;
  if (!["ACTIVE", "TRIAL"].includes(user.tenant_status)) return null;
  user.permissions = await loadRolePermissions(user.role_id, user);
  return user;
}

export const authenticate = asyncRoute(async (req, res, next) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });
  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Session expired or invalid" });
  }
  if (claims.scope !== "tenant") return res.status(401).json({ error: "Invalid tenant session" });
  const user = await loadTenantUser(claims.sub);
  if (!user) return res.status(401).json({ error: "Account or workspace is disabled" });
  req.user = user;
  req.tenant = {
    id: user.tenant_id,
    name: user.tenant_name,
    workspace: user.workspace,
    status: user.tenant_status,
    featuresJson: parseJson(user.features_json, {}),
    pricePerUser: user.price_per_user,
    maxUsers: user.max_users,
    outboundMinutes: user.outbound_minutes,
    inboundMinutes: user.inbound_minutes,
    extensionStart: user.extension_start,
    nextExtension: user.next_extension,
    timezone: user.timezone
  };
  next();
});

const authenticateSuperAdmin = asyncRoute(async (req, res, next) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });
  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Session expired or invalid" });
  }
  if (claims.scope !== "super-admin") return res.status(401).json({ error: "Invalid Super Admin session" });
  const [rows] = await db.execute(
    `SELECT id,email,name,active FROM super_admins WHERE id=? LIMIT 1`,
    [claims.sub]
  );
  if (!rows[0]?.active) return res.status(401).json({ error: "Super Admin account is disabled" });
  req.superAdmin = rows[0];
  next();
});

function authPayload(user) {
  const safe = sanitizeUser(user);
  return {
    user: safe,
    tenant: {
      id: user.tenant_id,
      name: user.tenant_name,
      workspace: user.workspace,
      status: user.tenant_status,
      timezone: user.timezone,
      limits: {
        maxUsers: user.max_users,
        outboundMinutes: user.outbound_minutes,
        inboundMinutes: user.inbound_minutes
      }
    },
    role: { id: user.role_id, name: user.role_name || user.role || "User" },
    permissions: user.permissions || [],
    sip: !isTenantOwner(user) && user.sip_username
      ? {
          username: user.sip_username,
          password: decryptSipSecret(user.sip_secret_ciphertext),
          extension: user.extension,
          displayName: user.name,
          domain: config.publicSipDomain,
          wssUrl: config.publicWssUrl
        }
      : null
  };
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  const database = await healthcheck();
  res.json({ ok: database, database, ami: amiConnected, time: new Date().toISOString() });
}));
app.use("/api/campaigns", createCampaignRoutes(authenticate));
// ---------------------------
// Super Admin / Product Owner
// ---------------------------
app.post("/api/super-admin/auth/login", asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const [rows] = await db.execute(
    `SELECT id,email,name,password_hash,active FROM super_admins WHERE email=? LIMIT 1`,
    [email]
  );
  const admin = rows[0];
  if (!admin || !admin.active || !(await verifyPassword(password, admin.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  await db.execute("UPDATE super_admins SET last_login_at=UTC_TIMESTAMP() WHERE id=?", [admin.id]);
  res.json({
    token: signSuperAdminToken(admin),
    admin: { id: admin.id, email: admin.email, name: admin.name }
  });
}));

app.get("/api/super-admin/auth/session", authenticateSuperAdmin, (req, res) => {
  res.json({ admin: req.superAdmin });
});

app.get("/api/super-admin/overview", authenticateSuperAdmin, asyncRoute(async (_req, res) => {
  const [[summary]] = await db.execute(
    `SELECT COUNT(*) AS totalTenants,
            SUM(status='ACTIVE') AS activeTenants,
            SUM(status='TRIAL') AS trialTenants,
            SUM(status='INACTIVE') AS inactiveTenants,
            SUM(status='SUSPENDED') AS suspendedTenants
       FROM tenants`
  );
  const [[users]] = await db.execute(
    `SELECT COUNT(*) AS totalUsers,COALESCE(SUM(u.active=1),0) AS activeUsers
       FROM users u
       LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
      WHERE COALESCE(r.name,'')<>'Tenant Owner'`
  );
  const [[carrier]] = await db.execute(
    `SELECT COALESCE(SUM(cost),0) AS carrierCost
       FROM carrier_cdrs
      WHERE started_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')`
  );
  const [tenants] = await db.execute(
    `SELECT t.id,t.name,t.workspace,t.status,t.price_per_user,t.max_users,t.outbound_minutes,t.inbound_minutes,
            t.extension_start,t.timezone,p.name AS plan_name,
            COUNT(CASE WHEN COALESCE(ur.name,'')<>'Tenant Owner' THEN u.id END) AS users,
            COALESCE(SUM(CASE WHEN COALESCE(ur.name,'')<>'Tenant Owner' AND u.active=1 THEN 1 ELSE 0 END),0) AS active_users
       FROM tenants t
       LEFT JOIN pricing_plans p ON p.id=t.plan_id
       LEFT JOIN users u ON u.tenant_id=t.id
       LEFT JOIN roles ur ON ur.id=u.role_id AND ur.tenant_id=u.tenant_id
      GROUP BY t.id
      ORDER BY t.created_at DESC`
  );
  res.json({
    summary: {
      ...summary,
      totalUsers: users.totalUsers,
      activeUsers: users.activeUsers,
      carrierCost: carrier.carrierCost
    },
    tenants
  });
}));

app.get("/api/super-admin/plans", authenticateSuperAdmin, asyncRoute(async (_req, res) => {
  const [plans] = await db.execute("SELECT * FROM pricing_plans ORDER BY active DESC, name ASC");
  res.json({ plans: plans.map((plan) => ({ ...plan, features: parseJson(plan.features_json, {}) })) });
}));

app.post("/api/super-admin/plans", authenticateSuperAdmin, asyncRoute(async (req, res) => {
  const id = crypto.randomUUID();
  const name = String(req.body.name || "").trim();
  const code = normalizeWorkspace(req.body.code || name);
  if (!name || !code) return res.status(400).json({ error: "Plan name is required" });
  const features = req.body.features && typeof req.body.features === "object" ? req.body.features : { ALL: true };
  await db.execute(
    `INSERT INTO pricing_plans
      (id,code,name,description,price_per_user,max_users,outbound_minutes,inbound_minutes,features_json,active)
     VALUES (?,?,?,?,?,?,?,?,?,1)`,
    [
      id,
      code,
      name,
      String(req.body.description || "").trim() || null,
      Number(req.body.pricePerUser || 0),
      nullableLimit(req.body.maxUsers, req.body.unlimitedUsers),
      nullableLimit(req.body.outboundMinutes, req.body.unlimitedOutbound),
      nullableLimit(req.body.inboundMinutes, req.body.unlimitedInbound),
      JSON.stringify(features)
    ]
  );
  res.status(201).json({ id });
}));

app.patch("/api/super-admin/plans/:id", authenticateSuperAdmin, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM pricing_plans WHERE id=? LIMIT 1", [req.params.id]);
  const plan = rows[0];
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  const features = req.body.features === undefined ? plan.features_json : JSON.stringify(req.body.features || {});
  await db.execute(
    `UPDATE pricing_plans SET name=?,description=?,price_per_user=?,max_users=?,outbound_minutes=?,inbound_minutes=?,features_json=?,active=? WHERE id=?`,
    [
      req.body.name ?? plan.name,
      req.body.description ?? plan.description,
      req.body.pricePerUser === undefined ? plan.price_per_user : Number(req.body.pricePerUser),
      req.body.maxUsers === undefined && req.body.unlimitedUsers === undefined ? plan.max_users : nullableLimit(req.body.maxUsers, req.body.unlimitedUsers),
      req.body.outboundMinutes === undefined && req.body.unlimitedOutbound === undefined ? plan.outbound_minutes : nullableLimit(req.body.outboundMinutes, req.body.unlimitedOutbound),
      req.body.inboundMinutes === undefined && req.body.unlimitedInbound === undefined ? plan.inbound_minutes : nullableLimit(req.body.inboundMinutes, req.body.unlimitedInbound),
      features,
      req.body.active === undefined ? plan.active : Number(Boolean(req.body.active)),
      req.params.id
    ]
  );
  res.status(204).end();
}));

app.get("/api/super-admin/tenants", authenticateSuperAdmin, asyncRoute(async (_req, res) => {
  const [tenants] = await db.execute(
    `SELECT t.*, p.name AS plan_name,
            (SELECT COUNT(*)
               FROM users u
               LEFT JOIN roles ur ON ur.id=u.role_id AND ur.tenant_id=u.tenant_id
              WHERE u.tenant_id=t.id AND u.active=1 AND COALESCE(ur.name,'')<>'Tenant Owner') AS active_users
       FROM tenants t LEFT JOIN pricing_plans p ON p.id=t.plan_id
      ORDER BY t.created_at DESC`
  );
  res.json({ tenants: tenants.map((tenant) => ({ ...tenant, features: parseJson(tenant.features_json, {}) })) });
}));

app.post("/api/super-admin/tenants", authenticateSuperAdmin, asyncRoute(async (req, res) => {
  const id = crypto.randomUUID();
  const name = String(req.body.name || "").trim();
  const workspace = normalizeWorkspace(req.body.workspace || name);
  const ownerName = String(req.body.ownerName || "").trim();
  const ownerEmail = String(req.body.ownerEmail || "").trim().toLowerCase();
  const ownerPassword = String(req.body.ownerPassword || "");
  const extensionStart = Number(req.body.extensionStart || 1001);
  if (!name || !workspace || !ownerName || !ownerEmail) {
    return res.status(400).json({ error: "Company, workspace and owner details are required" });
  }
  if (!Number.isInteger(extensionStart) || extensionStart < 100) {
    return res.status(400).json({ error: "Extension start number must be at least 100" });
  }

  let plan = null;
  if (req.body.planId) {
    const [planRows] = await db.execute("SELECT * FROM pricing_plans WHERE id=? AND active=1 LIMIT 1", [req.body.planId]);
    plan = planRows[0] || null;
    if (!plan) return res.status(400).json({ error: "Selected pricing plan is not available" });
  }

  const effective = {
    pricePerUser: req.body.pricePerUser === undefined ? Number(plan?.price_per_user || 0) : Number(req.body.pricePerUser),
    maxUsers: req.body.maxUsers === undefined && req.body.unlimitedUsers === undefined
      ? plan?.max_users ?? null
      : nullableLimit(req.body.maxUsers, req.body.unlimitedUsers),
    outboundMinutes: req.body.outboundMinutes === undefined && req.body.unlimitedOutbound === undefined
      ? plan?.outbound_minutes ?? null
      : nullableLimit(req.body.outboundMinutes, req.body.unlimitedOutbound),
    inboundMinutes: req.body.inboundMinutes === undefined && req.body.unlimitedInbound === undefined
      ? plan?.inbound_minutes ?? null
      : nullableLimit(req.body.inboundMinutes, req.body.unlimitedInbound),
    featuresJson: JSON.stringify(req.body.features || parseJson(plan?.features_json, { ALL: true }))
  };

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO tenants
        (id,name,workspace,status,plan_id,price_per_user,max_users,outbound_minutes,inbound_minutes,features_json,
         extension_start,next_extension,timezone,country,billing_cycle)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        name,
        workspace,
        req.body.status || "ACTIVE",
        plan?.id || null,
        effective.pricePerUser,
        effective.maxUsers,
        effective.outboundMinutes,
        effective.inboundMinutes,
        effective.featuresJson,
        extensionStart,
        extensionStart,
        String(req.body.timezone || "UTC"),
        String(req.body.country || "").trim() || null,
        req.body.billingCycle === "ANNIVERSARY" ? "ANNIVERSARY" : "CALENDAR_MONTH"
      ]
    );

    const roleIds = await createDefaultTenantRoles(connection, id);
    const ownerId = crypto.randomUUID();
    await connection.execute(
      `INSERT INTO users
        (id,tenant_id,email,name,role,role_id,password_hash,team_name,status,active)
       VALUES (?,?,?,?,?,?,?,?, 'OFFLINE',1)`,
      [ownerId, id, ownerEmail, ownerName, "ADMIN", roleIds["Tenant Owner"], await hashPassword(ownerPassword), "Administration"]
    );

    const dids = Array.isArray(req.body.dids) ? req.body.dids : [];
    for (const did of dids) {
      const digits = normalizeDid(did);
      if (!digits) continue;
      await connection.execute(
        `INSERT INTO tenant_dids (id,tenant_id,number,status) VALUES (?,?,?,'AVAILABLE')`,
        [crypto.randomUUID(), id, digits]
      );
    }
    await connection.commit();

    try {
      await syncTenantRouting({ tenantId: id, status: req.body.status || "ACTIVE" });
    } catch (error) {
      console.error("Tenant Asterisk status sync failed:", error.message);
    }

    res.status(201).json({ id, workspace, ownerEmail });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.patch("/api/super-admin/tenants/:id", authenticateSuperAdmin, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM tenants WHERE id=? LIMIT 1", [req.params.id]);
  const tenant = rows[0];
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  const status = req.body.status ?? tenant.status;
  const allowedStatuses = ["TRIAL", "ACTIVE", "INACTIVE", "SUSPENDED", "CANCELLED"];
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid tenant status" });
  await db.execute(
    `UPDATE tenants SET name=?,status=?,plan_id=?,price_per_user=?,max_users=?,outbound_minutes=?,inbound_minutes=?,features_json=?,timezone=? WHERE id=?`,
    [
      req.body.name ?? tenant.name,
      status,
      req.body.planId === undefined ? tenant.plan_id : req.body.planId || null,
      req.body.pricePerUser === undefined ? tenant.price_per_user : Number(req.body.pricePerUser),
      req.body.maxUsers === undefined && req.body.unlimitedUsers === undefined ? tenant.max_users : nullableLimit(req.body.maxUsers, req.body.unlimitedUsers),
      req.body.outboundMinutes === undefined && req.body.unlimitedOutbound === undefined ? tenant.outbound_minutes : nullableLimit(req.body.outboundMinutes, req.body.unlimitedOutbound),
      req.body.inboundMinutes === undefined && req.body.unlimitedInbound === undefined ? tenant.inbound_minutes : nullableLimit(req.body.inboundMinutes, req.body.unlimitedInbound),
      req.body.features === undefined ? tenant.features_json : JSON.stringify(req.body.features || {}),
      req.body.timezone ?? tenant.timezone,
      req.params.id
    ]
  );
  try {
    await syncTenantRouting({ tenantId: tenant.id, status });
    await syncTenantAsteriskPermissions(tenant.id);
  } catch (error) {
    console.error("Tenant Asterisk status sync failed:", error.message);
  }
  res.status(204).end();
}));

app.post("/api/super-admin/tenants/:id/dids", authenticateSuperAdmin, asyncRoute(async (req, res) => {
  const number = normalizeDid(req.body.number);
  if (!number) return res.status(400).json({ error: "Valid DID is required" });
  const [tenantRows] = await db.execute("SELECT id FROM tenants WHERE id=?", [req.params.id]);
  if (!tenantRows[0]) return res.status(404).json({ error: "Tenant not found" });
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO tenant_dids (id,tenant_id,number,label,status) VALUES (?,?,?,?, 'AVAILABLE')`,
    [id, req.params.id, number, String(req.body.label || "").trim() || null]
  );
  res.status(201).json({ id, number });
}));

app.get("/api/super-admin/tenants/:id/usage", authenticateSuperAdmin, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM tenants WHERE id=? LIMIT 1", [req.params.id]);
  const tenant = rows[0];
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  const usage = await tenantUsageSummary(tenant.id);
  const activeUsers = await tenantSeatCount(tenant.id, true);
  res.json({
    tenant: { id: tenant.id, name: tenant.name, workspace: tenant.workspace },
    usage,
    activeUsers,
    estimatedSeatRevenue: activeUsers * Number(tenant.price_per_user || 0),
    limits: {
      maxUsers: tenant.max_users,
      outboundMinutes: tenant.outbound_minutes,
      inboundMinutes: tenant.inbound_minutes
    }
  });
}));

// ---------------------------
// Tenant authentication
// ---------------------------
app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const attemptKey = `${req.ip}:${String(req.body.workspace || "legacy").toLowerCase()}`;
  const attempt = loginAttempts.get(attemptKey) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  if (Date.now() > attempt.resetAt) {
    attempt.count = 0;
    attempt.resetAt = Date.now() + 15 * 60 * 1000;
  }
  if (attempt.count >= 8) {
    res.setHeader("Retry-After", Math.ceil((attempt.resetAt - Date.now()) / 1000));
    return res.status(429).json({ error: "Too many login attempts; try again later" });
  }

  const workspace = normalizeWorkspace(req.body.workspace || "legacy");
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const [rows] = await db.execute(
    `SELECT u.id,u.password_hash
       FROM users u JOIN tenants t ON t.id=u.tenant_id
      WHERE t.workspace=? AND u.email=? LIMIT 1`,
    [workspace, email]
  );
  const candidate = rows[0];
  const user = candidate ? await loadTenantUser(candidate.id) : null;
  if (!user || !(await verifyPassword(password, candidate.password_hash))) {
    attempt.count += 1;
    loginAttempts.set(attemptKey, attempt);
    return res.status(401).json({ error: "Invalid workspace, email or password" });
  }

  loginAttempts.delete(attemptKey);
  await db.execute("UPDATE users SET last_login_at=UTC_TIMESTAMP() WHERE id=?", [user.id]);
  await audit(user.id, "AUTH_LOGIN", "user", user.id, { ip: req.ip, workspace }, user.tenant_id);
  res.json({ token: signToken(user), ...authPayload(user) });
}));

app.get("/api/auth/session", authenticate, (req, res) => res.json(authPayload(req.user)));

app.post("/api/auth/logout", authenticate, asyncRoute(async (req, res) => {
  await audit(req.user.id, "AUTH_LOGOUT", "user", req.user.id, { ip: req.ip }, req.user.tenant_id);
  res.status(204).end();
}));

// ---------------------------
// Dynamic RBAC
// ---------------------------
app.get("/api/permissions", authenticate, requirePermission("VIEW_ROLES", "MANAGE_ROLES"), (_req, res) => {
  res.json({ permissions: PERMISSIONS });
});

app.get("/api/roles", authenticate, requirePermission("VIEW_ROLES", "MANAGE_ROLES", "VIEW_AGENTS", "MANAGE_AGENTS"), asyncRoute(async (req, res) => {
  const [roles] = await db.execute(
    `SELECT id,name,description,is_system,active,created_at FROM roles WHERE tenant_id=? ORDER BY is_system DESC,name ASC`,
    [req.user.tenant_id]
  );
  for (const role of roles) {
    role.permissions = await loadRolePermissions(role.id, req.user);
  }
  res.json({ roles });
}));

app.post("/api/roles", authenticate, requirePermission("MANAGE_ROLES"), asyncRoute(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim() || null;
  if (!name) return res.status(400).json({ error: "Role name is required" });
  const requested = [...new Set(Array.isArray(req.body.permissions) ? req.body.permissions.map(String) : [])];
  const allowedKeys = requested.filter((key) => PERMISSIONS.some((item) => item.key === key) && tenantFeatureEnabled(req.user, key));
  const id = crypto.randomUUID();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO roles (id,tenant_id,name,description,is_system,active) VALUES (?,?,?,?,0,1)`,
      [id, req.user.tenant_id, name, description]
    );
    if (allowedKeys.length) {
      const [permissionRows] = await connection.query(
        `SELECT id FROM permissions WHERE permission_key IN (${allowedKeys.map(() => "?").join(",")})`,
        allowedKeys
      );
      for (const permission of permissionRows) {
        await connection.execute("INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?)", [id, permission.id]);
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await audit(req.user.id, "ROLE_CREATE", "role", id, { name, permissions: allowedKeys }, req.user.tenant_id);
  res.status(201).json({ id });
}));

app.patch("/api/roles/:id", authenticate, requirePermission("MANAGE_ROLES"), asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM roles WHERE id=? AND tenant_id=? LIMIT 1", [req.params.id, req.user.tenant_id]);
  const role = rows[0];
  if (!role) return res.status(404).json({ error: "Role not found" });
  if (role.is_system && (req.body.name !== undefined || req.body.permissions !== undefined)) {
    return res.status(409).json({ error: "System role name and permissions are protected; create a custom role instead" });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      "UPDATE roles SET name=?,description=?,active=? WHERE id=? AND tenant_id=?",
      [req.body.name ?? role.name, req.body.description ?? role.description, req.body.active === undefined ? role.active : Number(Boolean(req.body.active)), role.id, req.user.tenant_id]
    );
    if (req.body.permissions !== undefined) {
      const requested = [...new Set(Array.isArray(req.body.permissions) ? req.body.permissions.map(String) : [])]
        .filter((key) => PERMISSIONS.some((item) => item.key === key) && tenantFeatureEnabled(req.user, key));
      await connection.execute("DELETE FROM role_permissions WHERE role_id=?", [role.id]);
      if (requested.length) {
        const [permissionRows] = await connection.query(
          `SELECT id FROM permissions WHERE permission_key IN (${requested.map(() => "?").join(",")})`, requested
        );
        for (const permission of permissionRows) {
          await connection.execute("INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?)", [role.id, permission.id]);
        }
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    await syncRoleAsteriskPermissions({
      tenantId: req.user.tenant_id,
      roleId: role.id,
      tenant: req.user
    });
  } catch (error) {
    console.error("Role Asterisk permission sync failed:", error.message);
  }

  res.status(204).end();
}));

app.delete("/api/roles/:id", authenticate, requirePermission("MANAGE_ROLES"), asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM roles WHERE id=? AND tenant_id=? LIMIT 1", [req.params.id, req.user.tenant_id]);
  const role = rows[0];
  if (!role) return res.status(404).json({ error: "Role not found" });
  if (role.is_system) return res.status(409).json({ error: "System roles cannot be deleted" });
  const [[usage]] = await db.execute("SELECT COUNT(*) AS total FROM users WHERE tenant_id=? AND role_id=?", [req.user.tenant_id, role.id]);
  if (Number(usage.total) > 0) return res.status(409).json({ error: `${usage.total} users currently use this role` });
  await db.execute("DELETE FROM role_permissions WHERE role_id=?", [role.id]);
  await db.execute("DELETE FROM roles WHERE id=? AND tenant_id=?", [role.id, req.user.tenant_id]);
  res.status(204).end();
}));

// ---------------------------
// Tenant users / agents
// ---------------------------
app.get("/api/users", authenticate, requirePermission("VIEW_AGENTS", "MANAGE_AGENTS", "MONITOR_CALLS"), asyncRoute(async (req, res) => {
  const params = [req.user.tenant_id];
  let where = "WHERE u.tenant_id=?";

  if (isSupervisor(req.user)) {
    const scopedIds = await supervisorAgentIdsForPrivilege(req.user.id, req.user.tenant_id, "VIEW_TEAM_MEMBERS");
    const visibleIds = [...new Set([req.user.id, ...scopedIds])];
    if (!visibleIds.length) where += " AND 1=0";
    else {
      where += ` AND u.id IN (${visibleIds.map(() => "?").join(",")})`;
      params.push(...visibleIds);
    }
  }

  const [rows] = await db.execute(
    `SELECT u.id,u.tenant_id,u.email,u.name,u.role,u.role_id,u.sip_username,u.extension,u.caller_id_number,
            u.team_name,u.status,u.active,u.last_login_at,u.created_at,r.name AS role_name,
            (SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '||')
               FROM team_members tm JOIN teams t ON t.id=tm.team_id AND t.tenant_id=tm.tenant_id
              WHERE tm.tenant_id=u.tenant_id AND tm.user_id=u.id AND tm.active=1 AND t.active=1) AS team_names
       FROM users u LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
       ${where}
      ORDER BY (r.name='Tenant Owner') DESC,u.active DESC,u.name ASC`,
    params
  );

  res.json({
    users: rows.map((row) => ({
      ...sanitizeUser(row),
      teamNames: row.team_names ? String(row.team_names).split("||").filter(Boolean) : []
    }))
  });
}));

app.post("/api/users", authenticate, requirePermission("MANAGE_AGENTS"), asyncRoute(async (req, res) => {
  const id = crypto.randomUUID();
  const email = String(req.body.email || "").trim().toLowerCase();
  const name = String(req.body.name || "").trim();
  const password = String(req.body.password || "");
  const roleId = String(req.body.roleId || "").trim();
  const teamName = String(req.body.teamName || "Default").trim() || "Default";
  const generateSipAccount = req.body.generateSipAccount === true || String(req.body.generateSipAccount || "").toLowerCase() === "true";
  if (!email || !name || !roleId) return res.status(400).json({ error: "Name, email and role are required" });

  const [roleRows] = await db.execute("SELECT * FROM roles WHERE id=? AND tenant_id=? AND active=1 LIMIT 1", [roleId, req.user.tenant_id]);
  const role = roleRows[0];
  if (!role) return res.status(400).json({ error: "Selected role is not available in this workspace" });
  if (isTenantOwnerRoleName(role.name)) {
    return res.status(409).json({ error: "The Tenant Owner account is created with the workspace and cannot be added as a billable user" });
  }

  await assertTenantUserCapacity(req.user.tenant_id);

  let callerIdNumber = null;
  let didRecord = null;
  if (req.body.callerIdNumber) {
    if (!generateSipAccount) return res.status(400).json({ error: "A DID can only be assigned to a SIP-enabled user" });
    didRecord = await resolveTenantDid(req.user.tenant_id, req.body.callerIdNumber);
    if (!didRecord) return res.status(400).json({ error: "Selected DID is not assigned to this workspace" });
    if (didRecord.assigned_user_id) return res.status(409).json({ error: "Selected DID is already assigned to another user" });
    callerIdNumber = didRecord.number;
  }

  let generatedSip = null;
  let extension = null;
  let userInserted = false;
  try {
    if (generateSipAccount) {
      extension = await allocateTenantExtension(req.user.tenant_id, id);
      generatedSip = await provisionTenantSipAccount({
        tenantId: req.user.tenant_id,
        extension,
        displayName: name
      });
    }

    await db.execute(
      `INSERT INTO users
        (id,tenant_id,email,name,role,role_id,password_hash,sip_username,sip_secret_ciphertext,extension,caller_id_number,team_name,status,active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'OFFLINE',1)`,
      [
        id,
        req.user.tenant_id,
        email,
        name,
        legacyRoleForRoleName(role.name),
        role.id,
        await hashPassword(password),
        generatedSip?.sipUsername || null,
        generatedSip?.sipPassword ? encryptSipSecret(generatedSip.sipPassword) : null,
        extension,
        callerIdNumber,
        teamName
      ]
    );
    userInserted = true;

    if (didRecord) {
      await db.execute(
        `UPDATE tenant_dids SET assigned_user_id=?,status='ASSIGNED' WHERE id=? AND tenant_id=?`,
        [id, didRecord.id, req.user.tenant_id]
      );
    }

    if (generatedSip) {
      try {
        await syncTenantRouting({
          tenantId: req.user.tenant_id,
          sipUsername: generatedSip.sipUsername,
          extension,
          status: req.user.tenant_status
        });
        if (callerIdNumber) await syncAgentDid(generatedSip.sipUsername, callerIdNumber);
        await syncAgentAsteriskPermissions({
          sipUsername: generatedSip.sipUsername,
          roleId: role.id,
          tenant: req.user,
          active: true
        });
      } catch (error) {
        console.error("Asterisk mapping sync failed after user creation:", error.message);
      }
    }
  } catch (error) {
    if (userInserted) await db.execute("DELETE FROM users WHERE id=? AND tenant_id=?", [id, req.user.tenant_id]).catch(() => undefined);
    if (generatedSip?.sipUsername) await deprovisionSipAccount(generatedSip.sipUsername).catch(() => undefined);
    if (extension) await releaseTenantExtension(req.user.tenant_id, id).catch(() => undefined);
    if (didRecord) await db.execute("UPDATE tenant_dids SET assigned_user_id=NULL,status='AVAILABLE' WHERE id=?", [didRecord.id]).catch(() => undefined);
    throw error;
  }

  await audit(req.user.id, "USER_CREATE", "user", id, {
    email,
    roleId: role.id,
    roleName: role.name,
    sipUsername: generatedSip?.sipUsername || null,
    extension,
    callerIdNumber,
    sipGenerated: Boolean(generatedSip)
  }, req.user.tenant_id);

  res.status(201).json({
    id,
    sipUsername: generatedSip?.sipUsername || null,
    extension,
    sipGenerated: Boolean(generatedSip)
  });
}));

app.patch("/api/users/:id", authenticate, requirePermission("MANAGE_AGENTS"), asyncRoute(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT u.*,r.name AS role_name
       FROM users u LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
      WHERE u.id=? AND u.tenant_id=? LIMIT 1`,
    [req.params.id, req.user.tenant_id]
  );
  const current = rows[0];
  if (!current) return res.status(404).json({ error: "User not found" });

  if (isTenantOwnerRoleName(current.role_name)) {
    const protectedFields = ["roleId", "callerIdNumber", "teamName", "active", "generateSipAccount"];
    if (protectedFields.some((key) => Object.prototype.hasOwnProperty.call(req.body, key))) {
      return res.status(409).json({ error: "Tenant Owner telephony, role and seat settings are protected" });
    }
  }

  let roleId = current.role_id;
  let legacyRole = current.role;
  if (req.body.roleId !== undefined) {
    const [roleRows] = await db.execute("SELECT * FROM roles WHERE id=? AND tenant_id=? AND active=1 LIMIT 1", [req.body.roleId, req.user.tenant_id]);
    const requestedRole = roleRows[0];
    if (!requestedRole) return res.status(400).json({ error: "Selected role is not available in this workspace" });
    if (isTenantOwnerRoleName(requestedRole.name)) {
      return res.status(409).json({ error: "Tenant Owner cannot be assigned to another user" });
    }
    roleId = requestedRole.id;
    legacyRole = legacyRoleForRoleName(requestedRole.name);
  }

  let callerIdNumber = current.caller_id_number;
  if (req.body.callerIdNumber !== undefined) {
    if (!current.sip_username && String(req.body.callerIdNumber || "").trim()) {
      return res.status(400).json({ error: "A DID can only be assigned to a SIP-enabled user" });
    }
    const requested = String(req.body.callerIdNumber || "").trim();
    if (!requested) {
      if (current.caller_id_number) {
        await db.execute(
          `UPDATE tenant_dids SET assigned_user_id=NULL,status='AVAILABLE'
            WHERE tenant_id=? AND assigned_user_id=?`,
          [req.user.tenant_id, current.id]
        );
      }
      callerIdNumber = null;
    } else {
      const did = await resolveTenantDid(req.user.tenant_id, requested);
      if (!did) return res.status(400).json({ error: "Selected DID is not assigned to this workspace" });
      if (did.assigned_user_id && did.assigned_user_id !== current.id) {
        return res.status(409).json({ error: "Selected DID is already assigned to another user" });
      }
      await db.execute(
        `UPDATE tenant_dids SET assigned_user_id=NULL,status='AVAILABLE'
          WHERE tenant_id=? AND assigned_user_id=? AND id<>?`,
        [req.user.tenant_id, current.id, did.id]
      );
      await db.execute("UPDATE tenant_dids SET assigned_user_id=?,status='ASSIGNED' WHERE id=?", [current.id, did.id]);
      callerIdNumber = did.number;
    }
  }

  const updates = {
    name: req.body.name ?? current.name,
    role_id: roleId,
    role: legacyRole,
    caller_id_number: callerIdNumber,
    team_name: req.body.teamName ?? current.team_name,
    active: req.body.active === undefined ? current.active : Number(Boolean(req.body.active)),
    password_hash: req.body.password ? await hashPassword(String(req.body.password)) : current.password_hash
  };

  if (!Number(current.active) && Number(updates.active) && !isTenantOwnerRoleName(current.role_name)) {
    await assertTenantUserCapacity(req.user.tenant_id);
  }

  await db.execute(
    `UPDATE users SET name=?,role=?,role_id=?,caller_id_number=?,team_name=?,active=?,password_hash=?
      WHERE id=? AND tenant_id=?`,
    [
      updates.name,
      updates.role,
      updates.role_id,
      updates.caller_id_number,
      updates.team_name,
      updates.active,
      updates.password_hash,
      current.id,
      req.user.tenant_id
    ]
  );

  if (current.sip_username) {
    try {
      const oldDid = normalizeDid(current.caller_id_number);
      const newDid = normalizeDid(updates.caller_id_number);
      if (oldDid && oldDid !== newDid) await clearAgentDid(current.sip_username, current.caller_id_number);
      if (newDid) await syncAgentDid(current.sip_username, updates.caller_id_number);
      else if (oldDid && oldDid === newDid) await clearAgentDid(current.sip_username, current.caller_id_number);

      await syncAgentAsteriskPermissions({
        sipUsername: current.sip_username,
        roleId: updates.role_id,
        tenant: req.user,
        active: Number(updates.active) === 1
      });
    } catch (error) { console.error("Agent Asterisk sync failed:", error.message); }
  }

  await audit(req.user.id, "USER_UPDATE", "user", current.id, {
    roleId: updates.role_id,
    active: updates.active,
    callerIdNumber: updates.caller_id_number
  }, req.user.tenant_id);
  res.status(204).end();
}));

app.post("/api/agent/status", authenticate, asyncRoute(async (req, res) => {
  if (isTenantOwner(req.user) || !req.user.sip_username) {
    return res.status(403).json({ error: "This account is not a telephony agent" });
  }
  const status = String(req.body.status || "").toUpperCase();
  if (!["READY", "PAUSED", "WRAP_UP", "OFFLINE"].includes(status)) return res.status(400).json({ error: "Invalid agent status" });
  await db.execute("UPDATE users SET status=? WHERE id=? AND tenant_id=?", [status, req.user.id, req.user.tenant_id]);
  const payload = { tenantId: req.user.tenant_id, userId: req.user.id, agent: req.user.sip_username, status, updatedAt: new Date().toISOString() };
  io.to(`tenant:${req.user.tenant_id}:live`).emit("agent:status", payload);
  try {
    const teamIds = await db.execute(
      `SELECT tm.team_id FROM team_members tm JOIN teams t ON t.id=tm.team_id AND t.tenant_id=tm.tenant_id
        WHERE tm.tenant_id=? AND tm.user_id=? AND tm.active=1 AND t.active=1`,
      [req.user.tenant_id, req.user.id]
    );
    for (const row of teamIds[0]) io.to(`tenant:${req.user.tenant_id}:team:${row.team_id}`).emit("agent:status", payload);
  } catch { /* migration compatibility */ }
  res.json(payload);
}));

// ---------------------------
// Team management
// ---------------------------
app.get("/api/teams", authenticate, requirePermission("VIEW_TEAMS", "MANAGE_TEAMS"), asyncRoute(async (req, res) => {
  const canManageAll = hasPermission(req.user, "MANAGE_TEAMS");
  let allowedTeamIds = null;
  if (isSupervisor(req.user) && !canManageAll) {
    allowedTeamIds = await supervisorTeamIdsForPrivilege(req.user.id, req.user.tenant_id, null);
  }

  const params = [req.user.tenant_id];
  let where = "WHERE t.tenant_id=?";
  if (Array.isArray(allowedTeamIds)) {
    if (!allowedTeamIds.length) where += " AND 1=0";
    else {
      where += ` AND t.id IN (${allowedTeamIds.map(() => "?").join(",")})`;
      params.push(...allowedTeamIds);
    }
  }

  const [teamRows] = await db.execute(
    `SELECT t.id,t.name,t.description,t.active,t.created_at,t.updated_at,
            ts.supervisor_user_id,ts.privileges_json,
            su.name AS supervisor_name,su.email AS supervisor_email
       FROM teams t
       LEFT JOIN team_supervisors ts ON ts.team_id=t.id AND ts.tenant_id=t.tenant_id
       LEFT JOIN users su ON su.id=ts.supervisor_user_id AND su.tenant_id=t.tenant_id
       ${where}
      ORDER BY t.active DESC,t.name ASC`,
    params
  );

  const teamIds = teamRows.map((team) => team.id);
  let memberRows = [];
  if (teamIds.length) {
    [memberRows] = await db.query(
      `SELECT tm.team_id,u.id,u.name,u.email,u.sip_username,u.extension,u.status,u.active,r.name AS role_name
         FROM team_members tm
         JOIN users u ON u.id=tm.user_id AND u.tenant_id=tm.tenant_id
         LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
        WHERE tm.tenant_id=? AND tm.active=1 AND tm.team_id IN (${teamIds.map(() => "?").join(",")})
        ORDER BY u.name ASC`,
      [req.user.tenant_id, ...teamIds]
    );
  }

  const teams = [];
  for (const team of teamRows) {
    const access = canManageAll
      ? { global: true, privileges: Object.fromEntries(TEAM_PRIVILEGES.map(({ key }) => [key, true])) }
      : await supervisorTeamAccess(req.user.id, req.user.tenant_id, team.id);
    const flags = teamAccessFlags(access);
    teams.push({
      id: team.id,
      name: team.name,
      description: team.description,
      active: Boolean(team.active),
      supervisor: team.supervisor_user_id ? {
        id: team.supervisor_user_id,
        name: team.supervisor_name,
        email: team.supervisor_email
      } : null,
      supervisorPrivileges: parseTeamPrivileges(team.privileges_json),
      access: flags,
      members: flags.canViewMembers
        ? memberRows.filter((member) => member.team_id === team.id).map((member) => ({
            id: member.id,
            name: member.name,
            email: member.email,
            sipUsername: member.sip_username,
            extension: member.extension,
            status: member.status,
            active: Boolean(member.active),
            roleName: member.role_name || "User"
          }))
        : [],
      memberCount: memberRows.filter((member) => member.team_id === team.id).length
    });
  }

  const mayAddMembers = canManageAll || teams.some((team) => team.access.canAddMembers);
  let memberCandidates = [];
  if (mayAddMembers) {
    const [rows] = await db.execute(
      `SELECT u.id,u.name,u.email,u.sip_username,u.extension,r.name AS role_name
         FROM users u LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
        WHERE u.tenant_id=? AND u.active=1 AND COALESCE(r.name,'')<>'Tenant Owner'
        ORDER BY u.name ASC`,
      [req.user.tenant_id]
    );
    memberCandidates = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      sipUsername: row.sip_username,
      extension: row.extension,
      roleName: row.role_name || "User"
    }));
  }

  let supervisors = [];
  if (canManageAll) {
    const [rows] = await db.execute(
      `SELECT u.id,u.name,u.email,u.extension
         FROM users u JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
        WHERE u.tenant_id=? AND u.active=1 AND r.name='Supervisor'
        ORDER BY u.name ASC`,
      [req.user.tenant_id]
    );
    supervisors = rows;
  }

  res.json({
    teams,
    supervisors,
    memberCandidates,
    teamPrivileges: TEAM_PRIVILEGES,
    defaultSupervisorPrivileges: DEFAULT_TEAM_PRIVILEGES,
    canManageAll
  });
}));

app.post("/api/teams", authenticate, requirePermission("MANAGE_TEAMS"), asyncRoute(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim() || null;
  const supervisorUserId = String(req.body.supervisorUserId || "").trim();
  const memberIds = [...new Set(Array.isArray(req.body.memberIds) ? req.body.memberIds.map(String).filter(Boolean) : [])];
  if (!name || !supervisorUserId) return res.status(400).json({ error: "Team name and Supervisor are required" });

  const [supervisorRows] = await db.execute(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
      WHERE u.id=? AND u.tenant_id=? AND u.active=1 AND r.name='Supervisor' LIMIT 1`,
    [supervisorUserId, req.user.tenant_id]
  );
  if (!supervisorRows[0]) return res.status(400).json({ error: "Selected Supervisor must have the Supervisor role" });

  if (memberIds.length) {
    const [validMembers] = await db.query(
      `SELECT u.id FROM users u LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
        WHERE u.tenant_id=? AND u.active=1 AND COALESCE(r.name,'')<>'Tenant Owner'
          AND u.id IN (${memberIds.map(() => "?").join(",")})`,
      [req.user.tenant_id, ...memberIds]
    );
    if (validMembers.length !== memberIds.length) return res.status(400).json({ error: "One or more team members are invalid" });
  }

  const id = crypto.randomUUID();
  const privileges = normalizeTeamPrivileges(req.body.supervisorPrivileges || DEFAULT_TEAM_PRIVILEGES);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO teams (id,tenant_id,name,description,active,created_by_user_id) VALUES (?,?,?,?,1,?)`,
      [id, req.user.tenant_id, name, description, req.user.id]
    );
    await connection.execute(
      `INSERT INTO team_supervisors (team_id,tenant_id,supervisor_user_id,privileges_json) VALUES (?,?,?,?)`,
      [id, req.user.tenant_id, supervisorUserId, JSON.stringify(privileges)]
    );
    for (const userId of memberIds) {
      await connection.execute(
        `INSERT INTO team_members (team_id,tenant_id,user_id,active,added_by_user_id) VALUES (?,?,?,1,?)`,
        [id, req.user.tenant_id, userId, req.user.id]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await audit(req.user.id, "TEAM_CREATE", "team", id, { name, supervisorUserId, memberIds, privileges }, req.user.tenant_id);
  res.status(201).json({ id });
}));

app.patch("/api/teams/:id", authenticate, asyncRoute(async (req, res) => {
  const access = await teamActionAccess(req.user, req.params.id, "EDIT_TEAM_SETTINGS");
  if (!access) return res.status(403).json({ error: "You do not have permission to edit this team" });

  const [rows] = await db.execute("SELECT * FROM teams WHERE id=? AND tenant_id=? LIMIT 1", [req.params.id, req.user.tenant_id]);
  const team = rows[0];
  if (!team) return res.status(404).json({ error: "Team not found" });

  const name = String(req.body.name ?? team.name).trim();
  const description = req.body.description === undefined ? team.description : String(req.body.description || "").trim() || null;
  const active = access.global && req.body.active !== undefined ? Number(Boolean(req.body.active)) : team.active;
  if (!name) return res.status(400).json({ error: "Team name is required" });

  await db.execute("UPDATE teams SET name=?,description=?,active=? WHERE id=? AND tenant_id=?", [name, description, active, team.id, req.user.tenant_id]);

  if (access.global && (req.body.supervisorUserId !== undefined || req.body.supervisorPrivileges !== undefined)) {
    const [currentRows] = await db.execute("SELECT * FROM team_supervisors WHERE team_id=? AND tenant_id=? LIMIT 1", [team.id, req.user.tenant_id]);
    const current = currentRows[0];
    const supervisorUserId = String(req.body.supervisorUserId ?? current?.supervisor_user_id ?? "").trim();
    if (!supervisorUserId) return res.status(400).json({ error: "A team must have a Supervisor" });
    const [supervisorRows] = await db.execute(
      `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
        WHERE u.id=? AND u.tenant_id=? AND u.active=1 AND r.name='Supervisor' LIMIT 1`,
      [supervisorUserId, req.user.tenant_id]
    );
    if (!supervisorRows[0]) return res.status(400).json({ error: "Selected Supervisor must have the Supervisor role" });
    const privileges = req.body.supervisorPrivileges === undefined
      ? parseTeamPrivileges(current?.privileges_json)
      : normalizeTeamPrivileges(req.body.supervisorPrivileges);
    await db.execute(
      `INSERT INTO team_supervisors (team_id,tenant_id,supervisor_user_id,privileges_json)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE supervisor_user_id=VALUES(supervisor_user_id),privileges_json=VALUES(privileges_json)`,
      [team.id, req.user.tenant_id, supervisorUserId, JSON.stringify(privileges)]
    );
  }

  await audit(req.user.id, "TEAM_UPDATE", "team", team.id, { name, active }, req.user.tenant_id);
  res.status(204).end();
}));

app.post("/api/teams/:id/members", authenticate, asyncRoute(async (req, res) => {
  const access = await teamActionAccess(req.user, req.params.id, "ADD_TEAM_MEMBERS");
  if (!access) return res.status(403).json({ error: "You do not have permission to add team members" });
  const userId = String(req.body.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "User is required" });
  const [rows] = await db.execute(
    `SELECT u.id,r.name AS role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
      WHERE u.id=? AND u.tenant_id=? AND u.active=1 LIMIT 1`,
    [userId, req.user.tenant_id]
  );
  if (!rows[0] || isTenantOwnerRoleName(rows[0].role_name)) return res.status(400).json({ error: "Selected user cannot be added to a team" });
  await db.execute(
    `INSERT INTO team_members (team_id,tenant_id,user_id,active,added_by_user_id)
     VALUES (?,?,?,1,?)
     ON DUPLICATE KEY UPDATE active=1,added_by_user_id=VALUES(added_by_user_id)`,
    [req.params.id, req.user.tenant_id, userId, req.user.id]
  );
  await audit(req.user.id, "TEAM_MEMBER_ADD", "team", req.params.id, { userId }, req.user.tenant_id);
  res.status(204).end();
}));

app.delete("/api/teams/:id/members/:userId", authenticate, asyncRoute(async (req, res) => {
  const access = await teamActionAccess(req.user, req.params.id, "REMOVE_TEAM_MEMBERS");
  if (!access) return res.status(403).json({ error: "You do not have permission to remove team members" });
  await db.execute(
    `UPDATE team_members SET active=0 WHERE team_id=? AND tenant_id=? AND user_id=?`,
    [req.params.id, req.user.tenant_id, req.params.userId]
  );
  await audit(req.user.id, "TEAM_MEMBER_REMOVE", "team", req.params.id, { userId: req.params.userId }, req.user.tenant_id);
  res.status(204).end();
}));

app.delete("/api/teams/:id", authenticate, requirePermission("MANAGE_TEAMS"), asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT id FROM teams WHERE id=? AND tenant_id=? LIMIT 1", [req.params.id, req.user.tenant_id]);
  if (!rows[0]) return res.status(404).json({ error: "Team not found" });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("DELETE FROM team_members WHERE team_id=? AND tenant_id=?", [req.params.id, req.user.tenant_id]);
    await connection.execute("DELETE FROM team_supervisors WHERE team_id=? AND tenant_id=?", [req.params.id, req.user.tenant_id]);
    await connection.execute("DELETE FROM teams WHERE id=? AND tenant_id=?", [req.params.id, req.user.tenant_id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await audit(req.user.id, "TEAM_DELETE", "team", req.params.id, {}, req.user.tenant_id);
  res.status(204).end();
}));

// ---------------------------
// DIDs and contacts
// ---------------------------
app.get("/api/dids", authenticate, requirePermission("VIEW_DIDS", "MANAGE_DIDS", "MANAGE_AGENTS"), asyncRoute(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT d.id,d.number,d.label,d.status,d.assigned_user_id,u.name AS assigned_user_name
       FROM tenant_dids d LEFT JOIN users u ON u.id=d.assigned_user_id AND u.tenant_id=d.tenant_id
      WHERE d.tenant_id=? ORDER BY d.number ASC`,
    [req.user.tenant_id]
  );
  res.json({ dids: rows });
}));

app.get("/api/contacts", authenticate, requirePermission("VIEW_CONTACTS"), asyncRoute(async (req, res) => {
  const search = String(req.query.search || "").slice(0, 80);
  const term = `%${search}%`;
  const [rows] = await db.execute(
    `SELECT id,first_name,last_name,company,phone,email,notes,created_at,updated_at
       FROM contacts
      WHERE tenant_id=? AND (?='' OR first_name LIKE ? OR last_name LIKE ? OR company LIKE ? OR phone LIKE ? OR email LIKE ?)
      ORDER BY first_name,last_name LIMIT 500`,
    [req.user.tenant_id, search, term, term, term, term, term]
  );
  res.json({ contacts: rows });
}));

app.post("/api/contacts", authenticate, requirePermission("CREATE_CONTACTS"), asyncRoute(async (req, res) => {
  const firstName = String(req.body.firstName || "").trim();
  if (!firstName) return res.status(400).json({ error: "First name is required" });
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO contacts (id,tenant_id,owner_user_id,first_name,last_name,company,phone,email,notes)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      id, req.user.tenant_id, req.user.id, firstName,
      String(req.body.lastName || "").trim() || null,
      String(req.body.company || "").trim() || null,
      String(req.body.phone || "").trim() || null,
      String(req.body.email || "").trim().toLowerCase() || null,
      String(req.body.notes || "").slice(0, 4000) || null
    ]
  );
  res.status(201).json({ id });
}));

app.patch("/api/contacts/:id", authenticate, requirePermission("EDIT_CONTACTS"), asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM contacts WHERE id=? AND tenant_id=? LIMIT 1", [req.params.id, req.user.tenant_id]);
  const contact = rows[0];
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  await db.execute(
    `UPDATE contacts SET first_name=?,last_name=?,company=?,phone=?,email=?,notes=? WHERE id=? AND tenant_id=?`,
    [
      req.body.firstName ?? contact.first_name,
      req.body.lastName ?? contact.last_name,
      req.body.company ?? contact.company,
      req.body.phone ?? contact.phone,
      req.body.email ?? contact.email,
      req.body.notes ?? contact.notes,
      contact.id,
      req.user.tenant_id
    ]
  );
  res.status(204).end();
}));

app.delete("/api/contacts/:id", authenticate, requirePermission("DELETE_CONTACTS"), asyncRoute(async (req, res) => {
  const [result] = await db.execute("DELETE FROM contacts WHERE id=? AND tenant_id=?", [req.params.id, req.user.tenant_id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Contact not found" });
  res.status(204).end();
}));

// ---------------------------
// Calls, recordings, reports
// ---------------------------
app.get("/api/calls", authenticate, requirePermission("VIEW_CALL_LOGS"), asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
  const scope = await callAccessScope(req.user, "VIEW_TEAM_CALL_LOGS");
  const params = [req.user.tenant_id];
  let where = "WHERE c.tenant_id=?";
  where = appendCallAgentScope(where, params, scope);
  where = appendRequestedAgent(where, params, scope, req.query.agentId);

  const from = normalizeDateFilter(req.query.from);
  const to = normalizeDateFilter(req.query.to);
  if (from) { where += " AND c.started_at>=?"; params.push(`${from} 00:00:00`); }
  if (to) { where += " AND c.started_at<DATE_ADD(?,INTERVAL 1 DAY)"; params.push(`${to} 00:00:00`); }

  const direction = String(req.query.direction || "").toUpperCase();
  if (["INBOUND", "OUTBOUND"].includes(direction)) { where += " AND c.direction=?"; params.push(direction); }
  const status = String(req.query.status || "").toUpperCase();
  if (status) { where += " AND c.status=?"; params.push(status.slice(0, 32)); }

  if (req.query.search) {
    where += " AND (c.from_number LIKE ? OR c.to_number LIKE ? OR c.agent_sip_username LIKE ? OR u.name LIKE ?)";
    const term = `%${String(req.query.search).slice(0, 64)}%`;
    params.push(term, term, term, term);
  }

  const fromSql = "FROM calls c LEFT JOIN users u ON u.id=c.agent_user_id AND u.tenant_id=c.tenant_id";
  const [[count]] = await db.execute(`SELECT COUNT(*) AS total ${fromSql} ${where}`, params);
  const [rows] = await db.execute(
    `SELECT c.id,c.linkedid,c.agent_user_id,c.agent_sip_username,u.name AS agent_name,c.direction,c.from_number,c.to_number,c.status,
            c.disposition,c.started_at,c.answered_at,c.ended_at,c.duration_sec,c.billable_sec,
            c.hangup_cause,c.recording_name
       ${fromSql} ${where} ORDER BY c.started_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  res.json({ rows, page, pageSize, total: Number(count.total || 0) });
}));

app.patch("/api/calls/:id", authenticate, requirePermission("EDIT_CALL_DISPOSITION"), asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT agent_user_id FROM calls WHERE id=? AND tenant_id=? LIMIT 1", [req.params.id, req.user.tenant_id]);
  const call = rows[0];
  if (!call) return res.status(404).json({ error: "Call not found" });
  const scope = await callAccessScope(req.user, "VIEW_TEAM_CALL_LOGS");
  if (scope.type === "agents" && !scope.agentIds.includes(call.agent_user_id)) return res.status(403).json({ error: "Not your call" });
  const disposition = String(req.body.disposition || "").slice(0, 64) || null;
  const notes = String(req.body.notes || "").slice(0, 2000) || null;
  await db.execute("UPDATE calls SET disposition=?,notes=? WHERE id=? AND tenant_id=?", [disposition, notes, req.params.id, req.user.tenant_id]);
  await audit(req.user.id, "CALL_DISPOSITION", "call", req.params.id, { disposition }, req.user.tenant_id);
  res.status(204).end();
}));

app.get("/api/recordings", authenticate, requirePermission("VIEW_RECORDINGS"), asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
  const scope = await callAccessScope(req.user, "VIEW_TEAM_RECORDINGS");
  const params = [req.user.tenant_id];
  let where = "WHERE c.tenant_id=? AND c.recording_name IS NOT NULL AND c.recording_name<>''";
  where = appendCallAgentScope(where, params, scope);
  where = appendRequestedAgent(where, params, scope, req.query.agentId);

  const from = normalizeDateFilter(req.query.from);
  const to = normalizeDateFilter(req.query.to);
  if (from) { where += " AND c.started_at>=?"; params.push(`${from} 00:00:00`); }
  if (to) { where += " AND c.started_at<DATE_ADD(?,INTERVAL 1 DAY)"; params.push(`${to} 00:00:00`); }
  if (req.query.search) {
    where += " AND (c.from_number LIKE ? OR c.to_number LIKE ? OR c.agent_sip_username LIKE ? OR u.name LIKE ?)";
    const term = `%${String(req.query.search).slice(0, 64)}%`;
    params.push(term, term, term, term);
  }

  const fromSql = "FROM calls c LEFT JOIN users u ON u.id=c.agent_user_id AND u.tenant_id=c.tenant_id";
  const [[count]] = await db.execute(`SELECT COUNT(*) AS total ${fromSql} ${where}`, params);
  const [rows] = await db.execute(
    `SELECT c.id,c.linkedid,c.agent_user_id,c.agent_sip_username,u.name AS agent_name,c.direction,c.from_number,c.to_number,
            c.status,c.started_at,c.billable_sec,c.recording_name
       ${fromSql} ${where} ORDER BY c.started_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  res.json({ rows, page, pageSize, total: Number(count.total || 0) });
}));

app.get("/api/recordings/:callId", authenticate, requirePermission("VIEW_RECORDINGS"), asyncRoute(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT c.id,c.agent_user_id,c.recording_path,c.recording_name
       FROM calls c WHERE c.id=? AND c.tenant_id=? LIMIT 1`,
    [req.params.callId, req.user.tenant_id]
  );
  const call = rows[0];
  if (!call?.recording_path) return res.status(404).json({ error: "Recording not found" });
  const scope = await callAccessScope(req.user, "VIEW_TEAM_RECORDINGS");
  if (scope.type === "agents" && !scope.agentIds.includes(call.agent_user_id)) return res.status(403).json({ error: "Recording access denied" });
  const candidate = path.isAbsolute(call.recording_path) ? path.resolve(call.recording_path) : path.resolve(config.recordingRoot, call.recording_path);
  if (!candidate.startsWith(`${config.recordingRoot}${path.sep}`)) return res.status(403).json({ error: "Invalid recording path" });
  const stat = await fs.promises.stat(candidate).catch(() => null);
  if (!stat?.isFile()) return res.status(404).json({ error: "Recording file is unavailable" });
  const range = req.headers.range;
  const contentType = candidate.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Disposition", `inline; filename="${path.basename(candidate).replace(/[\"\r\n]/g, "")}"`);
  if (!range) {
    res.setHeader("Content-Length", stat.size);
    return fs.createReadStream(candidate).pipe(res);
  }
  const match = range.match(/bytes=(\d*)-(\d*)/);
  const start = match?.[1] ? Number(match[1]) : 0;
  const end = match?.[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
  if (!match || start > end || start >= stat.size) return res.status(416).end();
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  res.setHeader("Content-Length", end - start + 1);
  fs.createReadStream(candidate, { start, end }).pipe(res);
}));

app.get("/api/dashboard/owner", authenticate, requirePermission("VIEW_REPORTS", "MANAGE_AGENTS"), asyncRoute(async (req, res) => {
  const scope = await callAccessScope(req.user, "VIEW_TEAM_REPORTS");
  const today = new Date().toISOString().slice(0, 10);
  const from = normalizeDateFilter(req.query.from) || today;
  const to = normalizeDateFilter(req.query.to) || from;
  if (to < from) return res.status(400).json({ error: "End date cannot be before start date" });

  const agentParams = [req.user.tenant_id];
  let agentWhere = `WHERE u.tenant_id=? AND u.sip_username IS NOT NULL AND COALESCE(r.name,'')<>'Tenant Owner'`;
  if (scope.type === "agents") {
    if (!scope.agentIds.length) agentWhere += " AND 1=0";
    else {
      agentWhere += ` AND u.id IN (${scope.agentIds.map(() => "?").join(",")})`;
      agentParams.push(...scope.agentIds);
    }
  }
  const requestedAgentId = String(req.query.agentId || "").trim();
  if (requestedAgentId) {
    if (scope.type === "agents" && !scope.agentIds.includes(requestedAgentId)) agentWhere += " AND 1=0";
    else { agentWhere += " AND u.id=?"; agentParams.push(requestedAgentId); }
  }

  const [agents] = await db.execute(
    `SELECT u.id,u.name,u.email,u.sip_username,u.extension,u.status,u.active,r.name AS role_name,
            (SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '||')
               FROM team_members tm JOIN teams t ON t.id=tm.team_id AND t.tenant_id=tm.tenant_id
              WHERE tm.tenant_id=u.tenant_id AND tm.user_id=u.id AND tm.active=1 AND t.active=1) AS team_names
       FROM users u LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
       ${agentWhere} ORDER BY u.name ASC`,
    agentParams
  );

  const visibleAgentIds = agents.map((agent) => agent.id);
  const visibleAgentSip = new Set(agents.map((agent) => agent.sip_username).filter(Boolean));
  const liveCalls = tracker.list(req.user.tenant_id).filter((call) => {
    if (requestedAgentId && call.agentUserId !== requestedAgentId) return false;
    if (scope.type === "agents" && !scope.agentIds.includes(call.agentUserId)) return false;
    return !call.agent || visibleAgentSip.has(call.agent);
  });
  const onCallIds = new Set(
    liveCalls
      .filter((call) => ["RINGING", "ANSWERED", "HELD"].includes(call.status))
      .map((call) => call.agentUserId)
      .filter(Boolean)
  );

  const agentStatus = {
    total: agents.length,
    ready: agents.filter((agent) => Number(agent.active) === 1 && agent.status === "READY" && !onCallIds.has(agent.id)).length,
    active: agents.filter((agent) => Number(agent.active) === 1 && agent.status !== "OFFLINE").length,
    inactive: agents.filter((agent) => Number(agent.active) !== 1 || agent.status === "OFFLINE").length,
    onCall: onCallIds.size,
    paused: agents.filter((agent) => Number(agent.active) === 1 && agent.status === "PAUSED").length
  };

  const metricParams = [req.user.tenant_id];
  let metricWhere = "WHERE c.tenant_id=?";
  metricWhere = appendCallAgentScope(metricWhere, metricParams, scope);
  metricWhere = appendRequestedAgent(metricWhere, metricParams, scope, requestedAgentId);
  metricWhere += " AND c.started_at>=? AND c.started_at<DATE_ADD(?,INTERVAL 1 DAY)";
  metricParams.push(`${from} 00:00:00`, `${to} 00:00:00`);

  const [[metrics]] = await db.execute(
    `SELECT
       COALESCE(SUM(c.direction='OUTBOUND'),0) AS dialed,
       COALESCE(SUM(c.direction='INBOUND' AND c.answered_at IS NULL AND c.ended_at IS NOT NULL),0) AS missed,
       COALESCE(SUM(UPPER(COALESCE(c.disposition,'')) IN ('VOICEMAIL','VM')),0) AS voicemails,
       COALESCE(SUM(c.answered_at IS NOT NULL),0) AS connected,
       COALESCE(SUM(c.direction='OUTBOUND' AND c.answered_at IS NULL AND c.ended_at IS NOT NULL),0) AS not_connected,
       COALESCE(SUM(c.direction='INBOUND'),0) AS inbound,
       COALESCE(SUM(c.direction='OUTBOUND'),0) AS outbound
     FROM calls c ${metricWhere}`,
    metricParams
  );

  const agentMap = new Map(agents.map((agent) => [agent.sip_username, agent]));
  res.json({
    range: { from, to },
    agentStatus,
    callMetrics: metrics,
    agents: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      sipUsername: agent.sip_username,
      extension: agent.extension,
      status: agent.status,
      active: Boolean(agent.active),
      roleName: agent.role_name || "User",
      teamNames: agent.team_names ? String(agent.team_names).split("||").filter(Boolean) : []
    })),
    liveCalls: liveCalls.map((call) => ({
      ...call,
      agentName: call.agentName || agentMap.get(call.agent)?.name || call.agent || "Unassigned"
    }))
  });
}));

app.get("/api/reports/kpis", authenticate, requirePermission("VIEW_DASHBOARD", "VIEW_REPORTS"), asyncRoute(async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
  const scope = await callAccessScope(req.user, "VIEW_TEAM_REPORTS");
  const params = [req.user.tenant_id, days];
  let accessFilter = "";
  if (scope.type === "agents") {
    if (!scope.agentIds.length) accessFilter += " AND 1=0";
    else {
      accessFilter += ` AND c.agent_user_id IN (${scope.agentIds.map(() => "?").join(",")})`;
      params.push(...scope.agentIds);
    }
  }
  const agentId = String(req.query.agentId || "").trim();
  if (agentId) {
    if (scope.type === "agents" && !scope.agentIds.includes(agentId)) accessFilter += " AND 1=0";
    else { accessFilter += " AND c.agent_user_id=?"; params.push(agentId); }
  }

  const [summaryRows] = await db.execute(
    `SELECT COUNT(*) AS total_calls,
            COALESCE(SUM(c.answered_at IS NOT NULL),0) AS completed_calls,
            COALESCE(SUM(c.ended_at IS NOT NULL AND c.answered_at IS NULL),0) AS failed_calls,
            ROUND(AVG(NULLIF(c.billable_sec,0)),1) AS avg_talk_sec,
            COALESCE(SUM(c.billable_sec),0) AS total_talk_sec,
            ROUND(100*SUM(c.answered_at IS NOT NULL)/NULLIF(COUNT(*),0),1) AS answer_rate
       FROM calls c LEFT JOIN users u ON u.id=c.agent_user_id
      WHERE c.tenant_id=? AND c.started_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY) ${accessFilter}`,
    params
  );
  const [daily] = await db.execute(
    `SELECT DATE(c.started_at) AS day,COUNT(*) AS calls,SUM(c.answered_at IS NOT NULL) AS completed,SUM(c.billable_sec) AS talk_sec
       FROM calls c LEFT JOIN users u ON u.id=c.agent_user_id
      WHERE c.tenant_id=? AND c.started_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY) ${accessFilter}
      GROUP BY DATE(c.started_at) ORDER BY day ASC`,
    params
  );
  const [agents] = await db.execute(
    `SELECT COALESCE(u.name,c.agent_sip_username,'Unassigned') AS agent,COUNT(*) AS calls,
            SUM(c.answered_at IS NOT NULL) AS completed,SUM(c.billable_sec) AS talk_sec,
            ROUND(AVG(NULLIF(c.billable_sec,0)),1) AS avg_talk_sec
       FROM calls c LEFT JOIN users u ON u.id=c.agent_user_id
      WHERE c.tenant_id=? AND c.started_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY) ${accessFilter}
      GROUP BY COALESCE(u.name,c.agent_sip_username,'Unassigned') ORDER BY calls DESC LIMIT 25`,
    params
  );
  res.json({ summary: summaryRows[0], daily, agents, days });
}));

app.get("/api/usage", authenticate, requirePermission("VIEW_USAGE", "VIEW_BILLING"), asyncRoute(async (req, res) => {
  const usage = await tenantUsageSummary(req.user.tenant_id);
  const activeUsers = await tenantSeatCount(req.user.tenant_id, true);
  res.json({
    usage,
    activeUsers,
    pricePerUser: Number(req.user.price_per_user || 0),
    estimatedSeatRevenue: activeUsers * Number(req.user.price_per_user || 0),
    limits: {
      maxUsers: req.user.max_users,
      outboundMinutes: req.user.outbound_minutes,
      inboundMinutes: req.user.inbound_minutes
    }
  });
}));

// ---------------------------
// Warm transfer / conference
// ---------------------------
app.post("/api/calls/conference/start", authenticate, requirePermission("WARM_TRANSFER", "ADD_PARTICIPANT"), asyncRoute(async (req, res) => {
  if (!req.user.sip_username) return res.status(400).json({ error: "Your account has no SIP endpoint" });
  const call = tracker.findByAgent(req.user.sip_username);
  if (!call || call.tenantId !== req.user.tenant_id) return res.status(404).json({ error: "No active call found for this agent" });
  const channels = [...call.channels];
  const agentChannel = channels.find((channel) => channel.startsWith(`PJSIP/${req.user.sip_username}-`));
  const customerChannel = channels.find((channel) => channel !== agentChannel);
  if (!agentChannel || !customerChannel) return res.status(409).json({ error: "Both call legs are not available" });
  const conferenceId = String(Date.now());
  await ami.action({
    Action: "Redirect",
    Channel: agentChannel,
    Context: "ringnex-transfer-agent",
    Exten: conferenceId,
    Priority: "1",
    ExtraChannel: customerChannel,
    ExtraContext: "ringnex-transfer-customer",
    ExtraExten: conferenceId,
    ExtraPriority: "1"
  });
  await audit(req.user.id, "CONFERENCE_START", "call", call.linkedid, { conferenceId }, req.user.tenant_id);
  res.json({ accepted: true, linkedid: call.linkedid, conferenceId });
}));

app.post("/api/calls/conference/complete", authenticate, requirePermission("WARM_TRANSFER"), asyncRoute(async (req, res) => {
  const conferenceId = String(req.body?.conferenceId || "").trim();
  if (!conferenceId || !/^\d+$/.test(conferenceId)) return res.status(400).json({ error: "Valid conferenceId is required" });
  if (!req.user.sip_username) return res.status(400).json({ error: "Your account has no SIP endpoint" });
  const call = tracker.findByAgent(req.user.sip_username);
  if (!call || call.tenantId !== req.user.tenant_id) return res.status(404).json({ error: "No active call found for this agent" });
  const agentChannel = [...call.channels].find((channel) => channel.startsWith(`PJSIP/${req.user.sip_username}-`));
  if (!agentChannel) return res.status(409).json({ error: "Agent conference channel not found" });
  await ami.action({ Action: "ConfbridgeKick", Conference: conferenceId, Channel: agentChannel });
  await audit(req.user.id, "CONFERENCE_TRANSFER_COMPLETE", "conference", conferenceId, { agentChannel }, req.user.tenant_id);
  res.json({ accepted: true, conferenceId, removedChannel: agentChannel });
}));

app.post("/api/calls/conference/invite-agent", authenticate, requirePermission("WARM_TRANSFER"), asyncRoute(async (req, res) => {
  const conferenceId = String(req.body?.conferenceId || "").trim();
  const targetExtension = String(req.body?.targetExtension || "").trim();
  if (!conferenceId || !/^\d+$/.test(conferenceId)) return res.status(400).json({ error: "Valid conferenceId is required" });
  if (!targetExtension) return res.status(400).json({ error: "Target agent extension is required" });
  const [rows] = await db.execute(
    `SELECT id,name,sip_username,extension,active
       FROM users
      WHERE tenant_id=? AND extension=? LIMIT 1`,
    [req.user.tenant_id, targetExtension]
  );
  const targetAgent = rows[0];
  if (!targetAgent) return res.status(404).json({ error: "Target agent not found in this workspace" });
  if (!targetAgent.active) return res.status(409).json({ error: "Target agent is disabled" });
  if (!targetAgent.sip_username) return res.status(409).json({ error: "Target agent has no SIP endpoint" });
  await ami.action({
    Action: "Originate",
    Channel: `PJSIP/${targetAgent.sip_username}`,
    Application: "ConfBridge",
    Data: `${conferenceId},default_bridge,transfer_agent`,
    Timeout: "30000",
    Async: "true"
  });
  await audit(req.user.id, "CONFERENCE_AGENT_INVITE", "conference", conferenceId, {
    targetAgentId: targetAgent.id,
    targetExtension: targetAgent.extension,
    targetSipUsername: targetAgent.sip_username
  }, req.user.tenant_id);
  res.json({ accepted: true, conferenceId, targetAgent: { id: targetAgent.id, name: targetAgent.name, extension: targetAgent.extension, sipUsername: targetAgent.sip_username } });
}));

app.post("/api/calls/conference/invite-pstn", authenticate, requirePermission("ADD_PARTICIPANT"), asyncRoute(async (req, res) => {
  const conferenceId = String(req.body?.conferenceId || "").trim();
  const targetNumber = String(req.body?.number || "").replace(/\D/g, "");
  if (!conferenceId || !/^\d+$/.test(conferenceId)) return res.status(400).json({ error: "Valid conferenceId is required" });
  if (!targetNumber || targetNumber.length < 7 || targetNumber.length > 15) return res.status(400).json({ error: "Valid participant phone number is required" });
  if (!req.user.caller_id_number) return res.status(409).json({ error: "No outbound DID assigned to this agent" });
  await ami.action({
    Action: "Originate",
    Channel: `PJSIP/${targetNumber}@commio`,
    Application: "ConfBridge",
    Data: `${conferenceId},default_bridge,transfer_customer`,
    CallerID: `"Ringnex" <${req.user.caller_id_number}>`,
    Timeout: "30000",
    Async: "true"
  });
  await audit(req.user.id, "CONFERENCE_PSTN_INVITE", "conference", conferenceId, { targetNumber, callerIdNumber: req.user.caller_id_number }, req.user.tenant_id);
  res.json({ accepted: true, conferenceId, targetNumber });
}));

// ---------------------------
// Live monitoring
// ---------------------------
app.get("/api/supervisor/live", authenticate, requirePermission("MONITOR_CALLS", "VIEW_REPORTS"), asyncRoute(async (req, res) => {
  const scope = await callAccessScope(req.user, "VIEW_TEAM_LIVE_CALLS");
  let calls = tracker.list(req.user.tenant_id);
  let presence = tracker.listPresence(req.user.tenant_id);
  if (scope.type === "agents") {
    const allowed = new Set(scope.agentIds);
    calls = calls.filter((call) => allowed.has(call.agentUserId));
    presence = presence.filter((item) => allowed.has(item.userId));
  }
  res.json({ calls, presence, ami: amiConnected });
}));

app.post("/api/supervisor/monitor", authenticate, requirePermission("MONITOR_CALLS"), asyncRoute(async (req, res) => {
  const linkedid = String(req.body.linkedid || "");
  const mode = String(req.body.mode || "listen");
  const modePermissions = { listen: "LISTEN_LIVE_CALLS", whisper: "WHISPER_CALLS", barge: "BARGE_CALLS" };
  const teamModePermissions = { listen: "LISTEN_TEAM_CALLS", whisper: "WHISPER_TEAM_CALLS", barge: "BARGE_TEAM_CALLS" };
  const flags = { listen: "q", whisper: "qw", barge: "qB" };
  if (!flags[mode]) return res.status(400).json({ error: "Invalid monitoring mode" });
  if (!hasPermission(req.user, modePermissions[mode])) return res.status(403).json({ error: "You do not have permission for this monitoring mode" });
  if (!req.user.sip_username) return res.status(400).json({ error: "Supervisor has no SIP endpoint" });
  const call = tracker.find(linkedid);
  if (!call || call.tenantId !== req.user.tenant_id) return res.status(404).json({ error: "Live call no longer exists" });

  if (isSupervisor(req.user)) {
    const monitorIds = await supervisorAgentIdsForPrivilege(req.user.id, req.user.tenant_id, "MONITOR_TEAM_CALLS");
    const modeIds = await supervisorAgentIdsForPrivilege(req.user.id, req.user.tenant_id, teamModePermissions[mode]);
    if (!monitorIds.includes(call.agentUserId) || !modeIds.includes(call.agentUserId)) {
      return res.status(403).json({ error: "This team does not allow the requested monitoring action" });
    }
  }

  const targetChannel = [...call.channels].find((channel) => call.agent && channel.startsWith(`PJSIP/${call.agent}-`));
  if (!targetChannel) return res.status(409).json({ error: "Agent channel is not available" });
  await ami.action({
    Action: "Originate",
    Channel: `PJSIP/${req.user.sip_username}`,
    Application: "ChanSpy",
    Data: `${targetChannel},${flags[mode]}`,
    CallerID: `Ringnex Monitor <${req.user.extension || "9000"}>`,
    Async: "true"
  });
  await audit(req.user.id, `SUPERVISOR_${mode.toUpperCase()}`, "call", linkedid, { targetChannel }, req.user.tenant_id);
  res.json({ accepted: true });
}));

// ---------------------------
// Socket tenant isolation
// ---------------------------
io.use(async (socket, next) => {
  try {
    const claims = verifyToken(socket.handshake.auth?.token || "");
    if (claims.scope !== "tenant") return next(new Error("Unauthorized"));
    const user = await loadTenantUser(claims.sub);
    if (!user) return next(new Error("Unauthorized"));
    socket.user = user;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", async (socket) => {
  const user = socket.user;
  let calls = tracker.list(user.tenant_id);

  try {
    if (isSupervisor(user)) {
      const teamIds = await supervisorTeamIdsForPrivilege(user.id, user.tenant_id, "VIEW_TEAM_LIVE_CALLS");
      for (const teamId of teamIds) socket.join(`tenant:${user.tenant_id}:team:${teamId}`);
      const allowedIds = new Set(await supervisorAgentIdsForPrivilege(user.id, user.tenant_id, "VIEW_TEAM_LIVE_CALLS"));
      calls = calls.filter((call) => allowedIds.has(call.agentUserId));
    } else if (hasPermission(user, "MONITOR_CALLS") || hasPermission(user, "VIEW_REPORTS") || hasPermission(user, "MANAGE_AGENTS")) {
      socket.join(`tenant:${user.tenant_id}:live`);
    } else {
      calls = [];
    }
  } catch (error) {
    console.error("Socket team scope failed:", error.message);
    calls = [];
  }

  socket.emit("system:state", { ami: amiConnected, calls });
});

ami.on("connection", (connected) => {
  amiConnected = connected;
  io.emit("ami:status", { connected });
  if (connected) {
    syncAllAsteriskMappings().catch((error) => console.error("Asterisk SaaS mapping reconciliation failed", error));
  }
});
ami.on("event", (event) => tracker.handle(event).catch((error) => console.error("AMI event persistence failed", error)));

ami.on("event", async (event) => {
  if (event.Event !== "Hold" || !event.Channel) return;

  try {
    const match = String(event.Channel).match(/^PJSIP\/([^/-]+)-/i);
    const sipUsername = match?.[1] || null;

    if (!sipUsername) return;

    const [rows] = await db.execute(
      `SELECT
         u.role_id,
         u.active,
         t.status AS tenant_status,
         t.features_json
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.sip_username = ?
       LIMIT 1`,
      [sipUsername]
    );

    const agent = rows[0];
    if (!agent) return;

    const permissions = await loadRolePermissions(
      agent.role_id,
      agent
    );

    const tenantAllowed = ["ACTIVE", "TRIAL"].includes(
      String(agent.tenant_status || "").toUpperCase()
    );

    const holdAllowed =
      Number(agent.active) === 1 &&
      tenantAllowed &&
      permissions.includes("HOLD_CALL");

    if (holdAllowed) return;

    console.warn(
      `HOLD_CALL denied for ${sipUsername}; hanging up ${event.Channel}`
    );

    await ami.action({
      Action: "Hangup",
      Channel: event.Channel,
      Cause: 21
    });
  } catch (error) {
    console.error(
      "HOLD_CALL enforcement failed:",
      error.message
    );
  }
});

ami.on("error", (error) => console.error("AMI error", error.message));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This value already exists in this scope" });
  if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
  res.status(500).json({ error: config.env === "production" ? "Unexpected server error" : error.message });
});

async function start() {
  await healthcheck();
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`Ringnex SaaS API listening on 127.0.0.1:${config.port}`);
  });
  ami.start();
}

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  ami.stop();
  io.close();
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
start().catch((error) => {
  console.error("Startup failed", error);
  process.exit(1);
});






