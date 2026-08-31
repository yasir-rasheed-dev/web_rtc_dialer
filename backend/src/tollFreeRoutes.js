// Toll-free inbound campaigns: a toll-free tenant_dids number, a static
// agent roster, an optional IVR, Active/Inactive. See the approved plan
// (C:\Users\DELL\.claude\plans\cryptic-bubbling-frost.md) for the full
// design — this is the CRUD + Asterisk-sync half of it; the dialplan side
// lives in backend/asterisk/toll-free-routing-snippet.conf (applied
// manually on the live box, same convention as tenant-routing-snippet.conf).
import crypto from "node:crypto";

import express from "express";

import { db } from "./db.js";
import { realtimeDb } from "./realtimeDb.js";
import { requirePermission } from "./saas.js";
import { synthesizeToFile } from "./tts.js";

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const ALLOWED_RING_STRATEGIES = new Set(["ringall", "leastrecent"]);

// How long Asterisk rings ONE agent before moving to the next candidate
// (sequential strategies only — ringall rings everyone at once regardless).
// This is deliberately separate from campaign.no_answer_timeout_sec, which
// is the OVERALL "give up on the whole queue" timeout (5 min default) —
// conflating the two used to make the `queues.timeout` realtime column ring
// a single agent for the full 5 minutes before ever trying the next one.
const AGENT_RING_SECONDS = 20;

function normalizeDateFilter(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

// -----------------------------------------------------------------------
// Asterisk sync helpers
// -----------------------------------------------------------------------

// Writes the AstDB keys backend/asterisk/toll-free-routing-snippet.conf's
// dialplan reads to route an inbound call: which campaign a DID belongs
// to, whether it's live, and which IVR (if any) gates it. Same
// Action:"DBPut" pattern server.js's syncAgentDid/syncTenantRouting
// already use.
async function putCampaignAstDb(ami, campaign, didNumber) {
  const puts = [
    { Family: "ringnex_campaign", Key: didNumber, Val: campaign.id },
    { Family: "ringnex_campaign_status", Key: campaign.id, Val: campaign.status },
    { Family: "ringnex_campaign_ivr", Key: campaign.id, Val: campaign.ivr_id || "" },
    { Family: "ringnex_campaign_timeout", Key: campaign.id, Val: String(campaign.no_answer_timeout_sec) },
    // So the dialplan can reject calls for a suspended/cancelled tenant on
    // the campaign path exactly like it already does on the single-agent
    // path (ringnex_tenant_status) — a campaign's own ACTIVE/INACTIVE flag
    // says nothing about whether the *tenant* is still allowed to receive
    // calls at all.
    { Family: "ringnex_campaign_tenant", Key: campaign.id, Val: campaign.tenant_id }
  ];
  for (const action of puts) await ami.action({ Action: "DBPut", ...action });
}

async function delCampaignAstDb(ami, campaign, didNumber) {
  const dels = [
    { Family: "ringnex_campaign", Key: didNumber },
    { Family: "ringnex_campaign_status", Key: campaign.id },
    { Family: "ringnex_campaign_ivr", Key: campaign.id },
    { Family: "ringnex_campaign_timeout", Key: campaign.id },
    { Family: "ringnex_campaign_tenant", Key: campaign.id }
  ];
  for (const action of dels) await ami.action({ Action: "DBDel", ...action });
}

// Writes the greeting + each digit option's audio/routing for one IVR.
async function putIvrAstDb(ami, ivrId, greetingAudioPath, options) {
  await ami.action({ Action: "DBPut", Family: "ringnex_ivr_greeting", Key: ivrId, Val: greetingAudioPath || "" });
  for (const option of options) {
    const target = option.action_type === "CAMPAIGN" ? option.target_campaign_id || "" : "";
    await ami.action({ Action: "DBPut", Family: `ringnex_ivr_option_${ivrId}`, Key: option.digit, Val: `${option.action_type}:${target}` });
    await ami.action({ Action: "DBPut", Family: `ringnex_ivr_prompt_${ivrId}`, Key: option.digit, Val: option.prompt_audio_path || "" });
  }
}

// Asterisk's queue engine reads both queue *settings* (strategy, timeout —
// the `queues` realtime table) and *membership* (`queue_members`) straight
// out of realtime tables (same "app writes rows, Asterisk reads them
// directly, no AMI round-trip" pattern sipProvisioning.js already uses for
// ps_endpoints/ps_auths/ps_aors) — requires Asterisk's own realtime config
// (extconfig.conf/sorcery.conf) to map the `queues`/`queue_members`
// families onto tables in this same realtimeDb database; see the dialplan
// reference file for the expected table shape. Not verified against a
// live Asterisk box from here — confirm on deploy. Ring strategy isn't a
// Queue() application argument in Asterisk — it only comes from here.
async function putQueue(campaign, sipUsernames) {
  const queueName = `ringnex-campaign-${campaign.id}`;
  const connection = await realtimeDb.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`DELETE FROM queues WHERE name = ?`, [queueName]);
    await connection.execute(
      `INSERT INTO queues (name, strategy, timeout) VALUES (?, ?, ?)`,
      [queueName, campaign.ring_strategy || "ringall", AGENT_RING_SECONDS]
    );
    await connection.execute(`DELETE FROM queue_members WHERE queue_name = ?`, [queueName]);
    for (const sipUsername of sipUsernames) {
      await connection.execute(
        `INSERT INTO queue_members (queue_name, interface, membername, penalty, paused)
         VALUES (?, ?, ?, 0, 0)`,
        [queueName, `PJSIP/${sipUsername}`, sipUsername]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// AmiClient.action() only resolves the initial "Response: Success" ack —
// QueueStatus is a multi-event action (Asterisk streams QueueParams, one
// QueueEntry per waiting caller, then QueueStatusComplete, all tagged with
// the same ActionID). Collect that stream manually via the "event"
// EventEmitter instead of the plain action() promise.
// Exported for server.js's socket "toll-free:subscribe" handler (the Live
// Dashboard window's per-campaign queue feed) — same AMI multi-event
// collection this file's own queue-status route uses, so the two never
// disagree on how a QueueStatus response gets parsed.
export async function getQueueStatus(ami, queueName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let actionId = null;
    let settled = false;
    const entries = [];
    let queueParams = null;

    const timer = setTimeout(() => finish(() => reject(new Error("QueueStatus timed out"))), timeoutMs);

    function onEvent(message) {
      if (!actionId || message.ActionID !== actionId) return;
      if (message.Event === "QueueParams") queueParams = message;
      else if (message.Event === "QueueEntry") entries.push(message);
      else if (message.Event === "QueueStatusComplete") {
        finish(() => resolve({ queueParams, entries }));
      }
    }

    function finish(then) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ami.off("event", onEvent);
      then();
    }

    ami.on("event", onEvent);
    ami
      .action({ Action: "QueueStatus", Queue: queueName })
      .then((response) => {
        actionId = response.ActionID;
      })
      .catch((error) => finish(() => reject(error)));
  });
}

