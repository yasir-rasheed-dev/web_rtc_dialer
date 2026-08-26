-- Ringnex Auto Dialer Phase 1b
-- Contact locking for the agent dialer.
--
-- Phase 1 shipped campaign_contacts without any lock columns, so two agents
-- (or two browser tabs) could be handed the same contact by
-- getNextDialerContact. These columns make "next contact" an atomic claim.

ALTER TABLE campaign_contacts
    ADD COLUMN locked_by_user_id CHAR(36) NULL AFTER assigned_agent_id,
    ADD COLUMN locked_at DATETIME NULL AFTER locked_by_user_id,
    ADD KEY idx_contact_lock (campaign_id, locked_by_user_id, locked_at);
