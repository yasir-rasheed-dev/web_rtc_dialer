-- Denormalized snapshot of the routing profile's Commio name, captured at
-- assignment time, so the Super Admin UI can show "Profile: <name>" for a
-- tenant without an extra live Commio call on every page load.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS commio_routing_profile_name VARCHAR(191) NULL;

UPDATE tenants SET commio_routing_profile_name = 'Ringnex Asterisk'
 WHERE commio_routing_profile_id = 49233 AND commio_routing_profile_name IS NULL;
