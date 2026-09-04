import "dotenv/config";
import path from "node:path";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("CHANGE_ME")) {
    throw new Error(`Missing or unsafe environment variable: ${name}`);
  }
  return value;
}

function integer(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
  return value;
}

const credentialKey = Buffer.from(required("SIP_CREDENTIAL_KEY"), "base64");
if (credentialKey.length !== 32) {
  throw new Error("SIP_CREDENTIAL_KEY must decode to exactly 32 bytes");
}

export const config = Object.freeze({
  env: process.env.NODE_ENV || "development",
  port: integer("PORT", 3100),
  trustProxy: Number(process.env.TRUST_PROXY || 1),
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  // Comma-separated list of additional allowed origins, e.g. the Electron
  // desktop app's custom "app://" scheme origin and its dev-server origin.
  frontendOrigins: (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .concat(
      (process.env.EXTRA_FRONTEND_ORIGINS || "app://myaiobyoc,http://localhost:3001")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: integer("DB_PORT", 3306),
    database: process.env.DB_NAME || "ringnex_dialer",
    user: required("DB_USER"),
    password: required("DB_PASSWORD")
  },
  jwtSecret: required("JWT_SECRET"),
  // Short access-token life is now safe because a refresh token silently
  // re-issues it (see refresh_tokens migration + /api/auth/refresh). Set
  // JWT_EXPIRES_IN=30m in .env; the 8h fallback only keeps older
  // deployments working until they do.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  refreshTtlDays: integer("REFRESH_TOKEN_TTL_DAYS", 30),
  credentialKey,
  publicWssUrl: process.env.PUBLIC_WSS_URL || "wss://asterisk.ringnex.co/ws",
  publicSipDomain: process.env.PUBLIC_SIP_DOMAIN || "asterisk.ringnex.co",
  ami: {
    host: process.env.AMI_HOST || "127.0.0.1",
    port: integer("AMI_PORT", 5040),
    username: required("AMI_USERNAME"),
    secret: required("AMI_SECRET")
  },
  recordingRoot: path.resolve(
    process.env.RECORDING_ROOT || "/opt/ringnex-webrtc/var/spool/asterisk/monitor"
  ),
  recordingRetentionDays: integer("RECORDING_RETENTION_DAYS", 90),
  // Deliberately separate from recordingRoot/RECORDING_ROOT — voicemails
  // (agent-busy-decline recordings) live in their own spool directory on
  // the Asterisk box, mounted onto this server the same SSHFS way, but as
  // its own mount so the two never mix.
  voicemailRoot: path.resolve(
    process.env.VOICEMAIL_ROOT || "/opt/ringnex-webrtc/var/spool/asterisk/voicemail-custom"
  ),
  // Not `required()`: absent on deployments that don't use DID purchasing.
  // commio.js checks these itself and fails the request (not server boot)
  // if a purchase route is actually hit without them configured.
  commio: {
    baseUrl: process.env.COMMIO_API_BASE_URL || "https://api.thinq.com",
    username: process.env.COMMIO_CDR_API_USERNAME || "",
    token: process.env.COMMIO_CDR_API_TOKEN || "",
    accountId: process.env.COMMIO_ACCOUNT_ID || "",
    // Fixed physical Asterisk trunk endpoint — the same for every tenant on
    // this box, so this is the only piece of routing config that's still a
    // static env value. What's no longer static is the routing PROFILE id
    // itself: each tenant now gets its own (tenants.commio_routing_profile_id),
    // pointing at this same trunk, instead of everyone sharing one profile.
    trunkHost: process.env.COMMIO_TRUNK_HOST || "5.78.77.240",
    trunkPort: process.env.COMMIO_TRUNK_PORT || "5071"
  },
  // Desktop releases are published as GitHub Releases. The backend proxies
  // them (GET /api/public/releases*) so a private repo + token stay
  // server-side and the marketing site isn't rate-limited. A token is only
  // needed if the repo is private.
  github: {
    repo: process.env.GITHUB_REPO || "yasir-rasheed-dev/web_rtc_dialer",
    token: process.env.GITHUB_TOKEN || ""
  }
});
