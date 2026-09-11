import { config } from "./config.js";
import { db } from "./db.js";
import { encryptSecret, decryptSecret } from "./security.js";

// GoHighLevel — per-tenant OAuth to one sub-account (location). Everything
// here no-ops unless the app is configured (client id/secret) AND the
// tenant has a connection row that is active = 1.

const AUTHORIZE_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";
const TOKEN_URL = `${config.ghl.apiBase}/oauth/token`;

export function isGhlConfigured() {
  return Boolean(config.ghl.clientId && config.ghl.clientSecret);
}

export function authorizeUrl(state) {
  const q = new URLSearchParams({
    response_type: "code",
    redirect_uri: config.ghl.redirectUri,
    client_id: config.ghl.clientId,
    scope: config.ghl.scopes,
    state
  });
  return `${AUTHORIZE_URL}?${q.toString()}`;
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.ghl.clientId,
      client_secret: config.ghl.clientSecret,
      ...params
    }).toString()
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* leave as {} */
  }
  if (!res.ok) {
    const msg = data.message || data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`[ghl] token request failed: ${msg}`);
  }
  return data; // { access_token, refresh_token, expires_in, scope, locationId, companyId, userType }
}

export function exchangeCode(code) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: config.ghl.redirectUri });
}

// ---- connection row ----
function rowToConn(r) {
  if (!r) return null;
  return {
    tenantId: r.tenant_id,
    locationId: r.location_id,
    companyId: r.company_id,
    accessToken: decryptSecret(r.access_token_enc),
    refreshToken: decryptSecret(r.refresh_token_enc),
    expiresAt: new Date(r.token_expires_at).getTime(),
    scopes: r.scopes,
    active: !!r.active,
    createOpportunity: !!r.create_opportunity,
    pipelineId: r.pipeline_id,
    pipelineStageId: r.pipeline_stage_id
  };
}

export async function getConnection(tenantId) {
  const [rows] = await db.query("SELECT * FROM tenant_ghl_connections WHERE tenant_id = ? LIMIT 1", [tenantId]);
  return rowToConn(rows[0]);
}

export async function saveConnection(tenantId, tok, userId) {
  const expiresAt = new Date(Date.now() + (Number(tok.expires_in) || 86400) * 1000);
  await db.execute(
    `INSERT INTO tenant_ghl_connections
       (tenant_id, location_id, company_id, access_token_enc, refresh_token_enc,
        token_expires_at, scopes, connected_by_user_id, connected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       location_id = VALUES(location_id),
       company_id = VALUES(company_id),
       access_token_enc = VALUES(access_token_enc),
       refresh_token_enc = VALUES(refresh_token_enc),
       token_expires_at = VALUES(token_expires_at),
       scopes = VALUES(scopes),
       connected_by_user_id = VALUES(connected_by_user_id),
       connected_at = NOW(),
       last_error = NULL`,
    [
      tenantId,
      tok.locationId || tok.location_id || "",
      tok.companyId || tok.company_id || null,
      encryptSecret(tok.access_token),
      encryptSecret(tok.refresh_token),
      expiresAt,
      tok.scope || config.ghl.scopes,
      userId || null
    ]
  );
}

export async function disconnect(tenantId) {
  await db.execute("DELETE FROM tenant_ghl_connections WHERE tenant_id = ?", [tenantId]);
  enabledCache.delete(tenantId);
}

// ---- token freshness (single-flight per tenant) ----
const refreshing = new Map();

async function doRefresh(tenantId, conn) {
  const tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refreshToken });
  const expiresAt = new Date(Date.now() + (Number(tok.expires_in) || 86400) * 1000);
  await db.execute(
    `UPDATE tenant_ghl_connections
        SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?, scopes = ?, last_error = NULL
      WHERE tenant_id = ?`,
    [
      encryptSecret(tok.access_token),
      encryptSecret(tok.refresh_token || conn.refreshToken),
      expiresAt,
      tok.scope || conn.scopes,
      tenantId
    ]
  );
  return tok.access_token;
}

export async function getValidToken(tenantId, conn) {
  const c = conn || (await getConnection(tenantId));
  if (!c) throw new Error("[ghl] no connection for tenant");
  if (c.expiresAt - Date.now() > 5 * 60 * 1000) return c.accessToken;

  if (!refreshing.has(tenantId)) {
    refreshing.set(
      tenantId,
      doRefresh(tenantId, c).finally(() => refreshing.delete(tenantId))
    );
  }
  return refreshing.get(tenantId);
}

