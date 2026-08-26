import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("Password must be at least 12 characters");
  }
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      scope: "tenant",
      tenantId: user.tenant_id,
      roleId: user.role_id || null,
      name: user.name,
      // Ties this token to one active login — authenticate() rejects any
      // token whose sid no longer matches users.current_session_id, which
      // is how a newer login on another device revokes this one instantly.
      sid: user.current_session_id || null
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: "ringnex-dialer" }
  );
}

// Short-lived token that carries a partially-authenticated login (password
// verified, 2FA still outstanding) between /auth/login and /auth/2fa/*.
// Never usable against any authenticated route — verifyToken callers key
// off `scope`, and "2fa-setup"/"2fa-verify" are rejected everywhere except
// the 2FA endpoints themselves.
export function signPendingToken(payload, expiresIn = "10m") {
  return jwt.sign(payload, config.jwtSecret, { expiresIn, issuer: "ringnex-dialer" });
}

export function signSuperAdminToken(admin) {
  return jwt.sign(
    { sub: admin.id, scope: "super-admin", name: admin.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: "ringnex-dialer" }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { issuer: "ringnex-dialer" });
}

export function encryptSipSecret(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", config.credentialKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

// Generic aliases — encryptSipSecret/decryptSipSecret are plain AES-256-GCM
// value encryption with nothing SIP-specific in the implementation; reused
// here for TOTP secrets under names that don't imply telephony.
export const encryptSecret = encryptSipSecret;
export const decryptSecret = decryptSipSecret;

export function decryptSipSecret(payload) {
  if (!payload) return "";
  const [version, ivText, tagText, ciphertextText] = payload.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) {
    throw new Error("Unsupported encrypted SIP credential");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    config.credentialKey,
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function sanitizeUser(user) {
  return {
    id: user.id,
    tenantId: user.tenant_id,
    email: user.email,
    name: user.name,
    roleId: user.role_id || null,
    roleName: user.role_name || user.role || "User",
    // Legacy role is retained during migration for backwards compatibility only.
    role: user.role,
    sipUsername: user.sip_username,
    extension: user.extension,
    callerIdNumber: user.caller_id_number,
    teamName: user.team_name,
    status: user.status,
    active: Boolean(user.active)
  };
}
