import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";

import { db } from "./db.js";
import { mintFirebaseToken, sendPushMulticast } from "./firebaseAdmin.js";
import { sendApnsAlert } from "./apnsPush.js";

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "uploads/team-chat");
fs.mkdirSync(uploadDir, { recursive: true });

// Filenames are random UUIDs (not the original name) so a chat attachment
// URL is only guessable by someone who already has the link a teammate
// shared with them — same trust model as the message itself.
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

async function getDirectory(req, res) {
  const [agents] = await db.execute(
    `SELECT u.id, u.name, u.email, u.sip_username AS sipUsername, u.extension,
            u.caller_id_number AS callerIdNumber
       FROM users u
      WHERE u.tenant_id=? AND u.active=1 AND u.id<>?
      ORDER BY u.name ASC`,
    [req.user.tenant_id, req.user.id]
  );

  const [teamRows] = await db.execute(
    `SELECT DISTINCT t.id, t.name
       FROM teams t
       JOIN team_members tm ON tm.team_id=t.id AND tm.tenant_id=t.tenant_id
      WHERE t.tenant_id=? AND tm.user_id=? AND tm.active=1 AND t.active=1
      ORDER BY t.name ASC`,
    [req.user.tenant_id, req.user.id]
  );

  let teams = teamRows;
  if (teamRows.length) {
    const teamIds = teamRows.map((t) => t.id);
    const [memberRows] = await db.query(
      `SELECT tm.team_id, u.id, u.name, u.email
         FROM team_members tm JOIN users u ON u.id=tm.user_id AND u.tenant_id=tm.tenant_id
        WHERE tm.tenant_id=? AND tm.active=1 AND tm.team_id IN (${teamIds.map(() => "?").join(",")})`,
      [req.user.tenant_id, ...teamIds]
    );
    teams = teamRows.map((team) => ({
      ...team,
      members: memberRows.filter((m) => m.team_id === team.id).map((m) => ({ id: m.id, name: m.name, email: m.email }))
    }));
  }

  res.json({ agents, teams });
}

async function issueFirebaseToken(req, res) {
  const token = await mintFirebaseToken(req.user.id, req.user.tenant_id);
  res.json({ token });
}

async function uploadAttachment(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  // Absolute URL (not just the /api/uploads/... path) so the link stays
  // correct wherever it's consumed from — the chat UI, a push-notification
  // deep link, etc. — not just pages served from the same origin as the API.
  const url = `${req.protocol}://${req.get("host")}/api/uploads/team-chat/${req.file.filename}`;
  res.json({ url, fileName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size });
}

async function saveFcmToken(req, res) {
  const token = String(req.body.token || "").trim().slice(0, 255);
  await db.execute("UPDATE users SET fcm_token=? WHERE id=? AND tenant_id=?", [token || null, req.user.id, req.user.tenant_id]);
  res.status(204).end();
}

// Register one device/browser push token for the current user. Called by
// the web app, the Electron app and the mobile app on startup.
async function savePushToken(req, res) {
  const token = String(req.body.token || "").trim();
  const platform = String(req.body.platform || "web").trim().toLowerCase().slice(0, 16) || "web";
  if (!token) return res.status(400).json({ error: "token required" });
  await db.execute(
    `INSERT INTO user_push_tokens (id, user_id, tenant_id, token, platform)
       VALUES (UUID(), ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       tenant_id = VALUES(tenant_id),
       platform = VALUES(platform),
       updated_at = CURRENT_TIMESTAMP`,
    [req.user.id, req.user.tenant_id, token, platform]
  );
  res.status(204).end();
}

async function deletePushToken(req, res) {
  const token = String(req.body.token || "").trim();
  if (token) await db.execute("DELETE FROM user_push_tokens WHERE token=? AND user_id=?", [token, req.user.id]);
  res.status(204).end();
}

// Fan a new-chat-message notification out to its recipients across every
// platform they're signed in on. The client resolves who should get it
// (DM peer / team members / custom-group participants) and passes their
// user ids; we only ever notify ids in the caller's own tenant.
async function notifyRecipients(req, res) {
  const ids = Array.isArray(req.body.recipientIds) ? req.body.recipientIds.map(String).filter(Boolean) : [];
  const title = String(req.body.title || "New message").slice(0, 120);
  const body = String(req.body.body || "").slice(0, 240);
  const data = req.body.data && typeof req.body.data === "object" ? req.body.data : {};

  const others = [...new Set(ids)].filter((id) => id !== String(req.user.id));
  if (!others.length) return res.json({ sent: 0 });

  const [rows] = await db.query(
    `SELECT pt.token, pt.platform
       FROM user_push_tokens pt
       JOIN users u ON u.id = pt.user_id AND u.tenant_id = pt.tenant_id AND u.active = 1
      WHERE pt.tenant_id = ? AND pt.user_id IN (${others.map(() => "?").join(",")})`,
    [req.user.tenant_id, ...others]
  );
  if (!rows.length) return res.json({ sent: 0 });

  // iOS tokens are raw APNs device tokens (Expo) → straight to Apple.
  // Everything else stays on Firebase.
  const iosTokens = rows.filter((r) => r.platform === "ios").map((r) => r.token);
  const fcmTokens = rows.filter((r) => r.platform !== "ios").map((r) => r.token);

  const [fcmRes, apnsRes] = await Promise.all([
    fcmTokens.length ? sendPushMulticast(fcmTokens, { title, body, data }) : { successCount: 0, invalidTokens: [] },
    iosTokens.length ? sendApnsAlert(iosTokens, { title, body, data }) : { successCount: 0, invalidTokens: [] }
  ]);

  const invalidTokens = [...fcmRes.invalidTokens, ...apnsRes.invalidTokens];
  if (invalidTokens.length) {
    await db.query(
      `DELETE FROM user_push_tokens WHERE token IN (${invalidTokens.map(() => "?").join(",")})`,
      invalidTokens
    );
  }
  res.json({ sent: fcmRes.successCount + apnsRes.successCount });
}

export default function createTeamChatRoutes(authenticate) {
  const router = express.Router();
  router.get("/directory", authenticate, asyncRoute(getDirectory));
  router.post("/firebase-token", authenticate, asyncRoute(issueFirebaseToken));
  router.post("/upload", authenticate, upload.single("file"), asyncRoute(uploadAttachment));
  router.post("/fcm-token", authenticate, asyncRoute(saveFcmToken));
  router.post("/push-token", authenticate, asyncRoute(savePushToken));
  router.delete("/push-token", authenticate, asyncRoute(deletePushToken));
  router.post("/notify", authenticate, asyncRoute(notifyRecipients));
  return router;
}
