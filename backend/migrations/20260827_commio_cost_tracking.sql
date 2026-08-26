-- Tracks what Commio actually charged for a purchased DID (captured from the
-- price quote already fetched during the reserve step — see
-- commioRoutes.js:createPendingOrder/completePendingOrder), so the Super
-- Admin "actual Commio cost per setup" page has a real, purchase-backed
-- figure instead of a guessed recurring rate.
ALTER TABLE tenant_dids
  ADD COLUMN IF NOT EXISTS monthly_cost DECIMAL(10,2) NULL AFTER purchased_at;
