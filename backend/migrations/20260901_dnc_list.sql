-- Do-Not-Call list: a tenant-scoped list of numbers agents should not
-- (usually) dial, checked at call time. Two permissions, matching
-- permissions.js: MANAGE_DNC (add/remove/upload numbers) and
-- CALL_DNC_NUMBERS (the one thing that lets a call actually proceed to a
-- listed number — deliberately separate, never bundled).

CREATE TABLE IF NOT EXISTS dnc_numbers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  number VARCHAR(20) NOT NULL,       -- normalized: last 10 digits (NANP)
  raw_number VARCHAR(32) NOT NULL,   -- as entered/uploaded, for display
  reason VARCHAR(255) NULL,
  added_by_user_id CHAR(36) NULL,
  source ENUM('MANUAL','UPLOAD') NOT NULL DEFAULT 'MANUAL',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dnc_tenant_number (tenant_id, number),
  KEY idx_dnc_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (id, permission_key, name, category) VALUES
  (UUID(), 'MANAGE_DNC', 'Manage Do-Not-Call List', 'Compliance'),
  (UUID(), 'CALL_DNC_NUMBERS', 'Call Do-Not-Call Numbers', 'Compliance');

-- Backfill onto existing tenants' roles — mirrors permissions.js's
-- DEFAULT_ROLE_PERMISSIONS, since that only applies at tenant-creation
-- time (createDefaultTenantRoles), same reasoning as
-- 20260829_toll_free_campaigns.sql's own backfill.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key = 'MANAGE_DNC'
WHERE r.name IN ('Tenant Owner', 'Tenant Admin', 'Supervisor');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key = 'CALL_DNC_NUMBERS'
WHERE r.name = 'Tenant Admin';
