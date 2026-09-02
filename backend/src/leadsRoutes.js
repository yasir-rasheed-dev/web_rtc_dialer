// Lead Management: a shared tenant-wide `dispositions` picklist (renamed
// from campaign_dispositions — see 20260902_lead_management.sql — now used
// by the Auto Dialer, the End Call popup and the Leads list alike, not
// just campaigns), persistent `leads` (matched across calls by normalized
// phone number, per the approved design — NOT one throwaway row per call),
// their `lead_interactions` (one per call/After-Call-Work save, carrying
// disposition/remarks/follow-up), `lead_tags` and `lead_attachments`.
//
// Same one-way-dependency convention as voicemailRoutes.js/campaignRoutes.js
// — server.js owns `authenticate` and the call-scoping helpers, this file
// just receives them.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";

import { db } from "./db.js";
import { requirePermission, requireTenantFeature } from "./saas.js";

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

// Same local-disk + UUID-filename + size-limit pattern as
// teamChatRoutes.js's chat attachments — the one place file uploads
// already exist in this codebase.
const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "uploads/lead-attachments");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// ---------------------------------------------------------------------
// Dispositions — the one shared, tenant-wide, colored picklist.
// ---------------------------------------------------------------------
export function createDispositionsRoutes(authenticate) {
  const router = express.Router();

  router.get(
    "/",
    authenticate,
    requirePermission("VIEW_LEADS", "USE_AUTO_DIALER"),
    asyncRoute(async (req, res) => {
      const includeInactive = req.query.includeInactive === "1";
      const [rows] = await db.execute(
        `SELECT id,name,color,active FROM dispositions
          WHERE tenant_id=? ${includeInactive ? "" : "AND active=1"} ORDER BY name ASC`,
        [req.user.tenant_id]
      );
      res.json({ dispositions: rows });
    })
  );

  router.post(
    "/",
    authenticate,
    requirePermission("MANAGE_DISPOSITIONS"),
    asyncRoute(async (req, res) => {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ error: "Disposition name is required" });
      const color = /^#[0-9a-fA-F]{6}$/.test(req.body.color || "") ? req.body.color : "#6366f1";
      const id = crypto.randomUUID();
      try {
        await db.execute(
          `INSERT INTO dispositions (id,tenant_id,name,color,active) VALUES (?,?,?,?,1)`,
          [id, req.user.tenant_id, name, color]
        );
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A disposition with this name already exists" });
        throw error;
      }
      res.status(201).json({ id, name, color });
    })
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission("MANAGE_DISPOSITIONS"),
    asyncRoute(async (req, res) => {
      const [rows] = await db.execute("SELECT * FROM dispositions WHERE id=? AND tenant_id=? LIMIT 1", [req.params.id, req.user.tenant_id]);
      const disposition = rows[0];
      if (!disposition) return res.status(404).json({ error: "Disposition not found" });
      const name = req.body.name !== undefined ? String(req.body.name).trim() : disposition.name;
      if (!name) return res.status(400).json({ error: "Disposition name is required" });
      const color = req.body.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : disposition.color;
      const active = req.body.active === undefined ? disposition.active : (req.body.active ? 1 : 0);
      try {
        await db.execute(
          `UPDATE dispositions SET name=?,color=?,active=? WHERE id=? AND tenant_id=?`,
          [name, color, active, disposition.id, req.user.tenant_id]
        );
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A disposition with this name already exists" });
        throw error;
      }
      res.status(204).end();
    })
  );

  // Soft delete only — existing lead_interactions/campaign_contacts rows
  // keep referencing this disposition_id for history; it just stops
  // showing up in picklists.
  router.delete(
    "/:id",
    authenticate,
    requirePermission("MANAGE_DISPOSITIONS"),
    asyncRoute(async (req, res) => {
      const [result] = await db.execute(
        `UPDATE dispositions SET active=0 WHERE id=? AND tenant_id=?`,
        [req.params.id, req.user.tenant_id]
      );
      if (!result.affectedRows) return res.status(404).json({ error: "Disposition not found" });
      res.status(204).end();
    })
  );

  return router;
}

