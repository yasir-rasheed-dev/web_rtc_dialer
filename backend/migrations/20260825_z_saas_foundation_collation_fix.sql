-- 20260825_saas_foundation.sql's CREATE TABLE statements (and migrate-saas.js's
-- own schema_migrations table) said `DEFAULT CHARSET=utf8mb4` without an
-- explicit COLLATE, so they landed on whatever the server's own utf8mb4
-- default happened to be — utf8mb4_unicode_ci on some MySQL/MariaDB
-- installs (never surfaced there), utf8mb4_general_ci on others (this
-- server). Every later migration that joins/compares these tables
-- against ones created WITH an explicit COLLATE then hits "Illegal mix
-- of collations". Same class of bug, same fix pattern as
-- 20260829_toll_free_collation_fix.sql and
-- 20260831_contact_phones_collation_fix.sql — this one just covers the
-- very first migration's tables, which is why it can surface on a fresh
-- install rather than only after a specific later feature's tables exist.
ALTER TABLE pricing_plans CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE tenants CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE super_admins CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE permissions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE roles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE role_permissions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE tenant_dids CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE tenant_extensions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE contacts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE carrier_cdrs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE schema_migrations CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
