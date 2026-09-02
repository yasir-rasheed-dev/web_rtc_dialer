-- Two more Super Admin-controlled, tenant-wide feature gates — same
-- pattern as can_purchase_numbers (20260901_tenant_purchase_numbers_flag.sql):
-- layered ABOVE the existing per-role permissions (USE_AUTO_DIALER/
-- VIEW_CAMPAIGNS/... and VIEW_TOLL_FREE/MANAGE_TOLL_FREE_CAMPAIGNS), not a
-- replacement for them. Default to allowed (1) so every existing tenant's
-- current behavior is unchanged; Super Admin can turn either off per tenant
-- going forward.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS can_use_auto_dialer TINYINT(1) NOT NULL DEFAULT 1 AFTER can_purchase_numbers,
  ADD COLUMN IF NOT EXISTS can_use_toll_free TINYINT(1) NOT NULL DEFAULT 1 AFTER can_use_auto_dialer;
