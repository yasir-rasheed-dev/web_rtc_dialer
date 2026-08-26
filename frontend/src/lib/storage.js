const CONFIG_KEY = "ringnex-dialer-config-v1";
const HISTORY_KEY = "ringnex-dialer-history-v1";
const PASSWORD_KEY = "ringnex-dialer-tab-secret-v1";

export const DEFAULT_CONFIG = {
  username: import.meta.env.VITE_DEFAULT_SIP_USER || "webdialer01",
  displayName: "Ringnex Agent",
  domain: import.meta.env.VITE_SIP_DOMAIN || "asterisk.ringnex.co",
  wssUrl: import.meta.env.VITE_WSS_URL || "wss://asterisk.ringnex.co/ws"
};

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function loadConfig() {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...parseJson(localStorage.getItem(CONFIG_KEY), {}) };
}

export function saveConfig(config) {
  const safe = {
    username: config.username,
    displayName: config.displayName,
    domain: config.domain,
    wssUrl: config.wssUrl
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(safe));
}

export function loadHistory() {
  if (typeof window === "undefined") return [];
  const history = parseJson(localStorage.getItem(HISTORY_KEY), []);
  return Array.isArray(history) ? history.slice(0, 20) : [];
}

export function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
}

export function loadTabPassword() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(PASSWORD_KEY) || "";
}

export function saveTabPassword(password) {
  if (password) sessionStorage.setItem(PASSWORD_KEY, password);
  else sessionStorage.removeItem(PASSWORD_KEY);
}
