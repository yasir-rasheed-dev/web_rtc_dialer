-- Carries the searchType used at reservation time (commioRoutes.js's
-- createPendingOrder) through to purchase completion, so
-- completePendingOrder can tag the resulting tenant_dids row's
-- number_type correctly — the search type wasn't persisted anywhere
-- before this, so there was no way to know at completion time whether the
-- original search was for a local or toll-free number.
ALTER TABLE commio_pending_orders
  ADD COLUMN IF NOT EXISTS number_type ENUM('LOCAL','TOLLFREE') NOT NULL DEFAULT 'LOCAL' AFTER did;
