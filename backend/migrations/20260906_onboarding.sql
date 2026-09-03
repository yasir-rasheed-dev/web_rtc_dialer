-- Public onboarding: a prospect fills the multi-step form on
-- ringnex.co/onboarding, it lands here as PENDING, the Super Admin reviews
-- it (adds a remark, approves/rejects) and then creates the tenant from
-- it — at which point the row is marked PROVISIONED and linked to the
-- tenant it produced.

CREATE TABLE IF NOT EXISTS onboarding_requests (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  status                ENUM('PENDING','APPROVED','REJECTED','PROVISIONED') NOT NULL DEFAULT 'PENDING',

  company_name          VARCHAR(190) NOT NULL,
  workspace_slug        VARCHAR(80)  NOT NULL,
  contact_name          VARCHAR(120) NOT NULL,
  contact_email         VARCHAR(190) NOT NULL,
  contact_phone         VARCHAR(40)  NULL,
  country               VARCHAR(80)  NULL,
  team_size             VARCHAR(40)  NULL,

  plan_id               CHAR(36)     NULL,
  plan_code             VARCHAR(64)  NULL,

  agents_needed         INT          NULL,
  use_case              TEXT         NULL,
  needs_toll_free       TINYINT(1)   NOT NULL DEFAULT 0,
  needs_auto_dialer     TINYINT(1)   NOT NULL DEFAULT 0,
  needs_numbers         TINYINT(1)   NOT NULL DEFAULT 0,
  extra_notes           TEXT         NULL,

  super_admin_remark    TEXT         NULL,
  reviewed_by           CHAR(36)     NULL,
  reviewed_at           DATETIME     NULL,
  provisioned_tenant_id CHAR(36)     NULL,

  ip                    VARCHAR(64)  NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_ob_status  (status),
  KEY idx_ob_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The three published plans the pricing section + onboarding form show.
-- NULL minute/user limits = unlimited. features_json ALL:true keeps every
-- capability on; tweak per plan later from the Super Admin Plans screen.
INSERT IGNORE INTO pricing_plans
  (id, code, name, description, price_per_user, max_users, outbound_minutes, inbound_minutes, features_json, active)
VALUES
  (UUID(), 'starter',  'Starter',
   'For a small team getting started with outbound and inbound calling.',
   19.00, 10, 2000, 2000,
   '{"can_use_auto_dialer":false,"can_use_toll_free":false,"can_purchase_numbers":false}', 1),
  (UUID(), 'business', 'Business',
   'Growing call teams — campaigns, toll-free and richer reporting.',
   35.00, 50, 15000, 15000,
   '{"can_use_auto_dialer":true,"can_use_toll_free":true,"can_purchase_numbers":true}', 1),
  (UUID(), 'pro',      'Pro',
   'High-volume operations — unlimited seats and minutes, every feature on.',
   49.00, NULL, NULL, NULL,
   '{"ALL":true}', 1);

-- Retire the old default seed plan from the public list (any tenant still
-- on it keeps working — plan_id references are untouched; Super Admin can
-- still see it under Plans).
UPDATE pricing_plans SET active = 0 WHERE code = 'custom-unlimited';

