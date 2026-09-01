import crypto from "node:crypto";

import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { db } from "./db.js";
import { requirePermission } from "./saas.js";
import * as commio from "./commio.js";

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// Keyed by user id (these routes only ever run after `authenticate`, so
// req.user is always set) rather than IP — a tenant behind a shared/NAT'd
// office IP shouldn't get throttled by a different tenant's activity, and a
// malicious user rotating IPs still can't dodge the limit.
function perUserLimiter(options) {
  return rateLimit({
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip)
  });
}

// Search is read-only against Commio but still worth capping — an
// unthrottled search endpoint is a free way to hammer a third-party API
// under this account's name.
const searchLimiter = perUserLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: "Too many number searches. Please wait a few minutes and try again." }
});

// Reserving/completing an order spends real account balance, so this stays
// tight regardless of how legitimate the traffic looks.
const purchaseLimiter = perUserLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: "Too many purchase attempts. Please wait before trying again." }
});

const NPA_RE = /^[2-9]\d{2}$/;
const NXX_RE = /^[2-9]\d{2}$/;
const STATE_RE = /^[A-Za-z]{2}$/;
const DID_RE = /^1?\d{10}$/;

function normalizeDid(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!DID_RE.test(digits)) return null;
  return digits.length === 10 ? `1${digits}` : digits;
}

// Super Admin-controlled, tenant-wide — separate from (and layered above)
// the PURCHASE_DIDS per-role permission already gating these routes: a
// tenant Super Admin hasn't cleared for self-serve purchasing can't buy
// numbers no matter what a role inside it is granted. req.user already
// carries this (loadTenantUser's query joins tenants), so no extra query.
function requireTenantPurchasingEnabled(req, res, next) {
  if (!req.user.can_purchase_numbers) {
    return res.status(403).json({ error: "Your workspace is not enabled to purchase phone numbers. Contact your account manager." });
  }
  next();
}

async function searchCommioNumbers(req, res) {
  const searchType = String(req.query.searchType || "domestic").toLowerCase();
  if (!["domestic", "tollfree"].includes(searchType)) {
    return res.status(400).json({ error: "searchType must be domestic or tollfree" });
  }

  const npa = req.query.npa ? String(req.query.npa).trim() : "";
  const nxx = req.query.nxx ? String(req.query.nxx).trim() : "";
  const state = req.query.state ? String(req.query.state).trim().toUpperCase() : "";
  const rateCenter = req.query.rateCenter ? String(req.query.rateCenter).trim().slice(0, 40) : "";
  if (npa && !NPA_RE.test(npa)) return res.status(400).json({ error: "Invalid area code" });
  if (nxx && !NXX_RE.test(nxx)) return res.status(400).json({ error: "Invalid exchange (nxx)" });
  if (state && !STATE_RE.test(state)) return res.status(400).json({ error: "Invalid state" });

  let searchBy;
  if (searchType === "domestic") {
    if (nxx && npa) searchBy = "npanxx";
    else if (npa) searchBy = "npa";
    else if (rateCenter || state) searchBy = "ratecenter";
    else return res.status(400).json({ error: "Provide an area code, rate center, or state to search" });
  }

  const results = await commio.searchNumbers({
    searchType,
    searchBy,
    npa: searchType === "domestic" ? npa : req.query.npa,
    nxx,
    state,
    rateCenter,
    quantity: Math.min(Number(req.query.quantity) || 10, 25)
  });

  res.json({
    numbers: results.map((row) => ({
      did: String(row.id),
      npanxx: row.npanxx || null,
      rateCenter: row.ratecenter || null,
      state: row.state || null,
      carrierName: row.carrierName || null,
      match: row.match || null
    }))
  });
}

