import express from "express";
import jwt from "jsonwebtoken";

import { config } from "./config.js";
import { db } from "./db.js";
import { requirePermission } from "./saas.js";
import {
  authorizeUrl,
  bustEnabledCache,
  createOpportunity,
  disconnect,
  exchangeCode,
  getConnection,
  isGhlConfigured,
  listPipelines,
  saveConnection
} from "./ghl.js";

// CRM (GoHighLevel) integration routes. Public-facing path is /crm — GHL
// rejects any redirect URL containing "ghl"/"highlevel".

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const STATE_TTL = "10m";

function signState(payload) {
  return jwt.sign({ ...payload, p: "ghl-oauth" }, config.jwtSecret, { expiresIn: STATE_TTL });
}
function verifyState(token) {
  const d = jwt.verify(token, config.jwtSecret);
  if (d.p !== "ghl-oauth") throw new Error("bad state");
  return d;
}

const frontend = () => config.frontendOrigins?.[0] || config.frontendOrigin;

async function getStatus(req, res) {
  if (!isGhlConfigured()) return res.json({ configured: false, connected: false, active: false });
  const conn = await getConnection(req.user.tenant_id);
  if (!conn) return res.json({ configured: true, connected: false, active: false });

  let pipelines = [];
  try {
    pipelines = await listPipelines(req.user.tenant_id);
  } catch (e) {
    console.warn("[ghl] listPipelines failed:", e.message);
  }
  res.json({
    configured: true,
    connected: true,
    active: conn.active,
    locationId: conn.locationId,
    createOpportunity: conn.createOpportunity,
    pipelineId: conn.pipelineId,
    pipelineStageId: conn.pipelineStageId,
    pipelines
  });
}

async function startConnect(req, res) {
  if (!isGhlConfigured()) return res.status(400).json({ error: "CRM integration not configured" });
  const state = signState({ t: req.user.tenant_id, u: req.user.id });
  res.json({ url: authorizeUrl(state) });
}

async function oauthCallback(req, res) {
  const back = (params) => res.redirect(`${frontend()}/?${new URLSearchParams(params).toString()}`);
  try {
    if (req.query.error) return back({ crm: "error", reason: String(req.query.error).slice(0, 80) });
    const code = String(req.query.code || "");
    const state = verifyState(String(req.query.state || ""));
    if (!code) return back({ crm: "error", reason: "no_code" });

    const tok = await exchangeCode(code);
    if (!tok.access_token || !tok.refresh_token) return back({ crm: "error", reason: "token_exchange" });
    await saveConnection(state.t, tok, state.u);
    bustEnabledCache(state.t);
    back({ crm: "connected" });
  } catch (e) {
    console.warn("[ghl] callback failed:", e.message);
    back({ crm: "error", reason: "callback_failed" });
  }
}

async function toggleActive(req, res) {
  const active = req.body.active ? 1 : 0;
  const [r] = await db.execute(
    "UPDATE tenant_ghl_connections SET active = ? WHERE tenant_id = ?",
    [active, req.user.tenant_id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not connected" });
  bustEnabledCache(req.user.tenant_id);
  res.json({ active: !!active });
}

async function saveSettings(req, res) {
  const pipelineId = req.body.pipelineId ? String(req.body.pipelineId).slice(0, 64) : null;
  const pipelineStageId = req.body.pipelineStageId ? String(req.body.pipelineStageId).slice(0, 64) : null;
  const createOpportunity = req.body.createOpportunity === false ? 0 : 1;
  const [r] = await db.execute(
    `UPDATE tenant_ghl_connections
        SET pipeline_id = ?, pipeline_stage_id = ?, create_opportunity = ?
      WHERE tenant_id = ?`,
    [pipelineId, pipelineStageId, createOpportunity, req.user.tenant_id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not connected" });
  res.json({ ok: true });
}

async function removeConnection(req, res) {
  await disconnect(req.user.tenant_id);
  res.json({ ok: true });
}

export default function createCrmRoutes(authenticate) {
  const router = express.Router();
  const owner = requirePermission("MANAGE_SETTINGS");

  router.get("/status", authenticate, owner, asyncRoute(getStatus));
  router.get("/connect", authenticate, owner, asyncRoute(startConnect));
  router.get("/callback", asyncRoute(oauthCallback)); // GHL redirects here — no JWT
  router.post("/toggle", authenticate, owner, asyncRoute(toggleActive));
  router.post("/settings", authenticate, owner, asyncRoute(saveSettings));
  router.post("/disconnect", authenticate, owner, asyncRoute(removeConnection));
  return router;
}
