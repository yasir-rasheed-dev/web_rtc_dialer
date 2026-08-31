import crypto from "node:crypto";

import { db, audit } from "./db.js";
import { hasPermission } from "./saas.js";
import { dncStatusForUser } from "./dncRoutes.js";

// A contact handed to an agent is held for this long. If the agent closes the
// tab without dialling, the lock goes stale and the contact returns to the pool.
const LOCK_TTL_MINUTES = 5;

// Statuses a contact can be handed out from. Anything else (CONNECTED,
// COMPLETED, DNC) is terminal and never re-dialled.
const DIALABLE_STATUSES = ["ASSIGNED", "READY", "NO_ANSWER", "BUSY", "FAILED", "CALLBACK"];

// Outcomes the agent may report. SKIPPED is not a contact status: it releases
// the lock and puts the contact back in the queue.
const RETRYABLE_OUTCOMES = ["NO_ANSWER", "BUSY", "FAILED", "CALLBACK"];
const TERMINAL_OUTCOMES = ["CONNECTED", "COMPLETED", "DNC"];
const CALL_OUTCOMES = ["CONNECTED", "NO_ANSWER", "BUSY", "FAILED"];

const DIALABLE_PLACEHOLDERS = DIALABLE_STATUSES.map(() => "?").join(",");