async function deleteQueue(campaignId) {
  const queueName = `ringnex-campaign-${campaignId}`;
  await realtimeDb.execute(`DELETE FROM queue_members WHERE queue_name = ?`, [queueName]);
  await realtimeDb.execute(`DELETE FROM queues WHERE name = ?`, [queueName]);
}

// A live-infrastructure sync (AstDB over AMI + the realtime queue_members
// table) can legitimately be unreachable in dev/test, or hiccup in
// production — that must never lose a campaign/IVR save that already
// committed to this app's own database. Mirrors commioRoutes.js's
// completePendingOrder, which likewise never fails a DID purchase just
// because the Commio-side routing-profile assignment failed; both report
// the failure back to the caller instead of throwing.
async function trySync(label, fn) {
  try {
    await fn();
    return { ok: true, error: null };
  } catch (error) {
    console.error(`[toll-free] Asterisk sync failed (${label}):`, error.message);
    return { ok: false, error: error.message };
  }
}

// Pauses/unpauses one agent across every toll-free queue they're a member
// of, without touching the roster itself — called from the agent/status
// handler in server.js so going PAUSED/WRAP_UP/OFFLINE stops new toll-free
// calls from ringing that agent without unassigning them from the
// campaign. 'READY' is the only status that counts as unpaused.
export async function syncQueuePauseForAgent(sipUsername, status) {
  if (!sipUsername) return;
  const paused = status === "READY" ? 0 : 1;
  try {
    await realtimeDb.execute(`UPDATE queue_members SET paused = ? WHERE interface = ?`, [paused, `PJSIP/${sipUsername}`]);
  } catch (error) {
    console.error("[toll-free] realtime queue pause sync failed:", error.message);
  }
}

