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
export async function upsertContact(tenantId, { firstName, lastName, name, phone, email, source, tags }) {
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

export async function createOpportunity(tenantId, { contactId, name, monetaryValue }) {
  const conn = await getConnection(tenantId);
  if (!conn || !conn.pipelineId || !conn.pipelineStageId) {
    return { skipped: "no pipeline configured" };
  }
  return ghlFetch(tenantId, "/opportunities/", {
    method: "POST",
    conn,
    body: {
      pipelineId: conn.pipelineId,
      locationId: conn.locationId,
      pipelineStageId: conn.pipelineStageId,
      name: name || "New opportunity",
      status: "open",
      contactId,
      ...(monetaryValue ? { monetaryValue: Number(monetaryValue) } : {})
    }
  });
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
