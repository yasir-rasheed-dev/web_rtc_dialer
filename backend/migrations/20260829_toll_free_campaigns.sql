-- Toll-free numbers: inbound campaigns, optional IVR, agent queue.
--
-- 1. New permissions, following the same two-part pattern as PURCHASE_DIDS
--    (20260827_commio_did_purchase.sql): seeded into the catalog for new
--    tenants (createDefaultTenantRoles reads permissions.js's PERMISSIONS/
--    DEFAULT_ROLE_PERMISSIONS at tenant-creation time), and backfilled here
--    onto existing tenants' Tenant Owner/Tenant Admin roles since that
--    seeding only runs once, at creation.
INSERT IGNORE INTO permissions (id, permission_key, name, category) VALUES
  (UUID(), 'VIEW_TOLL_FREE', 'View Toll-Free Numbers & Campaigns', 'Toll-Free'),
  (UUID(), 'MANAGE_TOLL_FREE_CAMPAIGNS', 'Manage Toll-Free Campaigns & IVRs', 'Toll-Free');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN ('VIEW_TOLL_FREE', 'MANAGE_TOLL_FREE_CAMPAIGNS')
WHERE r.name IN ('Tenant Owner', 'Tenant Admin');

-- 2. Distinguishes local vs toll-free on a purchased number. Nothing wrote
--    this before now — every DID purchased via commioRoutes.js looked
--    identical regardless of the searchType used to find it. Backfilled to
--    LOCAL for existing numbers since toll-free-ness genuinely wasn't
--    tracked; only numbers purchased going forward with searchType=tollfree
--    get tagged TOLLFREE (see commioRoutes.js's completePendingOrder).
ALTER TABLE tenant_dids
  ADD COLUMN IF NOT EXISTS number_type ENUM('LOCAL','TOLLFREE') NOT NULL DEFAULT 'LOCAL' AFTER number;

-- 3. Reusable IVR menus. A greeting plus a flat list of digit options (no
--    nested sub-menus in v1 — an option's action_type could later grow a
--    'IVR' case pointing at another ivr_id without a schema rebuild).
--    Audio isn't stored here: greeting_text/prompt_text are the source
--    text, rendered to a WAV file on save via eSpeak NG (see
--    backend/src/tts.js) and referenced by the *_audio_path columns for
--    the Asterisk dialplan's Playback() to use directly.
CREATE TABLE IF NOT EXISTS ivrs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  greeting_text VARCHAR(500) NOT NULL,
  greeting_audio_path VARCHAR(255) NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ivrs_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ivr_options (
  id CHAR(36) NOT NULL PRIMARY KEY,
  ivr_id CHAR(36) NOT NULL,
  digit VARCHAR(1) NOT NULL,
  prompt_text VARCHAR(300) NOT NULL,
  prompt_audio_path VARCHAR(255) NULL,
  action_type ENUM('CAMPAIGN','HANGUP') NOT NULL DEFAULT 'CAMPAIGN',
  target_campaign_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ivr_digit (ivr_id, digit),
  KEY idx_ivr_options_ivr (ivr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. An inbound campaign: one toll-free DID, a static agent roster, an
--    optional IVR gate, and Active/Inactive. ring_strategy is stored
--    per-campaign (rather than a single global value) so it's changeable
--    later without a schema change, even though v1 only ever writes
--    'ringall'. no_answer_timeout_sec mirrors the decided 5-minute
--    queue wait before the caller hears the timeout message and the call
--    ends (Asterisk Queue()'s own timeout parameter reads this).
CREATE TABLE IF NOT EXISTS inbound_campaigns (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  did_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'INACTIVE',
  ivr_id CHAR(36) NULL,
  ring_strategy VARCHAR(32) NOT NULL DEFAULT 'ringall',
  no_answer_timeout_sec INT NOT NULL DEFAULT 300,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_did (did_id),
  KEY idx_inbound_campaigns_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. The queue's static membership list — who's assigned to this campaign
--    at all. Live/effective queue membership is further gated by that
--    user's real-time status ('READY' only; see server.js's agent/status
--    handler, extended to sync the realtime queue_members table this
--    joins against on the Asterisk side).
CREATE TABLE IF NOT EXISTS inbound_campaign_agents (
  campaign_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, user_id),
  KEY idx_campaign_agents_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
