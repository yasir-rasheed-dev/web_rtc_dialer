import { CONFIG } from "./config";
import { clearAuth, getAccessToken, getRefreshToken, setAuthTokens } from "./auth";

// Ported 1:1 from frontend/src/lib/api.js — same endpoints, same
// single-flight refresh + one replay on TOKEN_EXPIRED, same
// SESSION_REVOKED / REFRESH_REUSED handling.

type ApiOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

let refreshInFlight: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

/** Fired when the session is dead for good — the app should drop to login. */
export function onAuthExpired(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function emitAuthExpired() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* noop */
    }
  });
}

export async function refreshSession() {
  return refreshAccessToken();
}

function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const rt = getRefreshToken();
  if (!rt) return Promise.resolve(null);

  refreshInFlight = fetch(`${CONFIG.apiBase}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refreshToken: rt })
  })
    .then(async (res) => {
      if (!res.ok) {
        await clearAuth();
        return null;
      }
      const data = (await res.json().catch(() => null)) as { token?: string; refreshToken?: string } | null;
      if (!data?.token) {
        await clearAuth();
        return null;
      }
      await setAuthTokens(data);
      return data.token;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

async function rawFetch(path: string, options: ApiOptions, token: string) {
  const headers: Record<string, string> = { Accept: "application/json", ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody) headers["Content-Type"] = "application/json";
  return fetch(`${CONFIG.apiBase}/api${path}`, {
    method: options.method ?? "GET",
    headers,
    signal: options.signal,
    body: hasBody ? JSON.stringify(options.body) : undefined
  });
}

export async function api<T = any>(path: string, options: ApiOptions = {}, retried = false): Promise<T> {
  const token = getAccessToken();
  let res = await rawFetch(path, options, token);

  if (res.status === 401 && !retried && path !== "/auth/refresh" && path !== "/auth/login") {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    if (body?.error === "TOKEN_EXPIRED" && getRefreshToken()) {
      const fresh = await refreshAccessToken();
      if (fresh) return api<T>(path, options, true);
      emitAuthExpired();
    } else if (body?.error === "SESSION_REVOKED" || body?.error === "REFRESH_REUSED") {
      await clearAuth();
      emitAuthExpired();
    }
  }

  const text = await res.text();
  const data = text ? safeParse(text) : null;
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }
  return data as T;
}

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
