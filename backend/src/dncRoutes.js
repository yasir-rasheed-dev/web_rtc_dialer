// Do-Not-Call list: a tenant-scoped list of numbers agents shouldn't dial,
// checked before every outbound call actually goes out. Two permissions
// (see permissions.js): MANAGE_DNC (edit the list) and CALL_DNC_NUMBERS
// (the one thing that lets a call to a listed number actually proceed —
// deliberately separate so granting list-management to a supervisor never
// silently also lets them bypass it).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";

import { db } from "./db.js";
import { requirePermission, hasPermission } from "./saas.js";
import { readSheetRows } from "./spreadsheet.js";

const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "uploads/dnc");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname || "");
    cb(ok ? null : new Error("Upload a .csv or .xlsx file"), ok);
  }
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// Numbers show up as +1XXXXXXXXXX, 1XXXXXXXXXX, or bare XXXXXXXXXX
// (NANP — matches every number-normalization convention elsewhere in this
// codebase, e.g. callTracker.js's #resolveTenantByDid) — strip everything
// but digits, then key on the last 10 so all three forms of the same
// number collide onto one row instead of three.
export function normalizeDncNumber(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.slice(-10);
}

// Reusable by other backend code (the auto-dialer's dial endpoint) so a
// DNC check doesn't need an extra HTTP round-trip — one query, one
// permission check, same rule the /check route below applies.
export async function dncStatusForUser(tenantId, user, rawNumber) {
  const normalized = normalizeDncNumber(rawNumber);
  if (!normalized) return { onList: false, canCall: true };
  const [[row]] = await db.execute(
    `SELECT id, reason FROM dnc_numbers WHERE tenant_id=? AND number=? LIMIT 1`,
    [tenantId, normalized]
  );
  const onList = Boolean(row);
  const canCall = !onList || hasPermission(user, "CALL_DNC_NUMBERS");
  return { onList, canCall, reason: row?.reason || null };
}

async function listDnc(req, res) {
  const search = String(req.query.search || "").slice(0, 40);
  const term = `%${search}%`;
  const [rows] = await db.execute(
    `SELECT id, number, raw_number, reason, source, created_at
       FROM dnc_numbers
      WHERE tenant_id=? AND (?='' OR raw_number LIKE ? OR number LIKE ?)
      ORDER BY created_at DESC LIMIT 1000`,
    [req.user.tenant_id, search, term, term]
  );
  res.json({ numbers: rows });
}

async function addDnc(req, res) {
  const raw = String(req.body?.number || "").trim();
  const normalized = normalizeDncNumber(raw);
  if (!normalized) return res.status(400).json({ error: "Enter a valid phone number" });
  const reason = String(req.body?.reason || "").trim().slice(0, 255) || null;

  const [existing] = await db.execute(
    `SELECT id FROM dnc_numbers WHERE tenant_id=? AND number=? LIMIT 1`,
    [req.user.tenant_id, normalized]
  );
  if (existing.length) return res.status(409).json({ error: "This number is already on the Do-Not-Call list" });

  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO dnc_numbers (id, tenant_id, number, raw_number, reason, added_by_user_id, source)
     VALUES (?,?,?,?,?,?,'MANUAL')`,
    [id, req.user.tenant_id, normalized, raw, reason, req.user.id]
  );
  res.status(201).json({ id, number: normalized, raw_number: raw, reason });
}

async function deleteDnc(req, res) {
  const [result] = await db.execute(
    `DELETE FROM dnc_numbers WHERE id=? AND tenant_id=?`,
    [req.params.id, req.user.tenant_id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: "Number not found" });
  res.status(204).end();
}

// Accepts a "Phone"/"phone"/"Number"/"number" column (same loose-header
// convention as campaign.js's contact upload) — one bad/duplicate row
// never aborts the rest; every row is independently counted as inserted,
// a duplicate (already on the list, or repeated within the same sheet),
// or skipped (no usable number).
async function uploadDnc(req, res) {
  if (!req.file) return res.status(400).json({ error: "Excel file is required" });

  try {
    const rows = await readSheetRows(req.file.path);

    let inserted = 0;
    let duplicates = 0;
    let skipped = 0;
    const seenThisUpload = new Set();

    for (const row of rows) {
      const raw = String(row.Phone ?? row.phone ?? row.Number ?? row.number ?? "").trim();
      const normalized = normalizeDncNumber(raw);
      if (!normalized) {
        skipped++;
        continue;
      }
      if (seenThisUpload.has(normalized)) {
        duplicates++;
        continue;
      }
      seenThisUpload.add(normalized);

      const [result] = await db.execute(
        `INSERT IGNORE INTO dnc_numbers (id, tenant_id, number, raw_number, added_by_user_id, source)
         VALUES (?,?,?,?,?,'UPLOAD')`,
        [crypto.randomUUID(), req.user.tenant_id, normalized, raw, req.user.id]
      );
      if (result.affectedRows) inserted++;
      else duplicates++; // already existed on the list from before this upload
    }

    res.json({ inserted, duplicates, skipped, total: rows.length });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
}

async function checkDnc(req, res) {
  const number = String(req.query.number || "").trim();
  if (!number) return res.status(400).json({ error: "number is required" });
  const status = await dncStatusForUser(req.user.tenant_id, req.user, number);
  res.json(status);
}

// `authenticate` lives in server.js, which imports this module — taken as
// an argument, same one-way-dependency convention as the other route
// modules (campaignRoutes.js, tollFreeRoutes.js).
export default function createDncRoutes(authenticate) {
  const router = express.Router();

  router.get("/", authenticate, requirePermission("MANAGE_DNC"), asyncRoute(listDnc));
  router.post("/", authenticate, requirePermission("MANAGE_DNC"), asyncRoute(addDnc));
  router.post("/upload", authenticate, requirePermission("MANAGE_DNC"), upload.single("file"), asyncRoute(uploadDnc));
  router.delete("/:id", authenticate, requirePermission("MANAGE_DNC"), asyncRoute(deleteDnc));
  // Deliberately NOT gated by MANAGE_DNC — every telephony role that can
  // make calls needs to hit this before dialing, not just DNC managers.
  router.get("/check", authenticate, asyncRoute(checkDnc));

  return router;
}
