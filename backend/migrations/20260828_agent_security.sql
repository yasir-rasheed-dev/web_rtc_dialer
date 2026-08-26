-- Single-active-session lock, TOTP 2FA and IP-restricted login for tenant users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_session_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS totp_required TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS totp_secret_ciphertext VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS totp_confirmed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS restrict_ip VARCHAR(64) NULL;
