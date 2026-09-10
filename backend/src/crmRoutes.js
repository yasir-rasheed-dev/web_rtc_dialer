import crypto from "node:crypto";

import express from "express";
import jwt from "jsonwebtoken";

import { config } from "./config.js";
import { db } from "./db.js";
import { requirePermission } from "./saas.js";
import {
  applyCallOutcome,
  authorizeUrl,
  bustEnabledCache,
  disconnect,
  exchangeCode,
  getConnection,
  getContactByPhone,
  isGhlConfigured,
  isGhlEnabled,
  listAllContacts,
  listContactOpportunities,
  listPipelines,
  saveConnection
} from "./ghl.js";

// CRM (GoHighLevel) integration routes. Public-facing path is /crm — GHL
// rejects any redirect URL containing "ghl"/"highlevel".

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const STATE_TTL = "10m";

function signState(payload) {
  return jwt.sign({ ...payload, p: "ghl-oauth" }, config.jwtSecret, { expiresIn: STATE_TTL });
}
function verifyState(token) {
  const d = jwt.verify(token, config.jwtSecret);
  if (d.p !== "ghl-oauth") throw new Error("bad state");
  return d;
}

const frontend = () => config.frontendOrigins?.[0] || config.frontendOrigin;

async function getStatus(req, res) {
  if (!isGhlConfigured()) return res.json({ configured: false, connected: false, active: false });
  const conn = await getConnection(req.user.tenant_id);
  if (!conn) return res.json({ configured: true, connected: false, active: false });

  let pipelines = [];
  try {
    pipelines = await listPipelines(req.user.tenant_id);
  } catch (e) {
    console.warn("[ghl] listPipelines failed:", e.message);
  }
  res.json({
    configured: true,
    connected: true,
    active: conn.active,
    locationId: conn.locationId,
    createOpportunity: conn.createOpportunity,
    pipelineId: conn.pipelineId,
    pipelineStageId: conn.pipelineStageId,
    pipelines
  });
}

async function startConnect(req, res) {
  if (!isGhlConfigured()) return res.status(400).json({ error: "CRM integration not configured" });
  const state = signState({ t: req.user.tenant_id, u: req.user.id });
  res.json({ url: authorizeUrl(state) });
}

async function oauthCallback(req, res) {
  const back = (params) => res.redirect(`${frontend()}/?${new URLSearchParams(params).toString()}`);
  try {
    if (req.query.error) return back({ crm: "error", reason: String(req.query.error).slice(0, 80) });
    const code = String(req.query.code || "");
    const state = verifyState(String(req.query.state || ""));
    if (!code) return back({ crm: "error", reason: "no_code" });

    const tok = await exchangeCode(code);
    if (!tok.access_token || !tok.refresh_token) return back({ crm: "error", reason: "token_exchange" });
    await saveConnection(state.t, tok, state.u);
    bustEnabledCache(state.t);
    back({ crm: "connected" });
  } catch (e) {
    console.warn("[ghl] callback failed:", e.message);
    back({ crm: "error", reason: "callback_failed" });
  }
}

