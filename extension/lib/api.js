// Fetch wrapper for the ringNex backend, shared by the service worker and
// the side panel. Tokens live in chrome.storage.local; an expired access
// token is silently swapped via /api/auth/refresh (single-flight).
import { API_BASE, STORE } from "../config.js";

async function get(key) {
  const o = await chrome.storage.local.get(key);
  return o[key] || "";
}
async function set(obj) {
  await chrome.storage.local.set(obj);
}

export async function getToken() {
  return get(STORE.token);
}
export async function getSession() {
  const o = await chrome.storage.local.get(STORE.session);
  return o[STORE.session] || null;
}
export async function setAuth({ token, refreshToken, session }) {
  const patch = {};
  if (token !== undefined) patch[STORE.token] = token || "";
  if (refreshToken !== undefined) patch[STORE.refresh] = refreshToken || "";
  if (session !== undefined) patch[STORE.session] = session || null;
  await set(patch);
}
export async function clearAuth() {
  await chrome.storage.local.remove([STORE.token, STORE.refresh, STORE.session]);
}

let refreshing = null;
async function refreshAccessToken() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const rt = await get(STORE.refresh);
    if (!rt) return null;
    try {
      const r = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken: rt })
      });
      if (!r.ok) {
        await clearAuth();
        return null;
      }
      const d = await r.json();
      await setAuth({ token: d.token, refreshToken: d.refreshToken });
      return d.token || null;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api(path, options = {}, _retried = false) {
  const token = await getToken();
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
  });

  if (res.status === 401 && !_retried && path !== "/auth/refresh" && path !== "/auth/login") {
    const body = await res.clone().json().catch(() => null);
    if (body?.error === "TOKEN_EXPIRED") {
      const fresh = await refreshAccessToken();
      if (fresh) return api(path, options, true);
    }
    await clearAuth();
    chrome.runtime.sendMessage({ type: "auth:expired" }).catch(() => {});
  }

  if (res.status === 204) return null;
  const payload = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    const err = new Error(payload?.message || payload?.error || `Request failed (${res.status})`);
    err.code = typeof payload === "object" ? payload?.error : undefined;
    err.status = res.status;
    throw err;
  }
  return payload;
}
