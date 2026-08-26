-- Per-tenant Commio inbound routing profile, replacing the single shared
-- COMMIO_ROUTING_PROFILE_ID .env value. Existing tenants are backfilled
-- with that same shared profile id (49233) so their DID purchases keep
-- working unchanged; new tenants get their own via the Super Admin
-- "create setup" flow (either a fresh profile or an explicitly chosen one).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS commio_routing_profile_id INT NULL;

UPDATE tenants SET commio_routing_profile_id = 49233 WHERE commio_routing_profile_id IS NULL;
