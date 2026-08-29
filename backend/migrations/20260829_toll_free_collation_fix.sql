-- 20260829_toll_free_campaigns.sql created its 4 new tables with
-- `DEFAULT CHARSET=utf8mb4` but no explicit COLLATE, so they landed on
-- utf8mb4_general_ci (this server's default) while every other table
-- they JOIN against (tenant_dids, users, campaigns, ...) uses
-- utf8mb4_unicode_ci — caught immediately by a real end-to-end test of
-- the new /api/toll-free routes ("Illegal mix of collations"). Fixing
-- forward with a new migration rather than editing the already-applied
-- one, per this project's existing convention.
ALTER TABLE ivrs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE ivr_options CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE inbound_campaigns CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE inbound_campaign_agents CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
