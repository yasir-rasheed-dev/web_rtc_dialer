-- GoHighLevel integration — per-tenant OAuth connection to one GHL
-- sub-account (location). Sync (contact upsert on call end, opportunity
-- create, call-note push) only runs when a row exists AND active = 1.
-- Tokens are AES-256-GCM encrypted (security.js encryptSecret), same as
-- SIP secrets. The API-facing routes are namespaced /api/integrations/crm
-- (GHL blocks any URL containing "ghl"/"highlevel").
CREATE TABLE IF NOT EXISTS tenant_ghl_connections (
  tenant_id            CHAR(36)     NOT NULL PRIMARY KEY,
  location_id          VARCHAR(64)  NOT NULL,
  company_id           VARCHAR(64)  NULL,
  access_token_enc     TEXT         NOT NULL,
  refresh_token_enc    TEXT         NOT NULL,
  token_expires_at     DATETIME     NOT NULL,
  scopes               TEXT         NULL,
  active               TINYINT(1)   NOT NULL DEFAULT 0,
  create_opportunity   TINYINT(1)   NOT NULL DEFAULT 1,
  pipeline_id          VARCHAR(64)  NULL,
  pipeline_stage_id    VARCHAR(64)  NULL,
  connected_by_user_id CHAR(36)     NULL,
  connected_at         DATETIME     NULL,
  last_sync_at         DATETIME     NULL,
  last_error           VARCHAR(255) NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link a ringNex contact to its GHL counterpart (set on first successful
-- upsert) so repeat calls update instead of re-creating, and call notes
-- can be pushed to the right GHL contact.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS ghl_contact_id VARCHAR(64) NULL;
