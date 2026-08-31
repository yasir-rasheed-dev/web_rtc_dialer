import { API_BASE } from "./apiConfig";

const TOKEN_KEY = "ringnex.console.token";
const SUPER_TOKEN_KEY = "ringnex.superadmin.token";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getSuperAdminToken() {
  return sessionStorage.getItem(SUPER_TOKEN_KEY) || "";
}

export function setSuperAdminToken(token) {
  if (token) sessionStorage.setItem(SUPER_TOKEN_KEY, token);
  else sessionStorage.removeItem(SUPER_TOKEN_KEY);
}

async function request(path, options = {}, token = "") {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
  });
  if (response.status === 204) return null;
  const payload = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || payload || `Request failed (${response.status})`);
    // Machine-readable code (e.g. "SESSION_ACTIVE", "IP_RESTRICTED") for
    // callers that need to branch on the failure type, not just show it.
    error.code = typeof payload === "object" ? payload?.error : undefined;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function api(path, options = {}) {
  return request(path, options, getToken());
}

export function superApi(path, options = {}) {
  return request(path, options, getSuperAdminToken());
}

// Streams a call-report export (csv/xlsx/pdf) and reports download progress
// as it arrives, instead of waiting for the whole file then jumping to 100%
// — the point being a tenant with millions of rows sees a bar actually move.
//
// Progress math differs per format because the server can't give an
// upfront byte size for two of the three:
//  - xlsx is built fully in memory server-side, so Content-Length is exact
//    -> real byte-based percentage.
//  - csv is row-streamed with an X-Total-Rows header, and rows are
//    newline-delimited, so counting '\n' bytes as they arrive gives an
//    exact row-based percentage.
//  - pdf is also row-streamed with X-Total-Rows but has no reliable
//    in-stream row delimiter to count from binary bytes, so its percentage
//    is an estimate (assumed bytes/row) capped below 100 until the stream
//    actually finishes, then snapped to 100.
export async function exportCallReport({ direction, filters = {}, format, onProgress }) {
  const query = new URLSearchParams({ direction, format });
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });

  const response = await fetch(`${API_BASE}/api/calls/export?${query.toString()}`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Export failed (${response.status})`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  const totalRows = Number(response.headers.get("x-total-rows") || 0);
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `report.${format}`;

  const reader = response.body.getReader();
  const chunks = [];
  let bytesReceived = 0;
  let rowsSeen = 0;
  const ESTIMATED_PDF_BYTES_PER_ROW = 70;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytesReceived += value.length;

    let percent = 0;
    if (contentLength > 0) {
      percent = Math.min(99, Math.round((bytesReceived / contentLength) * 100));
    } else if (format === "csv") {
      for (let i = 0; i < value.length; i += 1) if (value[i] === 10) rowsSeen += 1;
      percent = totalRows > 0 ? Math.min(99, Math.round((rowsSeen / totalRows) * 100)) : 0;
    } else if (totalRows > 0) {
      percent = Math.min(96, Math.round((bytesReceived / (totalRows * ESTIMATED_PDF_BYTES_PER_ROW)) * 100));
    }
    onProgress?.(percent, { bytesReceived, totalRows });
  }

  onProgress?.(100, { bytesReceived, totalRows });

  const blob = new Blob(chunks);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Tab counters for the Call Logs page — all four (all/incoming/outgoing/
// missed) in one call, against the shared filters only (date/agent/
// search — never direction/status/outcome, which the tabs control).
export function getCallCounts(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  return api(`/calls/counts?${query.toString()}`);
}

// Resolves a raw caller number into a saved contact's name or a teammate's
// name (if it's actually an internal extension) — {type:"agent"|"contact"
// |null, name}. Used by the Toll-Free Live Dashboard's activity table.
export function lookupCallerIdentity(number) {
  return api(`/contacts/lookup?number=${encodeURIComponent(number)}`);
}

export async function recordingBlob(callId) {
  const response = await fetch(`${API_BASE}/api/recordings/${encodeURIComponent(callId)}`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Recording could not be loaded");
  }
  return URL.createObjectURL(await response.blob());
}

// ---------------------------
// Commio DID purchase (Tenant Owner / Tenant Admin only, PURCHASE_DIDS)
// ---------------------------

export function searchCommioNumbers(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  return api(`/dids/commio/search?${query.toString()}`).then((payload) => payload.numbers || []);
}

// Reserves the number with Commio (does not charge) and returns a price
// quote — the caller must still call completeCommioOrder to actually buy it.
// numberType ("LOCAL"/"TOLLFREE") records which search produced this DID,
// so the purchased tenant_dids row ends up correctly tagged.
export function reserveCommioNumber(did, numberType = "LOCAL") {
  return api("/dids/commio/orders", { method: "POST", body: { did, numberType } });
}

// This is the step that actually charges the tenant's Commio account.
export function completeCommioOrder(orderId) {
  return api(`/dids/commio/orders/${encodeURIComponent(orderId)}/complete`, { method: "POST" });
}

// ---------------------------
// Toll-free inbound campaigns / IVRs (VIEW_TOLL_FREE / MANAGE_TOLL_FREE_CAMPAIGNS)
// ---------------------------

export function listTollFreeNumbers() {
  return api("/toll-free/numbers").then((payload) => payload.numbers || []);
}

export function listTollFreeCampaigns() {
  return api("/toll-free/campaigns").then((payload) => payload.campaigns || []);
}

export function getTollFreeCampaign(id) {
  return api(`/toll-free/campaigns/${encodeURIComponent(id)}`);
}

export function createTollFreeCampaign(body) {
  return api("/toll-free/campaigns", { method: "POST", body });
}

export function updateTollFreeCampaign(id, body) {
  return api(`/toll-free/campaigns/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function deleteTollFreeCampaign(id) {
  return api(`/toll-free/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listTollFreeIvrs() {
  return api("/toll-free/ivrs").then((payload) => payload.ivrs || []);
}

export function getTollFreeIvr(id) {
  return api(`/toll-free/ivrs/${encodeURIComponent(id)}`);
}

export function createTollFreeIvr(body) {
  return api("/toll-free/ivrs", { method: "POST", body });
}

export function updateTollFreeIvr(id, body) {
  return api(`/toll-free/ivrs/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function deleteTollFreeIvr(id) {
  return api(`/toll-free/ivrs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Live snapshot (not history) of one campaign's queue — how many callers
// are on hold right now. Safe to poll; never throws (the backend returns
// {ok:false} rather than an HTTP error if Asterisk/AMI is unreachable).
export function getTollFreeQueueStatus(campaignId) {
  return api(`/toll-free/campaigns/${encodeURIComponent(campaignId)}/queue-status`);
}

// Per-number rollup (total/answered/abandoned/avg wait) for the Reports >
// Toll-Free hub. Row-level detail for one number is GET /calls?toNumber=...
export function getTollFreeReportSummary({ from, to } = {}) {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  return api(`/toll-free/reports/summary?${query.toString()}`);
}
