// Live ringNex backend. The SIP domain / WebSocket URL are NOT hard-coded
// here on purpose — they come back from GET /api/auth/session as
// session.sip.{domain,wssUrl}, so this stays correct if the Asterisk edge
// ever moves.
export const API_BASE = "https://demoapi.ringnex.co";

// chrome.storage keys
export const STORE = {
  token: "rnx_token",
  refresh: "rnx_refresh",
  workspace: "rnx_workspace",
  session: "rnx_session" // cached { user, sip, permissions }
};
