import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";

import { db } from "./db.js";
import { mintFirebaseToken } from "./firebaseAdmin.js";

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

export default function createTeamChatRoutes(authenticate) {
  const router = express.Router();
  router.get("/directory", authenticate, asyncRoute(getDirectory));
  router.post("/firebase-token", authenticate, asyncRoute(issueFirebaseToken));
  router.post("/upload", authenticate, upload.single("file"), asyncRoute(uploadAttachment));
  router.post("/fcm-token", authenticate, asyncRoute(saveFcmToken));
  return router;
}
