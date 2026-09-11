-- GHL "Call" activity logging (duration + answered/no-answer) needs a
-- registered Conversation Provider id for the location — created once on
-- first use and cached here (see ghl.js ensureConversationProvider()).
ALTER TABLE tenant_ghl_connections
  ADD COLUMN IF NOT EXISTS conversation_provider_id VARCHAR(64) NULL;