// ---------------------------------------------------------------------
// Leads + interactions + follow-ups + attachments.
// ---------------------------------------------------------------------
export default function createLeadsRoutes(
  authenticate,
  { callAccessScope, appendCallAgentScope, appendRequestedAgent, normalizeDateFilter }
) {
  const router = express.Router();

  // Super Admin-controlled, tenant-wide — every route below already has
  // its own authenticate + requirePermission(...), this is layered above
  // all of them in one place instead of on each route (mirrors
  // campaignRoutes.js's can_use_auto_dialer gate). Deliberately NOT
  // applied to createDispositionsRoutes above — the Auto Dialer reads that
  // same shared picklist too, gated by its own can_use_auto_dialer flag
  // instead.
  router.use(authenticate, requireTenantFeature("can_use_leads"));

  async function listLeads(req, res) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const scope = await callAccessScope(req.user, "VIEW_TEAM_LEADS");
    const params = [req.user.tenant_id];
    let where = "WHERE l.tenant_id=?";
    where = appendCallAgentScope(where, params, scope, "li.agent_user_id");
    where = appendRequestedAgent(where, params, scope, req.query.agentId, "li.agent_user_id");

    if (req.query.dispositionId) {
      where += " AND l.disposition_id=?";
      params.push(req.query.dispositionId);
    }
    if (req.query.search) {
      where += " AND (l.name LIKE ? OR l.phone LIKE ?)";
      const term = `%${String(req.query.search).slice(0, 64)}%`;
      params.push(term, term);
    }
    const from = normalizeDateFilter(req.query.from);
    const to = normalizeDateFilter(req.query.to);
    if (from) { where += " AND l.created_at>=?"; params.push(`${from} 00:00:00`); }
    if (to) { where += " AND l.created_at<DATE_ADD(?,INTERVAL 1 DAY)"; params.push(`${to} 00:00:00`); }

    // Scoping/searching a lead by "the agent who last worked it" — join
    // its most recent interaction rather than every interaction, so a
    // lead a Supervisor's team member touched once still counts as
    // visible even if someone outside the team later added a note.
    const fromSql = `FROM leads l
      LEFT JOIN (
        SELECT li1.* FROM lead_interactions li1
        INNER JOIN (SELECT lead_id, MAX(created_at) AS max_created FROM lead_interactions GROUP BY lead_id) li2
          ON li2.lead_id = li1.lead_id AND li2.max_created = li1.created_at
      ) li ON li.lead_id = l.id
      LEFT JOIN dispositions d ON d.id = l.disposition_id`;

    const [[count]] = await db.execute(`SELECT COUNT(DISTINCT l.id) AS total ${fromSql} ${where}`, params);
    const [rows] = await db.execute(
      `SELECT DISTINCT l.id,l.name,l.phone,l.address,l.disposition_id,d.name AS disposition_name,d.color AS disposition_color,
              l.last_interaction_at,l.created_at
         ${fromSql} ${where} ORDER BY l.last_interaction_at DESC, l.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ rows, page, pageSize, total: Number(count.total || 0) });
  }

  async function getLead(req, res) {
    const [[lead]] = await db.execute(
      `SELECT l.*, d.name AS disposition_name, d.color AS disposition_color
         FROM leads l LEFT JOIN dispositions d ON d.id=l.disposition_id
        WHERE l.id=? AND l.tenant_id=? LIMIT 1`,
      [req.params.id, req.user.tenant_id]
    );
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const [interactions] = await db.execute(
      `SELECT li.id,li.agent_user_id,u.name AS agent_name,li.disposition_id,d.name AS disposition_name,
              d.color AS disposition_color,li.remarks,li.follow_up_at,li.follow_up_done,li.created_at
         FROM lead_interactions li
         LEFT JOIN users u ON u.id=li.agent_user_id AND u.tenant_id=li.tenant_id
         LEFT JOIN dispositions d ON d.id=li.disposition_id
        WHERE li.lead_id=? AND li.tenant_id=? ORDER BY li.created_at DESC`,
      [lead.id, req.user.tenant_id]
    );
    const [tags] = await db.execute(`SELECT id,tag FROM lead_tags WHERE lead_id=? AND tenant_id=?`, [lead.id, req.user.tenant_id]);
    const [attachments] = await db.execute(
      `SELECT id,interaction_id,file_name,created_at FROM lead_attachments WHERE lead_id=? AND tenant_id=?`,
      [lead.id, req.user.tenant_id]
    );
    res.json({ lead, interactions, tags, attachments });
  }

  // The End Call popup's "End & Save" — find-or-create a persistent lead
  // by normalized phone, optionally save/link a Contact, record one
  // interaction (disposition/remarks/follow-up), and any tags.
  async function saveFromCall(req, res) {
    const phone = normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ error: "A phone number is required" });
    const name = String(req.body.name || "").trim() || null;
    const address = String(req.body.address || "").trim() || null;
    const remarks = String(req.body.remarks || "").trim();
    if (!remarks) return res.status(400).json({ error: "Remarks are required" });
    const dispositionId = req.body.dispositionId || null;
    const followUpAt = req.body.followUpAt || null;
    const tags = Array.isArray(req.body.tags) ? req.body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20) : [];
    const saveToContact = Boolean(req.body.saveToContact);

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [[existingLead]] = await connection.execute(
        `SELECT * FROM leads WHERE tenant_id=? AND phone=? LIMIT 1`,
        [req.user.tenant_id, phone]
      );

      let leadId = existingLead?.id;
      let contactId = existingLead?.contact_id || null;

      if (saveToContact && !contactId) {
        const spaceIndex = (name || "").indexOf(" ");
        const firstName = spaceIndex > 0 ? name.slice(0, spaceIndex) : name || phone;
        const lastName = spaceIndex > 0 ? name.slice(spaceIndex + 1).trim() || null : null;
        contactId = crypto.randomUUID();
        await connection.execute(
          `INSERT INTO contacts (id,tenant_id,owner_user_id,first_name,last_name,phone,notes)
           VALUES (?,?,?,?,?,?,?)`,
          [contactId, req.user.tenant_id, req.user.id, firstName, lastName, phone, "Created from End Call popup"]
        );
        await connection.execute(
          `INSERT INTO contact_phones (id,tenant_id,contact_id,number,label,is_primary) VALUES (?,?,?,?,'MOBILE',1)`,
          [crypto.randomUUID(), req.user.tenant_id, contactId, phone]
        );
      }

      if (!leadId) {
        leadId = crypto.randomUUID();
        await connection.execute(
          `INSERT INTO leads (id,tenant_id,contact_id,name,phone,address,disposition_id,last_interaction_at)
           VALUES (?,?,?,?,?,?,?,NOW())`,
          [leadId, req.user.tenant_id, contactId, name, phone, address, dispositionId]
        );
      } else {
        await connection.execute(
          `UPDATE leads SET contact_id=?,name=COALESCE(?,name),address=COALESCE(?,address),
                  disposition_id=?,last_interaction_at=NOW() WHERE id=? AND tenant_id=?`,
          [contactId, name, address, dispositionId, leadId, req.user.tenant_id]
        );
      }

      const interactionId = crypto.randomUUID();
      await connection.execute(
        `INSERT INTO lead_interactions (id,tenant_id,lead_id,call_linkedid,agent_user_id,disposition_id,remarks,follow_up_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [interactionId, req.user.tenant_id, leadId, req.body.callLinkedid || null, req.user.id, dispositionId, remarks, followUpAt]
      );

      if (tags.length) {
        const [existingTags] = await connection.execute(`SELECT tag FROM lead_tags WHERE lead_id=? AND tenant_id=?`, [leadId, req.user.tenant_id]);
        const existingSet = new Set(existingTags.map((row) => row.tag.toLowerCase()));
        for (const tag of tags) {
          if (existingSet.has(tag.toLowerCase())) continue;
          await connection.execute(
            `INSERT INTO lead_tags (id,tenant_id,lead_id,tag) VALUES (?,?,?,?)`,
            [crypto.randomUUID(), req.user.tenant_id, leadId, tag]
          );
        }
      }

      await connection.commit();
      res.status(201).json({ leadId, interactionId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function uploadAttachment(req, res) {
    const [[interaction]] = await db.execute(
      `SELECT id,lead_id FROM lead_interactions WHERE id=? AND tenant_id=? LIMIT 1`,
      [req.params.interactionId, req.user.tenant_id]
    );
    if (!interaction) return res.status(404).json({ error: "Interaction not found" });
    if (!req.file) return res.status(400).json({ error: "No file was uploaded" });
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO lead_attachments (id,tenant_id,lead_id,interaction_id,file_name,file_path,uploaded_by)
       VALUES (?,?,?,?,?,?,?)`,
      [id, req.user.tenant_id, interaction.lead_id, interaction.id, req.file.originalname, req.file.path, req.user.id]
    );
    res.status(201).json({ id, fileName: req.file.originalname });
  }

  async function downloadAttachment(req, res) {
    const [[attachment]] = await db.execute(
      `SELECT id,file_path,file_name FROM lead_attachments WHERE id=? AND tenant_id=? LIMIT 1`,
      [req.params.id, req.user.tenant_id]
    );
    if (!attachment) return res.status(404).json({ error: "Attachment not found" });
    const candidate = path.resolve(attachment.file_path);
    if (!candidate.startsWith(`${uploadDir}${path.sep}`)) return res.status(403).json({ error: "Invalid attachment path" });
    const stat = await fs.promises.stat(candidate).catch(() => null);
    if (!stat?.isFile()) return res.status(404).json({ error: "Attachment file is unavailable" });
    res.setHeader("Content-Disposition", `attachment; filename="${attachment.file_name.replace(/["\r\n]/g, "")}"`);
    fs.createReadStream(candidate).pipe(res);
  }

  async function listFollowUps(req, res) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const scope = await callAccessScope(req.user, "VIEW_TEAM_LEADS");
    const params = [req.user.tenant_id];
    let where = "WHERE li.tenant_id=? AND li.follow_up_at IS NOT NULL AND li.follow_up_done=0";
    where = appendCallAgentScope(where, params, scope, "li.agent_user_id");

    const when = String(req.query.when || "");
    if (when === "today") where += " AND DATE(li.follow_up_at)=CURDATE()";
    else if (when === "missed") where += " AND li.follow_up_at<NOW()";
    else if (when === "upcoming") where += " AND li.follow_up_at>=NOW()";

    const fromSql = `FROM lead_interactions li
      JOIN leads l ON l.id=li.lead_id
      LEFT JOIN users u ON u.id=li.agent_user_id AND u.tenant_id=li.tenant_id`;
    const [[count]] = await db.execute(`SELECT COUNT(*) AS total ${fromSql} ${where}`, params);
    const [rows] = await db.execute(
      `SELECT li.id,li.follow_up_at,li.remarks,l.id AS lead_id,l.name AS lead_name,l.phone AS lead_phone,
              li.agent_user_id,u.name AS agent_name
         ${fromSql} ${where} ORDER BY li.follow_up_at ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ rows, page, pageSize, total: Number(count.total || 0) });
  }

  async function followUpKpis(req, res) {
    const scope = await callAccessScope(req.user, "VIEW_TEAM_LEADS");
    const params = [req.user.tenant_id];
    let where = "WHERE li.tenant_id=? AND li.follow_up_at IS NOT NULL AND li.follow_up_done=0";
    where = appendCallAgentScope(where, params, scope, "li.agent_user_id");
    const [[row]] = await db.execute(
      `SELECT COUNT(*) AS total,
              SUM(DATE(li.follow_up_at)=CURDATE()) AS today,
              SUM(li.follow_up_at<NOW()) AS missed
         FROM lead_interactions li ${where}`,
      params
    );
    res.json({ total: Number(row.total || 0), today: Number(row.today || 0), missed: Number(row.missed || 0) });
  }

  async function completeFollowUp(req, res) {
    const [result] = await db.execute(
      `UPDATE lead_interactions SET follow_up_done=1 WHERE id=? AND tenant_id=?`,
      [req.params.interactionId, req.user.tenant_id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Follow-up not found" });
    res.status(204).end();
  }

  router.get("/", authenticate, requirePermission("VIEW_LEADS"), asyncRoute(listLeads));
  router.get("/follow-ups", authenticate, requirePermission("VIEW_LEADS"), asyncRoute(listFollowUps));
  router.get("/follow-ups/kpis", authenticate, requirePermission("VIEW_LEADS"), asyncRoute(followUpKpis));
  router.post("/follow-ups/:interactionId/complete", authenticate, requirePermission("MANAGE_LEADS"), asyncRoute(completeFollowUp));
  router.get("/attachments/:id", authenticate, requirePermission("VIEW_LEADS"), asyncRoute(downloadAttachment));
  router.post("/from-call", authenticate, requirePermission("MANAGE_LEADS"), asyncRoute(saveFromCall));
  router.post("/interactions/:interactionId/attachments", authenticate, requirePermission("MANAGE_LEADS"), upload.single("file"), asyncRoute(uploadAttachment));
  router.get("/:id", authenticate, requirePermission("VIEW_LEADS"), asyncRoute(getLead));

  return router;
}
