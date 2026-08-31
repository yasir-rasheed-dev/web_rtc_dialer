-- contact_phones/contact_addresses were created via
-- 20260826_contacts_multi_phone_address.sql without an explicit COLLATE,
-- landing on the server's default utf8mb4_general_ci — mismatched with
-- the rest of the schema (contacts, users, ...), all utf8mb4_unicode_ci.
-- Never surfaced until a query actually joined/compared columns across
-- the two collations directly (GET /api/contacts/lookup's contact_phones
-- JOIN contacts), which MySQL rejects outright: "Illegal mix of
-- collations ... for operation '='". Same class of bug, same fix pattern
-- as 20260829_toll_free_collation_fix.sql.
ALTER TABLE contact_phones CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE contact_addresses CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
