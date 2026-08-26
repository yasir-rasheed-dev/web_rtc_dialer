-- Ringnex Contacts — multi-phone, multi-address, richer profile fields
--
-- Adds optional profile columns to `contacts` plus two new child tables for
-- multiple phone numbers and multiple addresses per contact. No FOREIGN KEY
-- constraints, matching this schema's existing convention elsewhere
-- (app-level tenant/contact scoping via indexed columns, e.g.
-- campaign_contacts) — child rows are cleaned up explicitly in the API
-- route, not via ON DELETE CASCADE.
--
-- The legacy `contacts.phone`/`contacts.email` columns are kept as the
-- "primary" phone/email for backward compatibility with the existing list
-- search (LIKE on phone/email) — the API keeps them in sync with the first
-- row in contact_phones on every create/update.

SET NAMES utf8mb4;

ALTER TABLE contacts
    ADD COLUMN nickname VARCHAR(100) NULL AFTER last_name,
    ADD COLUMN job_title VARCHAR(120) NULL AFTER company,
    ADD COLUMN birthdate DATE NULL AFTER job_title,
    ADD COLUMN website VARCHAR(255) NULL AFTER birthdate,
    ADD COLUMN source VARCHAR(40) NOT NULL DEFAULT 'OTHER' AFTER website;

CREATE TABLE IF NOT EXISTS contact_phones (
    id CHAR(36) NOT NULL PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    contact_id CHAR(36) NOT NULL,
    number VARCHAR(32) NOT NULL,
    label ENUM('MOBILE','HOME','WORK','OTHER') NOT NULL DEFAULT 'MOBILE',
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_contact_phones_contact (tenant_id, contact_id),
    KEY idx_contact_phones_number (tenant_id, number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contact_addresses (
    id CHAR(36) NOT NULL PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    contact_id CHAR(36) NOT NULL,
    label ENUM('HOME','WORK','OTHER') NOT NULL DEFAULT 'OTHER',
    line1 VARCHAR(190) NULL,
    line2 VARCHAR(190) NULL,
    city VARCHAR(100) NULL,
    state VARCHAR(100) NULL,
    postal_code VARCHAR(20) NULL,
    country VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_contact_addresses_contact (tenant_id, contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill: give every existing single-phone contact a primary row in
-- contact_phones so the new multi-phone UI shows their existing number
-- instead of appearing empty.
INSERT INTO contact_phones (id, tenant_id, contact_id, number, label, is_primary)
SELECT UUID(), tenant_id, id, phone, 'MOBILE', 1
FROM contacts
WHERE phone IS NOT NULL AND phone <> '';
