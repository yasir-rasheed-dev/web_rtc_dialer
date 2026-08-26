import crypto from "node:crypto";
import { db } from "./db.js";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "./permissions.js";

export function normalizeWorkspace(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

export function tenantSipKey(tenantId) {
  return String(tenantId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase();
}

export function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function tenantFeatureEnabled(tenant, permissionKey) {
  const features = parseJson(tenant?.features_json, {});
  if (features.ALL === true) return true;
  if (Object.prototype.hasOwnProperty.call(features, permissionKey)) {
    return Boolean(features[permissionKey]);
  }
  // Backwards-compatible default: a feature is enabled unless the tenant/plan explicitly disables it.
  return true;
}

export async function loadRolePermissions(roleId, tenant) {
  if (!roleId) return [];
  const [rows] = await db.execute(
    `SELECT p.permission_key
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?`,
    [roleId]
  );
  return rows
    .map((row) => row.permission_key)
    .filter((key) => tenantFeatureEnabled(tenant, key));
}

export function hasPermission(user, permission) {
  return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}

export function requirePermission(...permissions) {
  return (req, res, next) => {
    const allowed = permissions.some((permission) => hasPermission(req.user, permission));
    return allowed
      ? next()
      : res.status(403).json({ error: "You do not have permission for this action" });
  };
}

export async function seedPermissionCatalog(connection = db) {
  for (const permission of PERMISSIONS) {
    await connection.execute(
      `INSERT INTO permissions (id, permission_key, name, category)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category)`,
      [crypto.randomUUID(), permission.key, permission.name, permission.category]
    );
  }
}

export async function createDefaultTenantRoles(connection, tenantId) {
  await seedPermissionCatalog(connection);
  const created = {};

  for (const [name, permissionKeys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const id = crypto.randomUUID();
    await connection.execute(
      `INSERT INTO roles (id, tenant_id, name, description, is_system, active)
       VALUES (?, ?, ?, ?, 1, 1)`,
      [id, tenantId, name, `${name} default role`]
    );

    if (permissionKeys.length) {
      const [permissionRows] = await connection.query(
        `SELECT id, permission_key FROM permissions WHERE permission_key IN (${permissionKeys.map(() => "?").join(",")})`,
        permissionKeys
      );
      for (const permission of permissionRows) {
        await connection.execute(
          `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
          [id, permission.id]
        );
      }
    }
    created[name] = id;
  }

  return created;
}

export async function allocateTenantExtension(tenantId, userId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [tenantRows] = await connection.execute(
      `SELECT extension_start, next_extension, status
         FROM tenants WHERE id = ? FOR UPDATE`,
      [tenantId]
    );
    const tenant = tenantRows[0];
    if (!tenant) throw new Error("Tenant not found");
    if (tenant.status !== "ACTIVE" && tenant.status !== "TRIAL") {
      throw new Error("Tenant is not active");
    }

    const extension = Number(tenant.next_extension || tenant.extension_start);
    if (!Number.isInteger(extension) || extension < 1) {
      throw new Error("Tenant extension range is not configured");
    }

    await connection.execute(
      `INSERT INTO tenant_extensions (id, tenant_id, extension, user_id, status)
       VALUES (?, ?, ?, ?, 'ASSIGNED')`,
      [crypto.randomUUID(), tenantId, String(extension), userId]
    );
    await connection.execute(
      `UPDATE tenants SET next_extension = ? WHERE id = ?`,
      [extension + 1, tenantId]
    );
    await connection.commit();
    return String(extension);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function releaseTenantExtension(tenantId, userId) {
  await db.execute(
    `UPDATE tenant_extensions
        SET status='RELEASED', released_at=UTC_TIMESTAMP()
      WHERE tenant_id=? AND user_id=? AND status='ASSIGNED'`,
    [tenantId, userId]
  );
}

export async function assertTenantUserCapacity(tenantId) {
  const [[tenant]] = await db.execute(
    `SELECT max_users FROM tenants WHERE id=? LIMIT 1`,
    [tenantId]
  );
  if (!tenant) throw new Error("Tenant not found");
  if (tenant.max_users === null || tenant.max_users === undefined) return;

  const [[count]] = await db.execute(
    `SELECT COUNT(*) AS total
       FROM users u
       LEFT JOIN roles r ON r.id=u.role_id AND r.tenant_id=u.tenant_id
      WHERE u.tenant_id=? AND u.active=1 AND COALESCE(r.name,'')<>'Tenant Owner'`,
    [tenantId]
  );
  if (Number(count.total) >= Number(tenant.max_users)) {
    const error = new Error("User limit reached for this tenant");
    error.statusCode = 409;
    throw error;
  }
}

export async function tenantUsageSummary(tenantId, periodStart = null, periodEnd = null) {
  const from = periodStart || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const to = periodEnd || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));

  const [[local]] = await db.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN direction='OUTBOUND' THEN billable_sec ELSE 0 END),0) AS outbound_sec,
       COALESCE(SUM(CASE WHEN direction='INBOUND' THEN billable_sec ELSE 0 END),0) AS inbound_sec,
       COUNT(*) AS calls
     FROM calls
     WHERE tenant_id=? AND started_at>=? AND started_at<?`,
    [tenantId, from, to]
  );

  const [[carrier]] = await db.execute(
    `SELECT COALESCE(SUM(cost),0) AS carrier_cost,
            COALESCE(SUM(billable_seconds),0) AS carrier_billable_sec
       FROM carrier_cdrs
      WHERE tenant_id=? AND started_at>=? AND started_at<?`,
    [tenantId, from, to]
  );

  return {
    periodStart: from,
    periodEnd: to,
    calls: Number(local.calls || 0),
    outboundMinutes: Math.ceil(Number(local.outbound_sec || 0) / 60),
    inboundMinutes: Math.ceil(Number(local.inbound_sec || 0) / 60),
    carrierBillableMinutes: Math.ceil(Number(carrier.carrier_billable_sec || 0) / 60),
    carrierCost: Number(carrier.carrier_cost || 0)
  };
}
