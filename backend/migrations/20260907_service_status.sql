-- Public status page + Super Admin "Developer" dashboard.
--
-- Each row is one component shown on ringnex.co/status. Health for
-- 'api' / 'database' / 'telephony' / 'realtime' is computed live by the
-- backend; any row may also carry a manual override (incident, planned
-- maintenance, "under development") with an optional ETA that the Super
-- Admin sets from the Developer dashboard. The override, when present,
-- wins over the live check.

CREATE TABLE IF NOT EXISTS service_status (
  component_key    VARCHAR(48)  NOT NULL PRIMARY KEY,
  name             VARCHAR(120) NOT NULL,
  sort_order       INT          NOT NULL DEFAULT 100,
  -- NULL = no override, fall back to the live health check
  override_state   ENUM('operational','degraded','maintenance','down') NULL,
  override_message VARCHAR(500) NULL,
  eta_at           DATETIME     NULL,
  updated_by       CHAR(36)     NULL,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO service_status (component_key, name, sort_order) VALUES
  ('api',       'API & Application service', 10),
  ('database',  'Database',                  20),
  ('telephony', 'Voice / Telephony',         30),
  ('realtime',  'Realtime updates',          40),
  ('dialer',    'Auto Dialer',               50),
  ('web',       'Web dashboard',             60);