function releaseStaleLocks(connection, tenantId, campaignId) {
  return connection.execute(
    `UPDATE campaign_contacts
        SET locked_by_user_id=NULL, locked_at=NULL,
            status=IF(status='READY','ASSIGNED',status)
      WHERE tenant_id=? AND campaign_id=?
        AND locked_by_user_id IS NOT NULL
        AND locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [tenantId, campaignId, LOCK_TTL_MINUTES]
  );
}

async function pendingCount(tenantId, campaignId, agentId, maxAttempts) {
  const [[row]] = await db.execute(
    `SELECT COUNT(*) AS pending FROM campaign_contacts
      WHERE tenant_id=? AND campaign_id=? AND assigned_agent_id=?
        AND status IN (${DIALABLE_PLACEHOLDERS})
        AND attempt_count < ?`,
    [tenantId, campaignId, agentId, ...DIALABLE_STATUSES, maxAttempts]
  );
  return row.pending;
}

// ===============================
// NEXT CONTACT  (GET /api/campaigns/dialer/next/:campaignId)
// ===============================

export async function getNextDialerContact(req, res) {
  const tenantId = req.user.tenant_id;
  const agentId = req.user.id;
  const campaignId = req.params.campaignId;

  const [[campaign]] = await db.execute(
    `SELECT id, name, mode, status, max_attempts, retry_delay_minutes, timezone
       FROM campaigns WHERE id=? AND tenant_id=? LIMIT 1`,
    [campaignId, tenantId]
  );

  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign.status !== "ACTIVE") {
    return res.status(409).json({ error: `Campaign is ${campaign.status.toLowerCase()}, not active` });
  }

  const [[membership]] = await db.execute(
    `SELECT id FROM campaign_agents
      WHERE campaign_id=? AND tenant_id=? AND user_id=? AND active=1 LIMIT 1`,
    [campaignId, tenantId, agentId]
  );
  if (!membership) {
    return res.status(403).json({ error: "You are not assigned to this campaign" });
  }

  const maxAttempts = campaign.max_attempts || 3;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await releaseStaleLocks(connection, tenantId, campaignId);

    // Re-fetching (page refresh, second tab) must return the same contact
    // rather than burning through the queue.
    let [rows] = await connection.execute(
      `SELECT * FROM campaign_contacts
        WHERE tenant_id=? AND campaign_id=? AND locked_by_user_id=?
        ORDER BY locked_at ASC LIMIT 1
        FOR UPDATE`,
      [tenantId, campaignId, agentId]
    );

    if (!rows[0]) {
      [rows] = await connection.execute(
        `SELECT * FROM campaign_contacts
          WHERE tenant_id=? AND campaign_id=?
            AND assigned_agent_id=?
            AND locked_by_user_id IS NULL
            AND status IN (${DIALABLE_PLACEHOLDERS})
            AND attempt_count < ?
            AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          ORDER BY attempt_count ASC, COALESCE(next_attempt_at, created_at) ASC
          LIMIT 1
          FOR UPDATE`,
        [tenantId, campaignId, agentId, ...DIALABLE_STATUSES, maxAttempts]
      );
    }

    const contact = rows[0];

    if (!contact) {
      await connection.commit();
      const pending = await pendingCount(tenantId, campaignId, agentId, maxAttempts);
      return res.json({
        contact: null,
        campaign,
        pending,
        message: pending
          ? "No contact is due right now. Scheduled retries are still pending."
          : "All assigned contacts are done."
      });
    }

    await connection.execute(
      `UPDATE campaign_contacts
          SET locked_by_user_id=?, locked_at=NOW(), status='READY'
        WHERE id=? AND tenant_id=?`,
      [agentId, contact.id, tenantId]
    );

    await connection.commit();

    const pending = await pendingCount(tenantId, campaignId, agentId, maxAttempts);

    const [dispositions] = await db.execute(
      `SELECT name FROM campaign_dispositions
        WHERE tenant_id=? AND active=1 ORDER BY name ASC`,
      [tenantId]
    );

    res.json({
      contact: { ...contact, status: "READY", locked_by_user_id: agentId },
      campaign,
      pending,
      lockExpiresInSeconds: LOCK_TTL_MINUTES * 60,
      dispositions: dispositions.map((row) => row.name)
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ===============================
// START CALL  (POST /api/campaigns/dialer/call)
// ===============================
//
// The SIP leg is placed by the browser softphone, not by AMI Originate. This
// endpoint only records the attempt and returns the number for the frontend
// to dial through the existing softphone.

export async function dialCampaignContact(req, res) {
  const tenantId = req.user.tenant_id;
  const agentId = req.user.id;
  const contactId = String(req.body.contactId || "").trim();
  const callId = req.body.callId ? String(req.body.callId).slice(0, 190) : null;

  if (!contactId) return res.status(400).json({ error: "contactId required" });

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[contact]] = await connection.execute(
      `SELECT * FROM campaign_contacts WHERE id=? AND tenant_id=? LIMIT 1 FOR UPDATE`,
      [contactId, tenantId]
    );

    if (!contact) {
      await connection.rollback();
      return res.status(404).json({ error: "Contact not found" });
    }
    if (contact.locked_by_user_id !== agentId) {
      await connection.rollback();
      return res.status(409).json({ error: "This contact is no longer held by you. Fetch the next contact again." });
    }

    // Checked before touching attempt_count/locked_at — a blocked call
    // shouldn't burn an attempt or otherwise look like a real dial.
    const dnc = await dncStatusForUser(tenantId, req.user, contact.phone);
    if (dnc.onList && !dnc.canCall) {
      await connection.rollback();
      return res.status(403).json({ error: "This number is on the Do-Not-Call list", dnc: true });
    }

    const [[campaign]] = await connection.execute(
      `SELECT max_attempts FROM campaigns WHERE id=? AND tenant_id=? LIMIT 1`,
      [contact.campaign_id, tenantId]
    );
    const maxAttempts = campaign?.max_attempts || 3;

    if (contact.attempt_count >= maxAttempts) {
      await connection.rollback();
      return res.status(409).json({ error: "Maximum attempts already reached for this contact" });
    }

    const callLogId = crypto.randomUUID();

    await connection.execute(
      `INSERT INTO campaign_calls
         (id, tenant_id, campaign_id, contact_id, agent_id, call_id, status, started_at)
       VALUES (?,?,?,?,?,?,'DIALING',NOW())`,
      [callLogId, tenantId, contact.campaign_id, contact.id, agentId, callId]
    );

    await connection.execute(
      `UPDATE campaign_contacts
          SET status='CALLING', attempt_count=attempt_count+1,
              last_called_at=NOW(), locked_at=NOW()
        WHERE id=? AND tenant_id=?`,
      [contact.id, tenantId]
    );

    await connection.commit();

    await audit(
      agentId,
      "CAMPAIGN_DIAL",
      "campaign_contact",
      contact.id,
      { campaignId: contact.campaign_id, callLogId, attempt: contact.attempt_count + 1 },
      tenantId
    );

    res.status(201).json({
      callLogId,
      contactId: contact.id,
      phone: contact.phone,
      name: contact.name,
      attempt: contact.attempt_count + 1,
      maxAttempts
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ===============================
// DISPOSITION  (PATCH /api/campaigns/dialer/disposition)
// ===============================

export async function updateDialerDisposition(req, res) {
  const tenantId = req.user.tenant_id;
  const agentId = req.user.id;

  const contactId = String(req.body.contactId || "").trim();
  const outcome = String(req.body.outcome || "").trim().toUpperCase();
  const callLogId = req.body.callLogId ? String(req.body.callLogId) : null;
  const disposition = req.body.disposition ? String(req.body.disposition).slice(0, 100) : null;
  const notes = req.body.notes ? String(req.body.notes) : null;
  const rawDuration = Number(req.body.duration);
  const duration = Number.isFinite(rawDuration) ? Math.max(0, Math.trunc(rawDuration)) : 0;

  if (!contactId) return res.status(400).json({ error: "contactId required" });

  const allowedOutcomes = [...TERMINAL_OUTCOMES, ...RETRYABLE_OUTCOMES, "SKIPPED"];
  if (!allowedOutcomes.includes(outcome)) {
    return res.status(400).json({ error: `outcome must be one of: ${allowedOutcomes.join(", ")}` });
  }
  if (outcome === "SKIPPED" && !hasPermission(req.user, "SKIP_CONTACT")) {
    return res.status(403).json({ error: "You do not have permission to skip contacts" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[contact]] = await connection.execute(
      `SELECT * FROM campaign_contacts WHERE id=? AND tenant_id=? LIMIT 1 FOR UPDATE`,
      [contactId, tenantId]
    );

    if (!contact) {
      await connection.rollback();
      return res.status(404).json({ error: "Contact not found" });
    }
    if (contact.locked_by_user_id !== agentId) {
      await connection.rollback();
      return res.status(409).json({ error: "This contact is no longer held by you" });
    }

    const [[campaign]] = await connection.execute(
      `SELECT max_attempts, retry_delay_minutes FROM campaigns WHERE id=? AND tenant_id=? LIMIT 1`,
      [contact.campaign_id, tenantId]
    );
    const maxAttempts = campaign?.max_attempts || 3;
    const retryDelay = campaign?.retry_delay_minutes || 30;

    let nextStatus = outcome;
    let retryMinutes = null;

    if (outcome === "SKIPPED") {
      // Back into the pool without consuming a further attempt.
      nextStatus = "ASSIGNED";
    } else if (RETRYABLE_OUTCOMES.includes(outcome) && contact.attempt_count < maxAttempts) {
      // Retries left: schedule the next one. Once attempt_count reaches the
      // cap the queue filter (attempt_count < max) stops handing it out.
      retryMinutes = retryDelay;
    }

    // next_attempt_at is compared against NOW() when picking the next contact,
    // so it has to be computed in MySQL's own clock. A JS Date would be written
    // as UTC and land in the past on a server whose timezone is not UTC.
    const nextAttemptExpr = retryMinutes === null ? "NULL" : "DATE_ADD(NOW(), INTERVAL ? MINUTE)";
    const nextAttemptParams = retryMinutes === null ? [] : [retryMinutes];

    await connection.execute(
      `UPDATE campaign_contacts
          SET status=?, disposition=?, notes=COALESCE(?, notes),
              next_attempt_at=${nextAttemptExpr},
              locked_by_user_id=NULL, locked_at=NULL
        WHERE id=? AND tenant_id=?`,
      [nextStatus, disposition, notes, ...nextAttemptParams, contact.id, tenantId]
    );

    const [[updated]] = await connection.execute(
      `SELECT next_attempt_at FROM campaign_contacts WHERE id=? AND tenant_id=? LIMIT 1`,
      [contact.id, tenantId]
    );
    const nextAttemptAt = updated?.next_attempt_at || null;

    if (callLogId) {
      await connection.execute(
        `UPDATE campaign_calls
            SET status=?, duration=?, disposition=?, ended_at=NOW()
          WHERE id=? AND tenant_id=? AND agent_id=?`,
        [
          CALL_OUTCOMES.includes(outcome) ? outcome : "FAILED",
          duration,
          disposition,
          callLogId,
          tenantId,
          agentId
        ]
      );
    }

    await connection.commit();

    await audit(
      agentId,
      outcome === "SKIPPED" ? "CAMPAIGN_SKIP" : "CAMPAIGN_DISPOSITION",
      "campaign_contact",
      contact.id,
      { campaignId: contact.campaign_id, outcome, disposition, duration },
      tenantId
    );

    res.json({
      contactId: contact.id,
      status: nextStatus,
      attemptCount: contact.attempt_count,
      maxAttempts,
      nextAttemptAt
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