// -----------------------------------------------------------------------
// Shared loaders
// -----------------------------------------------------------------------

async function loadCampaignAgents(campaignId) {
  const [rows] = await db.execute(
    `SELECT ica.user_id, u.name, u.sip_username, u.status
     FROM inbound_campaign_agents ica
     JOIN users u ON u.id = ica.user_id
     WHERE ica.campaign_id = ?
     ORDER BY u.name`,
    [campaignId]
  );
  return rows;
}

async function loadCampaign(tenantId, campaignId) {
  const [[campaign]] = await db.execute(
    `SELECT c.*, d.number AS did_number, i.name AS ivr_name
     FROM inbound_campaigns c
     JOIN tenant_dids d ON d.id = c.did_id
     LEFT JOIN ivrs i ON i.id = c.ivr_id
     WHERE c.id = ? AND c.tenant_id = ?
     LIMIT 1`,
    [campaignId, tenantId]
  );
  return campaign || null;
}

// -----------------------------------------------------------------------
// Route handlers
// -----------------------------------------------------------------------

async function listTollFreeNumbers(req, res) {
  const [rows] = await db.execute(
    `SELECT d.id, d.number, d.status, d.purchased_at, c.id AS campaign_id, c.name AS campaign_name, c.status AS campaign_status
     FROM tenant_dids d
     LEFT JOIN inbound_campaigns c ON c.did_id = d.id
     WHERE d.tenant_id = ? AND d.number_type = 'TOLLFREE'
     ORDER BY d.purchased_at DESC`,
    [req.user.tenant_id]
  );
  res.json({ numbers: rows });
}

async function listCampaigns(req, res) {
  const [rows] = await db.execute(
    `SELECT c.id, c.name, c.status, c.ring_strategy, c.no_answer_timeout_sec, c.created_at,
            d.number AS did_number, i.name AS ivr_name,
            (SELECT COUNT(*) FROM inbound_campaign_agents ica WHERE ica.campaign_id = c.id) AS agent_count
     FROM inbound_campaigns c
     JOIN tenant_dids d ON d.id = c.did_id
     LEFT JOIN ivrs i ON i.id = c.ivr_id
     WHERE c.tenant_id = ?
     ORDER BY c.created_at DESC`,
    [req.user.tenant_id]
  );
  res.json({ campaigns: rows });
}

