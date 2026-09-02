-- Session hand-off grace: when an agent signs in on a second device while
-- a call is live on the first, the first device is NOT kicked immediately
-- (that would drop a customer call). Instead it keeps working through the
-- current call + wrap-up, and is logged out the moment it starts/receives
-- the NEXT call (or after a hard cap).
--
--   grace_session_id     - the still-allowed OLD session id
--   grace_call_linkedid  - the call that was live at hand-off; a Newchannel
--                          on any OTHER linkedid for this agent ends grace
--   grace_expires_at     - hard cap (server sweeps past this)
ALTER TABLE users ADD COLUMN IF NOT EXISTS grace_session_id    CHAR(36) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS grace_call_linkedid VARCHAR(64) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS grace_expires_at    DATETIME NULL;
