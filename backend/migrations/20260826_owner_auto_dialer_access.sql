-- Ringnex Auto Dialer — backfill campaign-management access for existing
-- Tenant Owner roles.
--
-- backend/src/permissions.js's OWNER_BLOCKED set already excludes
-- USE_AUTO_DIALER/SKIP_CONTACT for the Tenant Owner (no SIP seat, so they
-- can't personally dial through a campaign queue) but was never meant to
-- exclude the campaign-MANAGEMENT permissions (view/create/manage
-- campaigns, upload/assign contacts, view/export campaign reports) — an
-- admin owner should be able to run campaigns without a seat. That intent
-- is only actually applied when a tenant is first created though
-- (createDefaultTenantRoles in saas.js), so any tenant whose "Tenant
-- Owner" role was seeded before the Auto Dialer permissions existed is
-- still missing these grants. Backfill them for every existing tenant;
-- INSERT IGNORE makes this safe to re-run.

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN (
  'VIEW_CAMPAIGNS',
  'CREATE_CAMPAIGNS',
  'MANAGE_CAMPAIGNS',
  'UPLOAD_CONTACTS',
  'ASSIGN_CONTACTS',
  'VIEW_CAMPAIGN_REPORTS',
  'EXPORT_CAMPAIGN_REPORTS'
)
WHERE r.name = 'Tenant Owner';
