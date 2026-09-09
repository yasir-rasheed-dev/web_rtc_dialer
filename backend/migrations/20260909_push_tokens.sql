-- Cross-platform Team Chat push. One row per device/browser a user has
-- registered a push token from (web, electron, android, ios). Fan-out on
-- a new chat message is done server-side (see teamChatRoutes.js /notify)
-- via Firebase Admin, so every platform gets the same notification.
--
-- Supersedes the single users.fcm_token column (kept, no longer written).
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  user_id     CHAR(36)     NOT NULL,
  tenant_id   CHAR(36)     NOT NULL,
  token       VARCHAR(512) NOT NULL,
  platform    VARCHAR(16)  NOT NULL DEFAULT 'web',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_token (token),
  KEY idx_push_user (user_id),
  KEY idx_push_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