async function getCampaign(req, res) {
  const campaign = await loadCampaign(req.user.tenant_id, req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  const agents = await loadCampaignAgents(campaign.id);
  res.json({ campaign, agents });
}

async function createCampaign(req, res, ami) {
  const name = String(req.body.name || "").trim().slice(0, 160);
  const didId = String(req.body.didId || "").trim();
  const agentIds = Array.isArray(req.body.agentIds) ? [...new Set(req.body.agentIds.map(String))] : [];
  const ivrId = req.body.ivrId ? String(req.body.ivrId) : null;
  const status = req.body.status === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  const ringStrategy = ALLOWED_RING_STRATEGIES.has(req.body.ringStrategy) ? req.body.ringStrategy : "ringall";
  if (!name) return res.status(400).json({ error: "Campaign name is required" });
  if (!didId) return res.status(400).json({ error: "Pick a toll-free number for this campaign" });

  const [[did]] = await db.execute(
    `SELECT id, number FROM tenant_dids WHERE id = ? AND tenant_id = ? AND number_type = 'TOLLFREE' LIMIT 1`,
    [didId, req.user.tenant_id]
  );
  if (!did) return res.status(404).json({ error: "Toll-free number not found" });
  const [[existingCampaign]] = await db.execute(`SELECT id FROM inbound_campaigns WHERE did_id = ?`, [didId]);
  if (existingCampaign) return res.status(409).json({ error: "This number already has a campaign" });

  if (agentIds.length) {
    const [validAgents] = await db.query(
      `SELECT id FROM users WHERE tenant_id = ? AND id IN (?)`,
      [req.user.tenant_id, agentIds]
    );
    if (validAgents.length !== agentIds.length) return res.status(400).json({ error: "One or more agents are invalid" });
  }

  if (ivrId) {
    const [[ivr]] = await db.execute(`SELECT id FROM ivrs WHERE id = ? AND tenant_id = ? LIMIT 1`, [ivrId, req.user.tenant_id]);
    if (!ivr) return res.status(404).json({ error: "IVR not found" });
  }

  const id = crypto.randomUUID();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO inbound_campaigns (id, tenant_id, did_id, name, status, ivr_id, ring_strategy, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, req.user.tenant_id, didId, name, status, ivrId, ringStrategy, req.user.id]
    );
    for (const userId of agentIds) {
      await connection.execute(`INSERT INTO inbound_campaign_agents (campaign_id, user_id) VALUES (?, ?)`, [id, userId]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const campaign = await loadCampaign(req.user.tenant_id, id);
  const agents = await loadCampaignAgents(id);
  const asteriskSync = await trySync(`create campaign ${id}`, async () => {
    await putCampaignAstDb(ami, campaign, did.number);
    await putQueue(campaign, agents.map((a) => a.sip_username).filter(Boolean));
  });

  res.status(201).json({ campaign, agents, asteriskSync });
}

async function updateCampaign(req, res, ami) {
  const campaign = await loadCampaign(req.user.tenant_id, req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 160) : campaign.name;
  const status = req.body.status !== undefined ? (req.body.status === "ACTIVE" ? "ACTIVE" : "INACTIVE") : campaign.status;
  const ivrId = req.body.ivrId !== undefined ? (req.body.ivrId || null) : campaign.ivr_id;
  const ringStrategy =
    req.body.ringStrategy !== undefined
      ? (ALLOWED_RING_STRATEGIES.has(req.body.ringStrategy) ? req.body.ringStrategy : campaign.ring_strategy)
      : campaign.ring_strategy;
  const agentIds = Array.isArray(req.body.agentIds) ? [...new Set(req.body.agentIds.map(String))] : null;
  if (!name) return res.status(400).json({ error: "Campaign name is required" });

  if (ivrId) {
    const [[ivr]] = await db.execute(`SELECT id FROM ivrs WHERE id = ? AND tenant_id = ? LIMIT 1`, [ivrId, req.user.tenant_id]);
    if (!ivr) return res.status(404).json({ error: "IVR not found" });
  }
  if (agentIds && agentIds.length) {
    const [validAgents] = await db.query(`SELECT id FROM users WHERE tenant_id = ? AND id IN (?)`, [req.user.tenant_id, agentIds]);
    if (validAgents.length !== agentIds.length) return res.status(400).json({ error: "One or more agents are invalid" });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE inbound_campaigns SET name=?, status=?, ivr_id=?, ring_strategy=? WHERE id=? AND tenant_id=?`,
      [name, status, ivrId, ringStrategy, campaign.id, req.user.tenant_id]
    );
    if (agentIds) {
      await connection.execute(`DELETE FROM inbound_campaign_agents WHERE campaign_id = ?`, [campaign.id]);
      for (const userId of agentIds) {
        await connection.execute(`INSERT INTO inbound_campaign_agents (campaign_id, user_id) VALUES (?, ?)`, [campaign.id, userId]);
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const updated = await loadCampaign(req.user.tenant_id, campaign.id);
  const agents = await loadCampaignAgents(campaign.id);
  const asteriskSync = await trySync(`update campaign ${campaign.id}`, async () => {
    await putCampaignAstDb(ami, updated, updated.did_number);
    await putQueue(updated, agents.map((a) => a.sip_username).filter(Boolean));
  });

  res.json({ campaign: updated, agents, asteriskSync });
}

async function deleteCampaign(req, res, ami) {
  const campaign = await loadCampaign(req.user.tenant_id, req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  await db.execute(`DELETE FROM inbound_campaigns WHERE id = ? AND tenant_id = ?`, [campaign.id, req.user.tenant_id]);
  // The campaign row is already gone at this point regardless of whether
  // the Asterisk-side cleanup below succeeds — a stale AstDB/queue_members
  // entry left behind on failure is harmless (a future campaign on the
  // same DID overwrites it) and logged, not returned as a 500 for a
  // delete that already succeeded where it matters.
  await trySync(`delete campaign ${campaign.id}`, async () => {
    await delCampaignAstDb(ami, campaign, campaign.did_number);
    await deleteQueue(campaign.id);
  });

  res.status(204).end();
}

// Live snapshot of one campaign's queue — how many callers are waiting
// right now and how long the longest-waiting one has been on hold. Reads
// straight from Asterisk (AMI QueueStatus), not the calls history table —
// this is "what's happening this second", not a report.
async function getCampaignQueueStatus(req, res, ami) {
  const campaign = await loadCampaign(req.user.tenant_id, req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  const queueName = `ringnex-campaign-${campaign.id}`;
  try {
    const { entries } = await getQueueStatus(ami, queueName);
    const waiting = entries.length;
    const longestWaitSec = waiting ? Math.max(...entries.map((entry) => Number(entry.Wait || 0))) : 0;
    res.json({ ok: true, waiting, longestWaitSec });
  } catch (error) {
    res.json({ ok: false, waiting: 0, longestWaitSec: 0, error: error.message });
  }
}

// Per-toll-free-number rollup for the Reports > Toll-Free hub — total /
// answered / abandoned call counts and average wait-before-answer over a
// date range. Row-level detail (with the same filters as every other
// report) is GET /api/calls?toNumber=<did> — this endpoint is only the
// summary card, not a substitute for it.
async function getReportSummary(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const from = normalizeDateFilter(req.query.from) || monthAgo;
  const to = normalizeDateFilter(req.query.to) || today;

  const [rows] = await db.execute(
    `SELECT d.id AS did_id, d.number AS did_number, c.id AS campaign_id, c.name AS campaign_name, c.status AS campaign_status,
            COUNT(calls.id) AS total_calls,
            SUM(calls.id IS NOT NULL AND calls.answered_at IS NOT NULL) AS answered_calls,
            SUM(calls.id IS NOT NULL AND calls.answered_at IS NULL) AS abandoned_calls,
            AVG(TIMESTAMPDIFF(SECOND, calls.started_at, calls.answered_at)) AS avg_wait_sec
     FROM tenant_dids d
     LEFT JOIN inbound_campaigns c ON c.did_id = d.id
     LEFT JOIN calls
       ON calls.to_number = d.number AND calls.tenant_id = d.tenant_id AND calls.direction = 'INBOUND'
      AND calls.started_at >= ? AND calls.started_at < DATE_ADD(?, INTERVAL 1 DAY)
     WHERE d.tenant_id = ? AND d.number_type = 'TOLLFREE'
     GROUP BY d.id, c.id
     ORDER BY d.purchased_at DESC`,
    [`${from} 00:00:00`, to, req.user.tenant_id]
  );
  res.json({ from, to, numbers: rows });
}

async function listIvrs(req, res) {
  const [rows] = await db.execute(
    `SELECT id, name, greeting_text, created_at FROM ivrs WHERE tenant_id = ? ORDER BY name`,
    [req.user.tenant_id]
  );
  res.json({ ivrs: rows });
}

async function getIvr(req, res) {
  const [[ivr]] = await db.execute(`SELECT * FROM ivrs WHERE id = ? AND tenant_id = ? LIMIT 1`, [req.params.id, req.user.tenant_id]);
  if (!ivr) return res.status(404).json({ error: "IVR not found" });
  const [options] = await db.execute(`SELECT * FROM ivr_options WHERE ivr_id = ? ORDER BY digit`, [ivr.id]);
  res.json({ ivr, options });
}

function validateIvrOptions(rawOptions) {
  if (!Array.isArray(rawOptions) || !rawOptions.length) throw Object.assign(new Error("At least one menu option is required"), { statusCode: 400 });
  const seen = new Set();
  return rawOptions.map((option) => {
    const digit = String(option.digit || "").trim();
    if (!/^[0-9*#]$/.test(digit)) throw Object.assign(new Error(`Invalid digit: ${digit || "(empty)"}`), { statusCode: 400 });
    if (seen.has(digit)) throw Object.assign(new Error(`Digit ${digit} is used more than once`), { statusCode: 400 });
    seen.add(digit);
    const actionType = option.actionType === "HANGUP" ? "HANGUP" : "CAMPAIGN";
    const promptText = String(option.promptText || "").trim().slice(0, 300);
    if (!promptText) throw Object.assign(new Error(`Digit ${digit} needs prompt text`), { statusCode: 400 });
    if (actionType === "CAMPAIGN" && !option.targetCampaignId) {
      throw Object.assign(new Error(`Digit ${digit} needs a campaign to route to`), { statusCode: 400 });
    }
    return { digit, promptText, actionType, targetCampaignId: actionType === "CAMPAIGN" ? String(option.targetCampaignId) : null };
  });
}

// The dialplan's Read() only plays ONE file before waiting for a digit —
// it never plays each option's own prompt_audio_path (that field exists
// for a future per-digit re-prompt, but nothing reads it today). So the
// only audio a caller actually hears has to be the greeting PLUS every
// option's prompt spoken together, in digit order, e.g. "Thanks for
// calling Ringnex. Press 1 for sales. Press 2 to hang up." — that combined
// script is what greeting_audio_path actually synthesizes, not just the
// bare greeting text.
function buildFullMenuScript(greetingText, options) {
  const sorted = [...options].sort((a, b) => a.digit.localeCompare(b.digit));
  return [greetingText, ...sorted.map((o) => o.promptText)].join(". ");
}

async function createIvr(req, res, ami) {
  const name = String(req.body.name || "").trim().slice(0, 160);
  const greetingText = String(req.body.greetingText || "").trim().slice(0, 500);
  if (!name) return res.status(400).json({ error: "IVR name is required" });
  if (!greetingText) return res.status(400).json({ error: "Greeting text is required" });
  const options = validateIvrOptions(req.body.options);

  if (options.some((o) => o.actionType === "CAMPAIGN")) {
    const targetIds = [...new Set(options.filter((o) => o.targetCampaignId).map((o) => o.targetCampaignId))];
    const [validCampaigns] = await db.query(
      `SELECT id FROM inbound_campaigns WHERE tenant_id = ? AND id IN (?)`,
      [req.user.tenant_id, targetIds]
    );
    if (validCampaigns.length !== targetIds.length) return res.status(400).json({ error: "One or more target campaigns are invalid" });
  }

  const greetingAudioPath = await synthesizeToFile(buildFullMenuScript(greetingText, options));
  const id = crypto.randomUUID();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO ivrs (id, tenant_id, name, greeting_text, greeting_audio_path, created_by) VALUES (?,?,?,?,?,?)`,
      [id, req.user.tenant_id, name, greetingText, greetingAudioPath, req.user.id]
    );
    for (const option of options) {
      const promptAudioPath = await synthesizeToFile(option.promptText);
      await connection.execute(
        `INSERT INTO ivr_options (id, ivr_id, digit, prompt_text, prompt_audio_path, action_type, target_campaign_id)
         VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), id, option.digit, option.promptText, promptAudioPath, option.actionType, option.targetCampaignId]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [[ivr]] = await db.execute(`SELECT * FROM ivrs WHERE id = ?`, [id]);
  const [savedOptions] = await db.execute(`SELECT * FROM ivr_options WHERE ivr_id = ? ORDER BY digit`, [id]);
  const asteriskSync = await trySync(`create ivr ${id}`, () => putIvrAstDb(ami, id, greetingAudioPath, savedOptions));

  res.status(201).json({ ivr, options: savedOptions, asteriskSync });
}

// Full replace of name/greeting/options — no "in use" restriction like
// deleteIvr (editing an IVR a campaign already uses is the whole point,
// e.g. re-saving after espeak-ng/ffmpeg become available so audio that
// was missing at create time finally gets synthesized and synced).
async function updateIvr(req, res, ami) {
  const [[existing]] = await db.execute(`SELECT id FROM ivrs WHERE id = ? AND tenant_id = ? LIMIT 1`, [req.params.id, req.user.tenant_id]);
  if (!existing) return res.status(404).json({ error: "IVR not found" });

  const name = String(req.body.name || "").trim().slice(0, 160);
  const greetingText = String(req.body.greetingText || "").trim().slice(0, 500);
  if (!name) return res.status(400).json({ error: "IVR name is required" });
  if (!greetingText) return res.status(400).json({ error: "Greeting text is required" });
  const options = validateIvrOptions(req.body.options);

  if (options.some((o) => o.actionType === "CAMPAIGN")) {
    const targetIds = [...new Set(options.filter((o) => o.targetCampaignId).map((o) => o.targetCampaignId))];
    const [validCampaigns] = await db.query(
      `SELECT id FROM inbound_campaigns WHERE tenant_id = ? AND id IN (?)`,
      [req.user.tenant_id, targetIds]
    );
    if (validCampaigns.length !== targetIds.length) return res.status(400).json({ error: "One or more target campaigns are invalid" });
  }

  const greetingAudioPath = await synthesizeToFile(buildFullMenuScript(greetingText, options));
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE ivrs SET name=?, greeting_text=?, greeting_audio_path=? WHERE id=? AND tenant_id=?`,
      [name, greetingText, greetingAudioPath, existing.id, req.user.tenant_id]
    );
    await connection.execute(`DELETE FROM ivr_options WHERE ivr_id = ?`, [existing.id]);
    for (const option of options) {
      const promptAudioPath = await synthesizeToFile(option.promptText);
      await connection.execute(
        `INSERT INTO ivr_options (id, ivr_id, digit, prompt_text, prompt_audio_path, action_type, target_campaign_id)
         VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), existing.id, option.digit, option.promptText, promptAudioPath, option.actionType, option.targetCampaignId]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [[ivr]] = await db.execute(`SELECT * FROM ivrs WHERE id = ?`, [existing.id]);
  const [savedOptions] = await db.execute(`SELECT * FROM ivr_options WHERE ivr_id = ? ORDER BY digit`, [existing.id]);
  const asteriskSync = await trySync(`update ivr ${existing.id}`, () => putIvrAstDb(ami, existing.id, greetingAudioPath, savedOptions));

  res.json({ ivr, options: savedOptions, asteriskSync });
}

async function deleteIvr(req, res) {
  const [[ivr]] = await db.execute(`SELECT id FROM ivrs WHERE id = ? AND tenant_id = ? LIMIT 1`, [req.params.id, req.user.tenant_id]);
  if (!ivr) return res.status(404).json({ error: "IVR not found" });
  const [[inUse]] = await db.execute(`SELECT id FROM inbound_campaigns WHERE ivr_id = ? LIMIT 1`, [ivr.id]);
  if (inUse) return res.status(409).json({ error: "This IVR is attached to a campaign — detach it first" });
  await db.execute(`DELETE FROM ivrs WHERE id = ?`, [ivr.id]);
  res.status(204).end();
}

export default function createTollFreeRoutes(authenticate, ami) {
  const router = express.Router();

  router.get("/numbers", authenticate, requirePermission("VIEW_TOLL_FREE"), asyncRoute(listTollFreeNumbers));

  router.get("/campaigns", authenticate, requirePermission("VIEW_TOLL_FREE"), asyncRoute(listCampaigns));
  router.get("/campaigns/:id", authenticate, requirePermission("VIEW_TOLL_FREE"), asyncRoute(getCampaign));
  router.post("/campaigns", authenticate, requirePermission("MANAGE_TOLL_FREE_CAMPAIGNS"), asyncRoute((req, res) => createCampaign(req, res, ami)));
  router.patch("/campaigns/:id", authenticate, requirePermission("MANAGE_TOLL_FREE_CAMPAIGNS"), asyncRoute((req, res) => updateCampaign(req, res, ami)));
  router.delete("/campaigns/:id", authenticate, requirePermission("MANAGE_TOLL_FREE_CAMPAIGNS"), asyncRoute((req, res) => deleteCampaign(req, res, ami)));
  router.get(
    "/campaigns/:id/queue-status",
    authenticate,
    requirePermission("VIEW_TOLL_FREE"),
    asyncRoute((req, res) => getCampaignQueueStatus(req, res, ami))
  );

  router.get("/reports/summary", authenticate, requirePermission("VIEW_TOLL_FREE"), asyncRoute(getReportSummary));

  router.get("/ivrs", authenticate, requirePermission("VIEW_TOLL_FREE"), asyncRoute(listIvrs));
  router.get("/ivrs/:id", authenticate, requirePermission("VIEW_TOLL_FREE"), asyncRoute(getIvr));
  router.post("/ivrs", authenticate, requirePermission("MANAGE_TOLL_FREE_CAMPAIGNS"), asyncRoute((req, res) => createIvr(req, res, ami)));
  router.patch("/ivrs/:id", authenticate, requirePermission("MANAGE_TOLL_FREE_CAMPAIGNS"), asyncRoute((req, res) => updateIvr(req, res, ami)));
  router.delete("/ivrs/:id", authenticate, requirePermission("MANAGE_TOLL_FREE_CAMPAIGNS"), asyncRoute(deleteIvr));

  return router;
}
