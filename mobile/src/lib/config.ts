import Constants from "expo-constants";

type Extra = {
  apiBase?: string;
  sipDomain?: string;
  wssUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const CONFIG = {
  // Live backend — same one the web app / desktop / extension use.
  apiBase: extra.apiBase ?? "https://demoapi.ringnex.co",
  sipDomain: extra.sipDomain ?? "asterisk.ringnex.co",
  wssUrl: extra.wssUrl ?? "wss://asterisk.ringnex.co/webrtc-ws"
};

export const API_URL = (path: string) => `${CONFIG.apiBase}/api${path.startsWith("/") ? path : `/${path}`}`;
