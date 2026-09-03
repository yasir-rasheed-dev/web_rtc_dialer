-- Super Admin hardening. The Super Admin can reset any tenant owner's
-- password and create/disable tenants, so its login was the single
-- highest-value target on the platform and had NO rate limit and NO 2FA.
--
--   totp_secret_ciphertext - AES-256-GCM (security.js encryptSecret)
--   totp_confirmed_at      - set once the QR has been scanned + a code verified
--   totp_required          - 1 = mandatory (default). Not a per-account opt-in.
--   current_session_id     - one active Super Admin session at a time, same
--                            model as users.current_session_id
ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS totp_secret_ciphertext VARCHAR(500) NULL;
ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS totp_confirmed_at DATETIME NULL;
ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS totp_required TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS current_session_id CHAR(36) NULL;

-- Any existing Super Admin accounts are forced through enrolment on their
-- next login (totp_required already defaults to 1; this is explicit).
UPDATE super_admins SET totp_required = 1 WHERE totp_required IS NULL;
