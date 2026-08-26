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
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
  });
  if (response.status === 204) return null;
  const payload = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) throw new Error(payload?.error || payload || `Request failed (${response.status})`);
  return payload;
}

export function api(path, options = {}) {
  return request(path, options, getToken());
}

export function superApi(path, options = {}) {
  return request(path, options, getSuperAdminToken());
}

export async function recordingBlob(callId) {
  const response = await fetch(`/api/recordings/${encodeURIComponent(callId)}`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Recording could not be loaded");
  }
  return URL.createObjectURL(await response.blob());
}
