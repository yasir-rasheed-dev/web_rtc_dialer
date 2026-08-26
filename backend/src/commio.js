import { config } from "./config.js";

// Thin client for Commio's origination/DID API (https://apidocs.thinq.com).
// Every call spends real account balance or reserves a real DID, so this
// module intentionally does nothing clever — one function per Commio
// endpoint, no retries, no caching.

function assertConfigured() {
  const { username, token, accountId } = config.commio;
  if (!username || !token || !accountId) {
    throw new Error("Commio API is not configured (COMMIO_CDR_API_USERNAME/TOKEN/ACCOUNT_ID missing)");
  }
}

function authHeader() {
  const { username, token } = config.commio;
  return `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`;
}

async function commioFetch(path, options = {}) {
  assertConfigured();
  const response = await fetch(`${config.commio.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      // Always sent, even on the empty-body POSTs (completeOrder,
      // cancelOrder) — Commio's API rejects those with "Invalid
      // Content-Type ()" if the header is absent entirely.
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Commio API request failed (${response.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return payload;
}

// searchType: "domestic" | "tollfree". searchBy: "npa" | "npanxx" | "ratecenter" (domestic only).
export async function searchNumbers({ searchType = "domestic", searchBy, npa, nxx, state, rateCenter, quantity = 5 }) {
  const params = new URLSearchParams({
    searchType,
    quantity: String(Math.min(Math.max(Number(quantity) || 1, 1), 25)),
    contiguous: "false",
    related: "false"
  });
  if (searchBy) params.set("searchBy", searchBy);
  if (npa) params.set("npa", String(npa));
  if (nxx) params.set("nxx", String(nxx));
  if (state) params.set("state", String(state));
  if (rateCenter) params.set("rateCenter", String(rateCenter));
  const payload = await commioFetch(`/inbound/get-numbers?${params.toString()}`);
  return payload.dids || [];
}

// Reserves the number (does not charge). Returns { id: orderId, ... }.
export async function createOrder(did) {
  const body = {
    order: {
      tns: [{ did: Number(did), caller_id: null, account_location_id: null, features: { cnam: false, sms: false, e911: false } }],
      blocks: []
    }
  };
  return commioFetch(`/account/${config.commio.accountId}/origination/order/create`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

// Same URL as completeOrder, GET instead of POST — this is Commio's actual
// "Retrieve Order Price" contract, not a typo.
export async function getOrderPrice(orderId) {
  return commioFetch(`/account/${config.commio.accountId}/origination/order/complete/${encodeURIComponent(orderId)}`, {
    method: "GET"
  });
}

// Finalizes the order — this is the step that actually charges the account.
export async function completeOrder(orderId) {
  return commioFetch(`/account/${config.commio.accountId}/origination/order/complete/${encodeURIComponent(orderId)}`, {
    method: "POST"
  });
}

// routeId is always this tenant's own tenants.commio_routing_profile_id —
// no shared fallback. A tenant that somehow has none set (never happens for
// setups created through the Super Admin flow, which always assigns one)
// must get one assigned there before DIDs can be purchased/routed for it.
export async function assignRouting(did, routeId) {
  if (!routeId) throw new Error("This tenant has no Commio routing profile assigned yet");
  const body = { routing: [{ did: Number(did), route_id: Number(routeId) }] };
  return commioFetch(`/account/${config.commio.accountId}/origination/did/routing`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

// Every existing routing profile on this Commio account (name + id) — lets
// Super Admin pick one instead of having to already know its numeric id.
export async function listRoutingProfiles() {
  const payload = await commioFetch(`/account/${config.commio.accountId}/staticinrouteprofile`, { method: "GET" });
  return (payload.rows || []).map((row) => ({ id: row.id, name: row.name }));
}

// Creates a dedicated inbound routing profile ("InRouteGroup") pointed at
// the fixed Asterisk trunk (config.commio.trunkHost/trunkPort) — the trunk
// itself is the same physical destination for every tenant, only the
// profile id is per-tenant. Returns the new route_id.
export async function createRoutingProfile(name) {
  const body = {
    profile: {
      name: String(name || "Ringnex tenant").slice(0, 64),
      inboundRoutes: [
        { routeType: "IP", routeToAddress: config.commio.trunkHost, routePort: config.commio.trunkPort }
      ]
    }
  };
  const payload = await commioFetch(`/account/${config.commio.accountId}/staticinrouteprofile/`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  const routeId = payload?.profile?.id ?? payload?.id;
  if (!routeId) throw new Error("Commio did not return a routing profile id");
  return routeId;
}

// Real per-number outbound call cost from Commio's CDR API, for the given
// date range. Commio's /outbound/cdrs only filters by a single `didFrom`,
// so callers loop this once per DID they want cost for and sum the result.
// Paginated defensively (a busy DID over a full month could span pages);
// capped at 10 pages (5,000 rows) — this is a per-DID cost lookup for a
// billing summary, not a bulk export, so that ceiling is intentional.
export async function getOutboundCdrCost({ dateStart, dateEnd, didFrom }) {
  // tenant_dids.number has historically been entered inconsistently (some
  // rows carry a leading "+", some don't) — Commio's didFrom filter expects
  // bare digits, so a "+"-prefixed number would silently match nothing
  // rather than error.
  const normalizedDidFrom = String(didFrom).replace(/\D/g, "");
  let page = 1;
  let totalCost = 0;
  let totalCalls = 0;
  for (; page <= 10; page += 1) {
    const params = new URLSearchParams({
      rowsPerPage: "500",
      currentPage: String(page),
      sort: "desc",
      dateStart,
      dateEnd,
      didFrom: normalizedDidFrom
    });
    const payload = await commioFetch(`/outbound/cdrs?${params.toString()}`);
    const rows = payload.data || [];
    for (const row of rows) {
      totalCost += Number(row.totalRetail ?? row.total_retail ?? row.retail ?? 0);
      totalCalls += 1;
    }
    if (!payload.hasNextPage) break;
  }
  return { cost: totalCost, calls: totalCalls };
}

export async function cancelOrder(orderId) {
  return commioFetch(`/account/${config.commio.accountId}/origination/order/cancel/${encodeURIComponent(orderId)}`, {
    method: "POST"
  });
}
