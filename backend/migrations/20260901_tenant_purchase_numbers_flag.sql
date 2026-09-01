-- Whether this tenant is allowed to purchase phone numbers themselves
-- (via PURCHASE_DIDS-permitted users hitting /api/commio/*). Separate
-- from that per-role permission — this is a tenant-wide gate only Super
-- Admin controls, so a tenant a Super Admin hasn't cleared for self-serve
-- purchasing can't buy numbers no matter what a role inside it is
-- granted. Defaults to allowed (1) so every existing tenant's current
-- behavior is unchanged by this migration; Super Admin can turn it off
-- per tenant going forward.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS can_purchase_numbers TINYINT(1) NOT NULL DEFAULT 1 AFTER commio_routing_profile_name;