async function toggleActive(req, res) {
  const active = req.body.active ? 1 : 0;
  const [r] = await db.execute(
    "UPDATE tenant_ghl_connections SET active = ? WHERE tenant_id = ?",
    [active, req.user.tenant_id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not connected" });
  bustEnabledCache(req.user.tenant_id);
  res.json({ active: !!active });
}

async function saveSettings(req, res) {
  const pipelineId = req.body.pipelineId ? String(req.body.pipelineId).slice(0, 64) : null;
  const pipelineStageId = req.body.pipelineStageId ? String(req.body.pipelineStageId).slice(0, 64) : null;
  const createOpportunity = req.body.createOpportunity === false ? 0 : 1;
  const [r] = await db.execute(
    `UPDATE tenant_ghl_connections
        SET pipeline_id = ?, pipeline_stage_id = ?, create_opportunity = ?
      WHERE tenant_id = ?`,
    [pipelineId, pipelineStageId, createOpportunity, req.user.tenant_id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not connected" });
  res.json({ ok: true });
}

async function removeConnection(req, res) {
  await disconnect(req.user.tenant_id);
  res.json({ ok: true });
}

// ---- agent-facing (any authenticated user) ----

// Tells the agent app whether to show a GHL call-end popup + its config.
async function agentConfig(req, res) {
  if (!(await isGhlEnabled(req.user.tenant_id))) return res.json({ active: false });
  const conn = await getConnection(req.user.tenant_id);
  let pipelines = [];
  try {
    pipelines = await listPipelines(req.user.tenant_id);
  } catch {
    /* leave empty */
  }
  res.json({
    active: true,
    pipelineId: conn?.pipelineId || null,
    pipelineStageId: conn?.pipelineStageId || null,
    createOpportunityDefault: conn?.createOpportunity !== false,
    pipelines
  });
}

// Popup opens after a call → does GHL already have this contact, and what
// opportunities does it have?
async function callContext(req, res) {
  if (!(await isGhlEnabled(req.user.tenant_id))) return res.json({ active: false });
  const phone = String(req.query.phone || "");
  const contact = await getContactByPhone(req.user.tenant_id, phone);
  const opportunities = contact ? await listContactOpportunities(req.user.tenant_id, contact.id) : [];
  res.json({ active: true, contact, opportunities });
}

// Popup submit (GHL-only popup, or the Lead Mgmt popup's GHL section).
async function callOutcome(req, res) {
  if (!(await isGhlEnabled(req.user.tenant_id))) return res.json({ skipped: "inactive" });
  const b = req.body || {};
  const out = await applyCallOutcome(req.user.tenant_id, {
    phone: String(b.phone || ""),
    contactName: b.contactName ? String(b.contactName).slice(0, 160) : null,
    note: b.note ? String(b.note).slice(0, 5000) : null,
    tags: Array.isArray(b.tags) ? b.tags.map((t) => String(t).slice(0, 60)).slice(0, 20) : undefined,
    opportunity:
      b.opportunity && typeof b.opportunity === "object"
        ? {
            mode: ["none", "create", "update"].includes(b.opportunity.mode) ? b.opportunity.mode : "none",
            opportunityId: b.opportunity.opportunityId || null,
            pipelineId: b.opportunity.pipelineId || null,
            pipelineStageId: b.opportunity.pipelineStageId || null,
            status: b.opportunity.status || null
          }
        : { mode: "none" }
  });
  res.json(out);
}

// Pull every GHL contact into the ringNex address book. Deduped by phone:
// an existing ringNex contact is only *linked* (ghl_contact_id filled),
// never duplicated or overwritten. Owner-triggered from Contacts.
const cut = (v, n) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, n) : null;
};

async function importOneContact(tenantId, ownerId, c) {
  const digits = String(c.phone || "").replace(/\D/g, "");
  if (digits.length < 7) return "skipped";

  const last10 = digits.slice(-10);
  const cand = [...new Set([digits, last10, `+${digits}`, `+1${last10}`, `1${last10}`])];
  const [ex] = await db.query(
    `SELECT c.id, c.ghl_contact_id
       FROM contact_phones p
       JOIN contacts c ON c.id = p.contact_id AND c.tenant_id = p.tenant_id
      WHERE p.tenant_id = ? AND p.number IN (${cand.map(() => "?").join(",")})
      LIMIT 1`,
    [tenantId, ...cand]
  );

  if (ex.length) {
    if (ex[0].ghl_contact_id) return "skipped";
    await db.execute("UPDATE contacts SET ghl_contact_id = ? WHERE id = ? AND tenant_id = ?", [
      c.id,
      ex[0].id,
      tenantId
    ]);
    return "linked";
  }

  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO contacts
       (id,tenant_id,owner_user_id,first_name,last_name,company,source,phone,email,notes,ghl_contact_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      tenantId,
      ownerId,
      cut(c.firstName || String(c.contactName || "").split(/\s+/)[0], 80),
      cut(c.lastName, 80),
      cut(c.companyName, 120),
      "OTHER",
      `+${digits}`,
      cut(String(c.email || "").toLowerCase(), 190),
      "Imported from GoHighLevel",
      c.id
    ]
  );
  await db.execute(
    `INSERT INTO contact_phones (id,tenant_id,contact_id,number,label,is_primary) VALUES (?,?,?,?,'MOBILE',1)`,
    [crypto.randomUUID(), tenantId, id, `+${digits}`]
  );
  return "imported";
}

async function importContacts(req, res) {
  if (!(await isGhlEnabled(req.user.tenant_id))) return res.status(400).json({ error: "GoHighLevel is not active" });
  const tenantId = req.user.tenant_id;
  const list = await listAllContacts(tenantId, { max: 5000 });

  const counts = { imported: 0, linked: 0, skipped: 0, failed: 0 };
  for (const c of list) {
    try {
      const r = await importOneContact(tenantId, req.user.id, c);
      counts[r] += 1;
    } catch (e) {
      console.warn("[ghl] import row failed:", e.message);
      counts.failed += 1;
    }
  }

  res.json({ total: list.length, ...counts });
}

export default function createCrmRoutes(authenticate) {
  const router = express.Router();
  const owner = requirePermission("MANAGE_SETTINGS");

  router.get("/status", authenticate, owner, asyncRoute(getStatus));
  router.get("/connect", authenticate, owner, asyncRoute(startConnect));
  router.get("/callback", asyncRoute(oauthCallback)); // GHL redirects here — no JWT
  router.post("/toggle", authenticate, owner, asyncRoute(toggleActive));
  router.post("/settings", authenticate, owner, asyncRoute(saveSettings));
  router.post("/disconnect", authenticate, owner, asyncRoute(removeConnection));

  // agent-facing — any authenticated user
  router.get("/agent-config", authenticate, asyncRoute(agentConfig));
  router.get("/call-context", authenticate, asyncRoute(callContext));
  router.post("/call-outcome", authenticate, asyncRoute(callOutcome));

  // one-way import: pull GHL contacts into ringNex, dedup by phone
  router.post("/import-contacts", authenticate, requirePermission("CREATE_CONTACTS"), asyncRoute(importContacts));
  return router;
}