// ---- enabled gate (cached ~30s) ----
const enabledCache = new Map(); // tenantId -> { at, value }

export async function isGhlEnabled(tenantId) {
  if (!isGhlConfigured() || !tenantId) return false;
  const hit = enabledCache.get(tenantId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const [rows] = await db.query(
    "SELECT active FROM tenant_ghl_connections WHERE tenant_id = ? LIMIT 1",
    [tenantId]
  );
  const value = !!(rows[0] && rows[0].active);
  enabledCache.set(tenantId, { at: Date.now(), value });
  return value;
}

export function bustEnabledCache(tenantId) {
  enabledCache.delete(tenantId);
}

// ---- authed API calls ----
async function ghlFetch(tenantId, path, { method = "GET", body, conn, retry = true } = {}) {
  const c = conn || (await getConnection(tenantId));
  const token = await getValidToken(tenantId, c);
  const res = await fetch(`${config.ghl.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: config.ghl.apiVersion,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && retry) {
    // force a refresh and try once more
    if (c) c.expiresAt = 0;
    return ghlFetch(tenantId, path, { method, body, conn: c, retry: false });
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* leave {} */
  }
  if (!res.ok) {
    const msg = data.message || data.error || `HTTP ${res.status}`;
    const err = new Error(`[ghl] ${method} ${path} → ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Create or update a GHL contact by phone/email (dedup on GHL's side). */
export async function upsertContact(tenantId, { firstName, lastName, name, phone, email, source, tags, address1 }) {
  const conn = await getConnection(tenantId);
  if (!conn) throw new Error("[ghl] no connection");
  const data = await ghlFetch(tenantId, "/contacts/upsert", {
    method: "POST",
    conn,
    body: {
      locationId: conn.locationId,
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(source ? { source } : {}),
      ...(address1 ? { address1 } : {}),
      ...(tags && tags.length ? { tags } : {})
    }
  });
  const contact = data.contact || data;
  return { contactId: contact.id, isNew: data.new === true || contact.new === true };
}

export async function addContactNote(tenantId, contactId, noteBody) {
  if (!contactId || !noteBody) return null;
  return ghlFetch(tenantId, `/contacts/${contactId}/notes`, {
    method: "POST",
    body: { body: String(noteBody).slice(0, 5000) }
  });
}

// NOTE: a real "Call" conversation-message type (GHL's native call-activity
// entry) needs a Conversation Provider registered for the location, and
// that registration only accepts an Agency/Company-level token — every
// scope combination on a Sub-Account OAuth connection (what this
// integration uses) gets "token is not authorized for this scope" from
// POST /conversations/providers. So call summaries go through
// addContactNote() instead (see callTracker.js #syncToGhl) — same
// practical result (duration + status visible on the contact), no
// unavailable permission needed.

const OPP_STATUSES = new Set(["open", "won", "lost", "abandoned"]);

export async function createOpportunity(
  tenantId,
  { contactId, name, monetaryValue, pipelineId, pipelineStageId, status }
) {
  const conn = await getConnection(tenantId);
  const pId = pipelineId || conn?.pipelineId;
  const sId = pipelineStageId || conn?.pipelineStageId;
  if (!conn || !pId || !sId) return { skipped: "no pipeline configured" };
  return ghlFetch(tenantId, "/opportunities/", {
    method: "POST",
    conn,
    body: {
      pipelineId: pId,
      locationId: conn.locationId,
      pipelineStageId: sId,
      name: name || "New opportunity",
      status: OPP_STATUSES.has(status) ? status : "open",
      contactId,
      ...(monetaryValue ? { monetaryValue: Number(monetaryValue) } : {})
    }
  });
}

export async function updateOpportunity(tenantId, opportunityId, { pipelineStageId, pipelineId, status }) {
  if (!opportunityId) return { skipped: "no opportunity id" };
  return ghlFetch(tenantId, `/opportunities/${opportunityId}`, {
    method: "PUT",
    body: {
      ...(pipelineId ? { pipelineId } : {}),
      ...(pipelineStageId ? { pipelineStageId } : {}),
      ...(OPP_STATUSES.has(status) ? { status } : {})
    }
  });
}

/** Is there already a GHL contact for this phone? Returns the contact or
 *  null (used by the call-end popup to auto-fill). */
export async function getContactByPhone(tenantId, phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const conn = await getConnection(tenantId);
  if (!conn) return null;
  const last10 = digits.slice(-10);
  try {
    const data = await ghlFetch(
      tenantId,
      `/contacts/?locationId=${encodeURIComponent(conn.locationId)}&query=${encodeURIComponent(digits)}&limit=20`,
      { conn }
    );
    const list = data.contacts || [];
    const match =
      list.find((c) => String(c.phone || "").replace(/\D/g, "").endsWith(last10)) || list[0] || null;
    if (!match) return null;
    return {
      id: match.id,
      name: match.contactName || [match.firstName, match.lastName].filter(Boolean).join(" ") || "",
      firstName: match.firstName || "",
      lastName: match.lastName || "",
      email: match.email || "",
      companyName: match.companyName || "",
      phone: match.phone || ""
    };
  } catch (e) {
    console.warn("[ghl] getContactByPhone failed:", e.message);
    return null;
  }
}

/** Existing opportunities for a GHL contact (so the popup can offer a
 *  status change instead of always creating a new one). */
export async function listContactOpportunities(tenantId, contactId) {
  if (!contactId) return [];
  const conn = await getConnection(tenantId);
  if (!conn) return [];
  try {
    const data = await ghlFetch(
      tenantId,
      `/opportunities/search?location_id=${encodeURIComponent(conn.locationId)}&contact_id=${encodeURIComponent(contactId)}&limit=20`,
      { conn }
    );
    return (data.opportunities || []).map((o) => ({
      id: o.id,
      name: o.name,
      pipelineId: o.pipelineId,
      pipelineStageId: o.pipelineStageId || o.stageId,
      status: o.status,
      monetaryValue: o.monetaryValue || 0
    }));
  } catch (e) {
    console.warn("[ghl] listContactOpportunities failed:", e.message);
    return [];
  }
}

// The customer number for a call, given its direction + legs.
export function customerDigits({ direction, from, to }) {
  const dir = String(direction || "").toUpperCase();
  if (dir !== "INBOUND" && dir !== "OUTBOUND") return "";
  const digits = String(dir === "OUTBOUND" ? to : from || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
}

/** Match/create the GHL contact for a call's customer number, link it back
 *  to the ringNex contact, and return { contactId, isNew, localId }.
 *  Shared by the call-end sync and the call-note push. */
export async function syncCallContact(tenantId, call) {
  const digits = customerDigits(call);
  if (!digits) return null;

  const last10 = digits.slice(-10);
  const cand = [...new Set([digits, last10, `+${digits}`, `+1${last10}`, `1${last10}`])];
  let local = null;
  try {
    const [rows] = await db.query(
      `SELECT c.id, c.first_name, c.last_name, c.ghl_contact_id
         FROM contact_phones p
         JOIN contacts c ON c.id = p.contact_id AND c.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.number IN (${cand.map(() => "?").join(",")})
        LIMIT 1`,
      [tenantId, ...cand]
    );
    local = rows[0] || null;
  } catch {
    /* contact_phones shape differs — proceed without a local match */
  }

  const first = local?.first_name || "";
  const last = local?.last_name || "";
  const name = [first, last].filter(Boolean).join(" ").trim();

  const { contactId, isNew } = await upsertContact(tenantId, {
    phone: `+${digits}`,
    firstName: first || undefined,
    lastName: last || undefined,
    name: name || undefined,
    source: "ringNex"
  });
  if (!contactId) return null;

  if (local && !local.ghl_contact_id) {
    await db.execute("UPDATE contacts SET ghl_contact_id = ? WHERE id = ? AND tenant_id = ?", [
      contactId,
      local.id,
      tenantId
    ]);
  }
  return { contactId, isNew, localId: local?.id || null, name: name || `+${digits}` };
}

/** The one place a call-end popup submit is applied to GHL: upsert the
 *  contact (name/address/tags), link it to the ringNex contact, push a
 *  note, and create / update / skip an opportunity.
 *
 *  opportunity: { mode: "none"|"create"|"update", opportunityId?,
 *                 pipelineId?, pipelineStageId?, status? }
 *  mode omitted → default: create in the owner's configured pipeline, but
 *  only for a brand-new GHL contact when create_opportunity is on. */
export async function applyCallOutcome(tenantId, { phone, contactName, address, tags, note, opportunity }) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 7) return { skipped: "bad phone" };

  const last10 = digits.slice(-10);
  const cand = [...new Set([digits, last10, `+${digits}`, `+1${last10}`, `1${last10}`])];
  let local = null;
  try {
    const [rows] = await db.query(
      `SELECT c.id, c.ghl_contact_id
         FROM contact_phones p
         JOIN contacts c ON c.id = p.contact_id AND c.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.number IN (${cand.map(() => "?").join(",")})
        LIMIT 1`,
      [tenantId, ...cand]
    );
    local = rows[0] || null;
  } catch {
    /* skip local link */
  }

  const parts = String(contactName || "").trim().split(/\s+/).filter(Boolean);
  const first = parts.shift() || "";
  const { contactId, isNew } = await upsertContact(tenantId, {
    phone: `+${digits}`,
    firstName: first || undefined,
    lastName: parts.join(" ") || undefined,
    name: contactName || undefined,
    address1: address || undefined,
    source: "ringNex",
    tags: tags && tags.length ? tags : undefined
  });
  if (!contactId) return { skipped: "no contact id" };

  if (local && !local.ghl_contact_id) {
    await db.execute("UPDATE contacts SET ghl_contact_id = ? WHERE id = ? AND tenant_id = ?", [
      contactId,
      local.id,
      tenantId
    ]);
  }

  if (note && note.trim()) await addContactNote(tenantId, contactId, note.trim());

  const conn = await getConnection(tenantId);
  const opp = opportunity || {};
  let opportunityResult = null;
  if (opp.mode === "update" && opp.opportunityId) {
    opportunityResult = await updateOpportunity(tenantId, opp.opportunityId, {
      pipelineId: opp.pipelineId,
      pipelineStageId: opp.pipelineStageId,
      status: opp.status
    });
  } else if (opp.mode === "create" && opp.pipelineId && opp.pipelineStageId) {
    opportunityResult = await createOpportunity(tenantId, {
      contactId,
      name: contactName || `+${digits}`,
      pipelineId: opp.pipelineId,
      pipelineStageId: opp.pipelineStageId,
      status: opp.status
    });
  } else if (!opp.mode && isNew && conn?.createOpportunity && conn.pipelineId && conn.pipelineStageId) {
    opportunityResult = await createOpportunity(tenantId, { contactId, name: contactName || `+${digits}` });
  }

  await db.execute(
    "UPDATE tenant_ghl_connections SET last_sync_at = NOW(), last_error = NULL WHERE tenant_id = ?",
    [tenantId]
  );
  return { contactId, isNew, opportunity: opportunityResult };
}

/** Lead Management End Call popup → GHL: remarks (with disposition) become
 *  the note; the agent's GHL opportunity choice (if any) is applied. */
export function syncLeadFromCall(tenantId, { phone, name, address, dispositionName, remarks, tags, ghlOpportunity }) {
  const note = [dispositionName ? `[${dispositionName}]` : "", remarks || ""].join(" ").trim();
  return applyCallOutcome(tenantId, {
    phone,
    contactName: name,
    address,
    tags,
    note,
    opportunity: ghlOpportunity || null
  });
}

/** Every contact in the connected GHL location (paged), capped. */
export async function listAllContacts(tenantId, { max = 2000 } = {}) {
  const conn = await getConnection(tenantId);
  if (!conn) return [];
  const out = [];
  let startAfter;
  let startAfterId;
  while (out.length < max) {
    const qs = new URLSearchParams({ locationId: conn.locationId, limit: "100" });
    if (startAfterId) {
      qs.set("startAfterId", startAfterId);
      if (startAfter != null) qs.set("startAfter", String(startAfter));
    }
    let data;
    try {
      data = await ghlFetch(tenantId, `/contacts/?${qs.toString()}`, { conn });
    } catch (e) {
      console.warn("[ghl] listAllContacts page failed:", e.message);
      break;
    }
    const batch = data.contacts || [];
    out.push(...batch);
    const meta = data.meta || {};
    if (batch.length < 100 || !meta.startAfterId) break;
    startAfterId = meta.startAfterId;
    startAfter = meta.startAfter;
  }
  return out.slice(0, max);
}

export async function listPipelines(tenantId) {
  const conn = await getConnection(tenantId);
  if (!conn) return [];
  const data = await ghlFetch(tenantId, `/opportunities/pipelines?locationId=${encodeURIComponent(conn.locationId)}`, {
    conn
  });
  return (data.pipelines || []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: (p.stages || []).map((s) => ({ id: s.id, name: s.name }))
  }));
}

if (isGhlConfigured()) {
  console.log(`[ghl] configured — redirect ${config.ghl.redirectUri}`);
}
