// Voicemails left by a caller when a direct PSTN -> agent call is declined,
// times out, or the agent is unreachable — see callTracker.js's
// RN_VOICEMAIL_FILE VarSet handler for how a `voicemails` row gets created,
// and backend/asterisk/toll-free-routing-snippet.conf's [from-commio-route]
// agent-route branch for the dialplan side. Deliberately never touches the
// toll-free/queue path.
//
// Mirrors the /api/recordings endpoints in server.js almost exactly
// (list / stream / scope-check / path-traversal guard) but against its own
// `voicemails` table and its own `config.voicemailRoot` spool, kept
// separate from call recordings per the approved design.
import fs from "node:fs";
import path from "node:path";

import express from "express";

import { db } from "./db.js";
import { requirePermission } from "./saas.js";
import { config } from "./config.js";

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// `authenticate` plus the call-scoping helpers already defined in
// server.js — passed in rather than duplicated or split into a new shared
// module, same one-way-dependency convention as campaignRoutes.js/
// tollFreeRoutes.js (server.js owns these, route modules receive what they
// need).
export default function createVoicemailRoutes(
  authenticate,
  { callAccessScope, appendCallAgentScope, appendRequestedAgent, normalizeDateFilter }
) {
  const router = express.Router();

  async function listVoicemails(req, res) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const scope = await callAccessScope(req.user, "VIEW_TEAM_VOICEMAILS");
    const params = [req.user.tenant_id];
    let where = "WHERE v.tenant_id=?";
    where = appendCallAgentScope(where, params, scope, "v.agent_user_id");
    where = appendRequestedAgent(where, params, scope, req.query.agentId, "v.agent_user_id");

    const from = normalizeDateFilter(req.query.from);
    const to = normalizeDateFilter(req.query.to);
    if (from) { where += " AND v.created_at>=?"; params.push(`${from} 00:00:00`); }
    if (to) { where += " AND v.created_at<DATE_ADD(?,INTERVAL 1 DAY)"; params.push(`${to} 00:00:00`); }
    if (req.query.search) {
      where += " AND (v.from_number LIKE ? OR v.to_number LIKE ? OR u.name LIKE ?)";
      const term = `%${String(req.query.search).slice(0, 64)}%`;
      params.push(term, term, term);
    }

    const fromSql = "FROM voicemails v LEFT JOIN users u ON u.id=v.agent_user_id AND u.tenant_id=v.tenant_id";
    const [[count]] = await db.execute(`SELECT COUNT(*) AS total ${fromSql} ${where}`, params);
    const [rows] = await db.execute(
      `SELECT v.id,v.agent_user_id,u.name AS agent_name,v.from_number,v.to_number,
              v.duration_sec,v.heard_at,v.created_at
         ${fromSql} ${where} ORDER BY v.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ rows, page, pageSize, total: Number(count.total || 0) });
  }

  async function countVoicemails(req, res) {
    const scope = await callAccessScope(req.user, "VIEW_TEAM_VOICEMAILS");
    const params = [req.user.tenant_id];
    let where = "WHERE v.tenant_id=? AND v.heard_at IS NULL";
    where = appendCallAgentScope(where, params, scope, "v.agent_user_id");
    const [[row]] = await db.execute(
      `SELECT COUNT(*) AS unheard FROM voicemails v ${where}`,
      params
    );
    res.json({ unheard: Number(row.unheard || 0) });
  }

  async function streamVoicemail(req, res) {
    const [rows] = await db.execute(
      `SELECT id,agent_user_id,file_path,file_name FROM voicemails WHERE id=? AND tenant_id=? LIMIT 1`,
      [req.params.id, req.user.tenant_id]
    );
    const voicemail = rows[0];
    if (!voicemail?.file_path) return res.status(404).json({ error: "Voicemail not found" });
    const scope = await callAccessScope(req.user, "VIEW_TEAM_VOICEMAILS");
    if (scope.type === "agents" && !scope.agentIds.includes(voicemail.agent_user_id)) {
      return res.status(403).json({ error: "Voicemail access denied" });
    }
    const candidate = path.isAbsolute(voicemail.file_path)
      ? path.resolve(voicemail.file_path)
      : path.resolve(config.voicemailRoot, voicemail.file_path);
    if (!candidate.startsWith(`${config.voicemailRoot}${path.sep}`)) {
      return res.status(403).json({ error: "Invalid voicemail path" });
    }
    const stat = await fs.promises.stat(candidate).catch(() => null);
    if (!stat?.isFile()) return res.status(404).json({ error: "Voicemail file is unavailable" });

    const range = req.headers.range;
    const contentType = candidate.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(candidate).replace(/["\r\n]/g, "")}"`);
    if (!range) {
      res.setHeader("Content-Length", stat.size);
      return fs.createReadStream(candidate).pipe(res);
    }
    const match = range.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (!match || start > end || start >= stat.size) return res.status(416).end();
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(candidate, { start, end }).pipe(res);
  }

  async function markHeard(req, res) {
    const [rows] = await db.execute(
      `SELECT id,agent_user_id FROM voicemails WHERE id=? AND tenant_id=? LIMIT 1`,
      [req.params.id, req.user.tenant_id]
    );
    const voicemail = rows[0];
    if (!voicemail) return res.status(404).json({ error: "Voicemail not found" });
    const scope = await callAccessScope(req.user, "VIEW_TEAM_VOICEMAILS");
    if (scope.type === "agents" && !scope.agentIds.includes(voicemail.agent_user_id)) {
      return res.status(403).json({ error: "Voicemail access denied" });
    }
    await db.execute(`UPDATE voicemails SET heard_at=NOW() WHERE id=? AND heard_at IS NULL`, [req.params.id]);
    res.status(204).end();
  }

  router.get("/", authenticate, requirePermission("VIEW_VOICEMAILS"), asyncRoute(listVoicemails));
  router.get("/counts", authenticate, requirePermission("VIEW_VOICEMAILS"), asyncRoute(countVoicemails));
  router.get("/:id", authenticate, requirePermission("VIEW_VOICEMAILS"), asyncRoute(streamVoicemail));
  router.post("/:id/heard", authenticate, requirePermission("VIEW_VOICEMAILS"), asyncRoute(markHeard));

  return router;
}