// tenantId/userId taken as explicit params (not read off req.user) so the
// same core logic can back both the tenant self-serve routes below (Super
// Admin has cleared can_purchase_numbers) and the Super Admin
// buy-on-behalf-of-tenant routes (server.js) — userId is null for the
// latter, since Super Admin has no row in `users` to reference.
async function createPendingOrderCore(tenantId, userId, did, numberType) {
  const [[existing]] = await db.execute(`SELECT id FROM tenant_dids WHERE number=? LIMIT 1`, [did]);
  if (existing) {
    const error = new Error("This number is already owned by a tenant");
    error.statusCode = 409;
    throw error;
  }

  const order = await commio.createOrder(did);
  const orderId = order?.id;
  if (!orderId) throw new Error("Commio did not return an order id");

  let priceSummary = null;
  try {
    priceSummary = await commio.getOrderPrice(orderId);
  } catch {
    // Price lookup failing shouldn't block the reservation — the frontend
    // just won't have a number to show before the user confirms.
  }

  try {
    await db.execute(
      `INSERT INTO commio_pending_orders (id, tenant_id, commio_order_id, did, number_type, requested_by, price_summary, status)
       VALUES (?,?,?,?,?,?,?,'PENDING')`,
      [crypto.randomUUID(), tenantId, orderId, did, numberType, userId, priceSummary ? JSON.stringify(priceSummary) : null]
    );
  } catch (dbError) {
    await commio.cancelOrder(orderId).catch(() => undefined);
    throw dbError;
  }

  return { orderId, did, price: priceSummary };
}

