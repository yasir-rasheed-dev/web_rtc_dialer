-- Lead Management, gated behind a Super Admin-controlled tenant feature
-- flag, same treatment as can_use_auto_dialer/can_use_toll_free
-- (20260901_tenant_feature_flags.sql). Defaults to 0 (off) rather than 1 —
-- unlike Auto Dialer/Toll-Free, no existing tenant was already using this
-- (it's brand new), so nothing should silently switch on for anyone.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS can_use_leads TINYINT(1) NOT NULL DEFAULT 0 AFTER can_use_toll_free;
