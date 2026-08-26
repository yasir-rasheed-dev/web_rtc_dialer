-- Commio DID purchase feature (Tenant Owner / Tenant Admin only).
--
-- 1. New PURCHASE_DIDS permission, deliberately separate from MANAGE_DIDS
--    (which only assigns numbers already owned) since this spends real
--    money against the tenant's Commio account. Seeded into the catalog
--    and backfilled onto existing Tenant Owner/Tenant Admin roles — new
--    tenants get it automatically via createDefaultTenantRoles, but that
--    only runs at tenant-creation time (see 20260826_owner_auto_dialer_access.sql
--    for the same pattern).
INSERT IGNORE INTO permissions (id, permission_key, name, category)
VALUES (UUID(), 'PURCHASE_DIDS', 'Purchase Phone Numbers (Commio)', 'Admin Dashboard');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key = 'PURCHASE_DIDS'
WHERE r.name IN ('Tenant Owner', 'Tenant Admin');

-- 2. Server-side record of a reserved-but-not-yet-completed Commio order.
--    The "complete purchase" endpoint requires a matching PENDING row
--    scoped to the requesting tenant before it will call Commio's
--    complete-order API — this is what stops a tenant user from
--    completing/paying for an order_id that isn't theirs.
CREATE TABLE IF NOT EXISTS commio_pending_orders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  commio_order_id BIGINT NOT NULL,
  did VARCHAR(32) NOT NULL,
  requested_by CHAR(36) NOT NULL,
  price_summary JSON NULL,
  status ENUM('PENDING','COMPLETED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_commio_pending_order (commio_order_id),
  KEY idx_commio_pending_tenant (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Traceability on the DID itself: who bought it and which Commio order
--    it came from, for reconciling against the Commio account/invoices.
ALTER TABLE tenant_dids
  ADD COLUMN IF NOT EXISTS commio_order_id BIGINT NULL AFTER status,
  ADD COLUMN IF NOT EXISTS purchased_by CHAR(36) NULL AFTER commio_order_id,
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP NULL AFTER purchased_by;
