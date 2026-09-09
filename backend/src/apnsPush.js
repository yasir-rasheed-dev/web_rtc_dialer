import fs from "node:fs";
import http2 from "node:http2";

import jwt from "jsonwebtoken";

import { config } from "./config.js";

// Direct APNs (HTTP/2 + token auth). The Expo iOS app registers a raw APNs
// device token via getDevicePushTokenAsync() — NOT an FCM token — so those
// tokens can't go through Firebase Admin. Everything else (Android / web /
// electron) still goes through firebaseAdmin.js unchanged.

const APNS_HOST_PROD = "https://api.push.apple.com";
const APNS_HOST_SANDBOX = "https://api.sandbox.push.apple.com";
const CONCURRENCY = 10;

function loadKey() {
  const { keyPath, key } = config.apns;
  if (key) return key;
  if (keyPath && fs.existsSync(keyPath)) return fs.readFileSync(keyPath, "utf8");
  return "";
}

const KEY_PEM = loadKey();

export function isApnsConfigured() {
  return Boolean(config.apns.keyId && config.apns.teamId && KEY_PEM);
}

// --- provider auth token (ES256 JWT), cached — Apple wants it reused for
// up to ~1h and refreshed at least every ~20m; 40m is a safe middle. ---
let cachedToken = null;
let cachedAt = 0;
function providerToken() {
  const now = Date.now();
  if (cachedToken && now - cachedAt < 40 * 60 * 1000) return cachedToken;
  cachedToken = jwt.sign({}, KEY_PEM, {
    algorithm: "ES256",
    keyid: config.apns.keyId,
    issuer: config.apns.teamId,
    expiresIn: "1h"
  });
  cachedAt = now;
  return cachedToken;
}

// --- one long-lived HTTP/2 session, re-created on drop / GOAWAY ---
let session = null;
function getSession() {
  if (session && !session.closed && !session.destroyed) return session;
  const host = config.apns.production ? APNS_HOST_PROD : APNS_HOST_SANDBOX;
  session = http2.connect(host);
  session.on("error", (e) => {
    console.warn("[apns] session error:", e.message);
  });
  session.on("goaway", () => {
    console.warn("[apns] GOAWAY — will reconnect on next send");
    try {
      session.close();
    } catch {
      /* noop */
    }
    session = null;
  });
  session.on("close", () => {
    session = null;
  });
  return session;
}

const DEAD_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
  "TopicDisallowed",
  "ExpiredToken"
]);

function sendOne(token, payload, { pushType, priority }) {
  return new Promise((resolve) => {
    let s;
    try {
      s = getSession();
    } catch (e) {
      return resolve({ ok: false, dead: false, err: e.message });
    }
    const body = Buffer.from(JSON.stringify(payload));
    const req = s.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${providerToken()}`,
      "apns-topic": config.apns.bundleId,
      "apns-push-type": pushType,
      "apns-priority": String(priority),
      "content-type": "application/json",
      "content-length": body.length
    });

    let status = 0;
    let data = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (status === 200) return resolve({ ok: true, dead: false });
      let reason = "";
      try {
        reason = JSON.parse(data || "{}").reason || "";
      } catch {
        /* noop */
      }
      const dead = status === 410 || DEAD_REASONS.has(reason);
      if (!dead) console.warn(`[apns] send failed status=${status} reason=${reason || "?"}`);
      resolve({ ok: false, dead, err: reason || `status ${status}` });
    });
    req.on("error", (e) => {
      console.warn("[apns] request error:", e.message);
      resolve({ ok: false, dead: false, err: e.message });
    });
    req.end(body);
  });
}

async function sendMany(tokens, payload, opts) {
  const uniq = [...new Set((tokens || []).filter(Boolean))];
  if (!isApnsConfigured() || !uniq.length) return { successCount: 0, invalidTokens: [] };

  let successCount = 0;
  const invalidTokens = [];
  for (let i = 0; i < uniq.length; i += CONCURRENCY) {
    const batch = uniq.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((t) => sendOne(t, payload, opts)));
    results.forEach((r, idx) => {
      if (r.ok) successCount += 1;
      else if (r.dead) invalidTokens.push(batch[idx]);
    });
  }
  return { successCount, invalidTokens };
}

const strData = (data = {}) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "")]));

/** Visible notification (Team Chat message). */
export function sendApnsAlert(tokens, { title, body, data = {} }) {
  return sendMany(
    tokens,
    { aps: { alert: { title, body }, sound: "default", "mutable-content": 1 }, ...strData(data) },
    { pushType: "alert", priority: 10 }
  );
}

/** Silent wake (content-available) — used to nudge a killed app for an
 *  inbound call. Apple throttles these, so it's best-effort. */
export function sendApnsBackground(tokens, data = {}) {
  return sendMany(
    tokens,
    { aps: { "content-available": 1 }, ...strData(data) },
    { pushType: "background", priority: 5 }
  );
}

if (isApnsConfigured()) {
  console.log(
    `[apns] configured — bundle ${config.apns.bundleId}, ${config.apns.production ? "production" : "sandbox"}`
  );
}