async function createPendingOrder(req, res) {
  const did = normalizeDid(req.body.did);
  if (!did) return res.status(400).json({ error: "Invalid phone number" });

  // The frontend already knows which search produced this DID (its own
  // "Type" dropdown state) — carried through here so completePendingOrder
  // can tag the resulting tenant_dids row correctly. Not derived from the
  // DID's area code on purpose: this codebase deliberately doesn't
  // hardcode a toll-free NPA list anywhere, it relies on what the search
  // actually was.
  const numberType = String(req.body.numberType || "LOCAL").toUpperCase();
  if (!["LOCAL", "TOLLFREE"].includes(numberType)) {
    return res.status(400).json({ error: "numberType must be LOCAL or TOLLFREE" });
  }

  try {
    const result = await createPendingOrderCore(req.user.tenant_id, req.user.id, did, numberType);
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
}

async function completePendingOrderCore(tenantId, userId, orderId) {
  const [[pending]] = await db.execute(
    `SELECT * FROM commio_pending_orders WHERE commio_order_id=? AND tenant_id=? AND status='PENDING' LIMIT 1`,
    [orderId, tenantId]
  );
  // Scoped to this tenant so a user can never complete/pay for an order_id
  // that isn't theirs — the row simply won't be found.
  if (!pending) {
    const error = new Error("No pending order found for this workspace");
    error.statusCode = 404;
    throw error;
  }

  await commio.completeOrder(orderId);

  let routingAssigned = true;
  let routingError = null;
  try {
    const [[tenant]] = await db.execute(`SELECT commio_routing_profile_id FROM tenants WHERE id=? LIMIT 1`, [tenantId]);
    await commio.assignRouting(pending.did, tenant?.commio_routing_profile_id);
  } catch (error) {
    routingAssigned = false;
    routingError = error.message;
  }

  // price_summary was captured from Commio's own price quote at reserve
  // time (createPendingOrder) — reusing it here means "cost" on the Super
  // Admin Commio-cost page traces back to a real Commio-returned number,
  // not a guess.
  const priceSummary = pending.price_summary
    ? typeof pending.price_summary === "string"
      ? JSON.parse(pending.price_summary)
      : pending.price_summary
    : null;
  const monthlyCost = priceSummary && Number.isFinite(Number(priceSummary.total)) ? Number(priceSummary.total) : null;

  const connection = await db.getConnection();
  let didRow;
  try {
    await connection.beginTransaction();
    const id = crypto.randomUUID();
    await connection.execute(
      `INSERT INTO tenant_dids (id, tenant_id, number, number_type, status, commio_order_id, purchased_by, purchased_at, monthly_cost)
       VALUES (?,?,?,?,'AVAILABLE',?,?,NOW(),?)`,
      [id, tenantId, pending.did, pending.number_type || "LOCAL", orderId, userId, monthlyCost]
    );
    await connection.execute(`UPDATE commio_pending_orders SET status='COMPLETED' WHERE id=?`, [pending.id]);
    await connection.commit();
    [[didRow]] = await db.execute(
      `SELECT id,number,number_type,label,status,commio_order_id,purchased_at,monthly_cost FROM tenant_dids WHERE id=?`,
      [id]
    );
  } catch (error) {
    await connection.rollback();
    // The purchase already succeeded with Commio at this point — surface
    // the order id clearly so it can be reconciled manually rather than
    // silently losing track of a paid-for number.
    error.message = `Number ${pending.did} was purchased (Commio order ${orderId}) but saving it failed: ${error.message}`;
    throw error;
  } finally {
    connection.release();
  }

  return { did: didRow, routingAssigned, routingError };
}

async function completePendingOrder(req, res) {
  try {
    const result = await completePendingOrderCore(req.user.tenant_id, req.user.id, req.params.orderId);
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
}

export default function createCommioRoutes(authenticate) {
  const router = express.Router();

  router.get(
    "/search",
    authenticate,
    requirePermission("PURCHASE_DIDS"),
    requireTenantPurchasingEnabled,
    searchLimiter,
    asyncRoute(searchCommioNumbers)
  );

  router.post(
    "/orders",
    authenticate,
    requirePermission("PURCHASE_DIDS"),
    requireTenantPurchasingEnabled,
    purchaseLimiter,
    asyncRoute(createPendingOrder)
  );

  router.post(
    "/orders/:orderId/complete",
    authenticate,
    requirePermission("PURCHASE_DIDS"),
    requireTenantPurchasingEnabled,
    purchaseLimiter,
    asyncRoute(completePendingOrder)
  );

  return router;
}

// Super Admin buying a number and handing it straight to a tenant —
// deliberately bypasses both PURCHASE_DIDS (a tenant-role permission,
// meaningless for a Super Admin) and can_purchase_numbers (the tenant-wide
// gate this whole file otherwise enforces): granting a number directly is
// exactly how a tenant that flag is off for still gets numbers. Mounted
// under /api/super-admin/commio-numbers, tenantId comes from the URL
// param rather than req.user (Super Admin has no tenant_id — they aren't
// a tenant user at all), and purchased_by/requested_by are left NULL
// (Super Admin has no row in `users` to reference).
export function createSuperAdminCommioRoutes(authenticateSuperAdmin) {
  const router = express.Router();

  router.get("/search", authenticateSuperAdmin, searchLimiter, asyncRoute(searchCommioNumbers));

  router.post(
    "/tenants/:tenantId/orders",
    authenticateSuperAdmin,
    purchaseLimiter,
    asyncRoute(async (req, res) => {
      const did = normalizeDid(req.body.did);
      if (!did) return res.status(400).json({ error: "Invalid phone number" });
      const numberType = String(req.body.numberType || "LOCAL").toUpperCase();
      if (!["LOCAL", "TOLLFREE"].includes(numberType)) {
        return res.status(400).json({ error: "numberType must be LOCAL or TOLLFREE" });
      }
      try {
        const result = await createPendingOrderCore(req.params.tenantId, null, did, numberType);
        res.json(result);
      } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
        throw error;
      }
    })
  );

  router.post(
    "/tenants/:tenantId/orders/:orderId/complete",
    authenticateSuperAdmin,
    purchaseLimiter,
    asyncRoute(async (req, res) => {
      try {
        const result = await completePendingOrderCore(req.params.tenantId, null, req.params.orderId);
        res.json(result);
      } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
        throw error;
      }
    })
  );

  return router;
}
