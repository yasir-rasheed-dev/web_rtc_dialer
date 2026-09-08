import * as SecureStore from "expo-secure-store";

// Access + refresh tokens live in the OS keychain / keystore (SecureStore),
// so closing or killing the app never logs the user out — the refresh
// token brings the session back silently (POST /api/auth/refresh), exactly
// like the web/desktop clients.
const ACCESS_KEY = "ringnex.access";
const REFRESH_KEY = "ringnex.refresh";

let accessCache: string | null = null;
let refreshCache: string | null = null;

async function read(key: string): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(key)) ?? "";
  } catch {
    return "";
  }
}

async function write(key: string, value: string) {
  try {
    if (value) await SecureStore.setItemAsync(key, value);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    /* keystore unavailable — session just won't persist */
  }
}

export async function loadTokens() {
  accessCache = await read(ACCESS_KEY);
  refreshCache = await read(REFRESH_KEY);
  return { access: accessCache, refresh: refreshCache };
}

export function getAccessToken() {
  return accessCache ?? "";
}

export function getRefreshToken() {
  return refreshCache ?? "";
}

export async function setAuthTokens(payload: { token?: string; refreshToken?: string }) {
  if (payload.token !== undefined) {
    accessCache = payload.token;
    await write(ACCESS_KEY, payload.token);
  }
  if (payload.refreshToken !== undefined) {
    refreshCache = payload.refreshToken;
    await write(REFRESH_KEY, payload.refreshToken);
  }
}

export async function clearAuth() {
  accessCache = "";
  refreshCache = "";
  await write(ACCESS_KEY, "");
  await write(REFRESH_KEY, "");
}
