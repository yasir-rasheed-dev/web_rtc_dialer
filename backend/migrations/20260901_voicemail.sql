-- Voicemail-on-decline for direct PSTN -> agent calls (NOT the toll-free
-- queue/campaign path, which deliberately stays voicemail-free). A
-- dedicated table rather than new `calls` columns: `calls.disposition`
-- already uses 'VOICEMAIL'/'VM' for something unrelated (an agent
-- manually tagging a completed call, see server.js's reporting SUM), and
-- a voicemail's own lifecycle (new/heard, its own audio file, arriving
-- after the call row's own Hangup upsert already ran) doesn't fit
-- `calls`' one-row-per-linkedid upsert semantics.
--
-- Two permissions, matching permissions.js:
--   VIEW_VOICEMAILS       - see/play voicemails (own, or team/tenant-wide
--                            per VIEW_TEAM_VOICEMAILS / VIEW_REPORTS etc,
--                            same scope model as VIEW_RECORDINGS)
--   REDIRECT_TO_VOICEMAIL - the one thing that actually lets a declined/
--                            unanswered call fall through to voicemail
--                            instead of a plain busy-tone hangup -
--                            deliberately separate and opt-in per role,
--                            same "never bundled by default" treatment as
--                            CALL_DNC_NUMBERS in 20260901_dnc_list.sql.

CREATE TABLE IF NOT EXISTS voicemails (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  agent_user_id CHAR(36) NOT NULL,
  linkedid VARCHAR(64) NULL,
  from_number VARCHAR(32) NOT NULL,
  to_number VARCHAR(32) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  duration_sec INT NOT NULL DEFAULT 0,
  heard_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vm_tenant (tenant_id),
  KEY idx_vm_agent (agent_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (id, permission_key, name, category) VALUES
  (UUID(), 'VIEW_VOICEMAILS', 'Play Voicemails', 'Agent Dashboard'),
  (UUID(), 'REDIRECT_TO_VOICEMAIL', 'Redirect Declined Calls to Voicemail', 'Call & Media');

-- Backfill onto existing tenants' roles — mirrors permissions.js's
-- DEFAULT_ROLE_PERMISSIONS, since that only applies at tenant-creation
-- time (createDefaultTenantRoles), same reasoning as
-- 20260901_dnc_list.sql's own backfill.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key = 'VIEW_VOICEMAILS'
WHERE r.name IN ('Tenant Owner', 'Tenant Admin', 'Supervisor', 'Agent');

-- Opt-in only: Tenant Admin already gets every permission by default, so
-- this only needs an explicit row there — Supervisor/Agent roles are left
-- without it until an Owner/Admin turns it on per role in Roles &
-- Privileges, exactly like CALL_DNC_NUMBERS above it.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key = 'REDIRECT_TO_VOICEMAIL'
WHERE r.name = 'Tenant Admin';
