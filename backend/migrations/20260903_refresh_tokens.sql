-- Refresh tokens: a short-lived access JWT (minutes) is paired with a
-- long-lived, server-revocable refresh token (days). The frontend stores
-- the refresh token and silently exchanges it for a fresh access token
-- when the old one expires, so a user is no longer logged out every time
-- the access JWT lapses (or a tab/app is closed and reopened).
--
-- Security model:
--   * only the SHA-256 hash of the token is stored, never the value
--   * every use ROTATES the token (old row revoked, new row issued in the
--     same `family_id`)
--   * re-use of an already-revoked token => the whole family is revoked
--     (classic refresh-token theft detection)
--   * `session_id` ties the family to users.current_session_id, so a
--     newer login on another device invalidates old families too — the
--     existing single-active-session behaviour is preserved.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  user_id      CHAR(36)     NOT NULL,
  tenant_id    CHAR(36)     NOT NULL,
  session_id   CHAR(36)     NOT NULL,
  family_id    CHAR(36)     NOT NULL,
  token_hash   CHAR(64)     NOT NULL,
  expires_at   DATETIME     NOT NULL,
  revoked_at   DATETIME     NULL,
  replaced_by  CHAR(36)     NULL,
  user_agent   VARCHAR(255) NULL,
  ip           VARCHAR(64)  NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME     NULL,
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY idx_refresh_user (user_id),
  KEY idx_refresh_family (family_id),
  KEY idx_refresh_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
