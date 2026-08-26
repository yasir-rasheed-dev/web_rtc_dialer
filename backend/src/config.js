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
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
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
  recordingRetentionDays: integer("RECORDING_RETENTION_DAYS", 90)
});
