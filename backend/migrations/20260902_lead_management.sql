-- Lead Management: shared dispositions (renamed from campaign_dispositions,
-- now used tenant-wide, not just by the Auto Dialer), Leads + interactions
-- + tags + attachments, and the permissions that gate all of it.
--
-- No FOREIGN KEY constraints, matching this schema's existing convention
-- (app-level tenant/lead scoping via indexed columns).

SET NAMES utf8mb4;

-- campaign_dispositions already exists (20260826_auto_dialer_phase1.sql),
-- tenant-scoped with a unique (tenant_id, name), currently only read by the
-- Auto Dialer (dialer.js) as a free-text picklist. Renamed + given a color
-- so it becomes the ONE shared disposition list used everywhere (Auto
-- Dialer, Leads, the End Call popup) — dialer.js's one query is repointed
-- at the new name in the same change as this migration.
RENAME TABLE campaign_dispositions TO dispositions;
ALTER TABLE dispositions ADD COLUMN color VARCHAR(7) NOT NULL DEFAULT '#6366f1' AFTER name;

CREATE TABLE IF NOT EXISTS leads (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  name VARCHAR(200) NULL,
  phone VARCHAR(32) NOT NULL,
  address VARCHAR(255) NULL,
  disposition_id CHAR(36) NULL,
  last_interaction_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_leads_tenant (tenant_id),
  KEY idx_leads_phone (tenant_id, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_interactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  lead_id CHAR(36) NOT NULL,
  call_linkedid VARCHAR(64) NULL,
  agent_user_id CHAR(36) NOT NULL,
  disposition_id CHAR(36) NULL,
  remarks TEXT NULL,
  follow_up_at DATETIME NULL,
  follow_up_done TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_li_tenant (tenant_id),
  KEY idx_li_lead (lead_id),
  KEY idx_li_agent (agent_user_id),
  KEY idx_li_followup (tenant_id, follow_up_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_tags (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  lead_id CHAR(36) NOT NULL,
  tag VARCHAR(60) NOT NULL,
  KEY idx_lt_lead (lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  lead_id CHAR(36) NOT NULL,
  interaction_id CHAR(36) NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  uploaded_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_la_lead (lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (id, permission_key, name, category) VALUES
  (UUID(), 'VIEW_LEADS', 'View Leads', 'Agent Dashboard'),
  (UUID(), 'MANAGE_LEADS', 'Create/Edit Leads', 'Agent Dashboard'),
  (UUID(), 'MANAGE_DISPOSITIONS', 'Manage Dispositions', 'Call & Media'),
  (UUID(), 'SHOW_END_CALL_POPUP', 'Show End Call Popup', 'Call & Media');

-- Leads are a core, widely-used feature — not opt-in, same treatment as
-- VIEW_VOICEMAILS.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.permission_key = 'VIEW_LEADS'
WHERE r.name IN ('Tenant Owner', 'Tenant Admin', 'Supervisor', 'Agent');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.permission_key = 'MANAGE_LEADS'
WHERE r.name IN ('Tenant Owner', 'Tenant Admin', 'Supervisor', 'Agent');

-- Editing the shared disposition list and auto-popping the End Call popup
-- are both opt-in — Tenant Admin only by default, same treatment as
-- REDIRECT_TO_VOICEMAIL/CALL_DNC_NUMBERS.
-- Tenant Owner gets this too (matches permissions.js's own rule: Owner =
-- every permission except the ones in OWNER_BLOCKED, and
-- MANAGE_DISPOSITIONS isn't call-taking so it's never blocked there) —
-- both roles need an explicit backfill since DEFAULT_ROLE_PERMISSIONS only
-- takes effect for brand-new tenants, not existing ones.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.permission_key = 'MANAGE_DISPOSITIONS'
WHERE r.name IN ('Tenant Owner', 'Tenant Admin');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.permission_key = 'SHOW_END_CALL_POPUP'
WHERE r.name = 'Tenant Admin';
