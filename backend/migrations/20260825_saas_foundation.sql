-- Ringnex SaaS foundation migration
-- Run against the existing ringnex_dialer application database BEFORE starting the SaaS backend.
-- Existing users/calls are migrated into a "Legacy Workspace" tenant so the current working dialer is preserved.

SET NAMES utf8mb4;
SET @legacy_tenant_id = '00000000-0000-4000-8000-000000000001';

CREATE TABLE IF NOT EXISTS pricing_plans (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  price_per_user DECIMAL(12,2) NOT NULL DEFAULT 0,
  max_users INT NULL,
  outbound_minutes INT NULL,
  inbound_minutes INT NULL,
  features_json LONGTEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pricing_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tenants (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  workspace VARCHAR(80) NOT NULL,
  status ENUM('TRIAL','ACTIVE','INACTIVE','SUSPENDED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  plan_id CHAR(36) NULL,
  price_per_user DECIMAL(12,2) NOT NULL DEFAULT 0,
  max_users INT NULL,
  outbound_minutes INT NULL,
  inbound_minutes INT NULL,
  features_json LONGTEXT NULL,
  extension_start INT NOT NULL DEFAULT 1001,
  next_extension INT NOT NULL DEFAULT 1001,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  country VARCHAR(80) NULL,
  billing_cycle ENUM('CALENDAR_MONTH','ANNIVERSARY') NOT NULL DEFAULT 'CALENDAR_MONTH',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenants_workspace (workspace),
  KEY idx_tenants_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS super_admins (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_super_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  permission_key VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_permission_key (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenant_role_name (tenant_id, name),
  KEY idx_roles_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id CHAR(36) NOT NULL,
  permission_id CHAR(36) NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_permission (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tenant_dids (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  number VARCHAR(32) NOT NULL,
  label VARCHAR(120) NULL,
  assigned_user_id CHAR(36) NULL,
  status ENUM('AVAILABLE','ASSIGNED','RELEASED','DISABLED') NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_did_number (number),
  KEY idx_tenant_dids_tenant (tenant_id),
  KEY idx_tenant_dids_user (assigned_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tenant_extensions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  extension VARCHAR(24) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status ENUM('ASSIGNED','RELEASED') NOT NULL DEFAULT 'ASSIGNED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at DATETIME NULL,
  UNIQUE KEY uq_tenant_extension (tenant_id, extension),
  KEY idx_tenant_extensions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contacts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  owner_user_id CHAR(36) NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NULL,
  company VARCHAR(160) NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(190) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_contacts_tenant (tenant_id),
  KEY idx_contacts_phone (tenant_id, phone),
  KEY idx_contacts_email (tenant_id, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS carrier_cdrs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'COMMIO',
  provider_cdr_id VARCHAR(190) NOT NULL,
  direction ENUM('INBOUND','OUTBOUND') NOT NULL,
  from_number VARCHAR(32) NULL,
  to_number VARCHAR(32) NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  billable_seconds INT NOT NULL DEFAULT 0,
  cost DECIMAL(14,6) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  raw_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_carrier_cdr (provider, provider_cdr_id),
  KEY idx_carrier_cdr_tenant_time (tenant_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add SaaS ownership columns to the existing working tables.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id CHAR(36) NULL AFTER id;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id CHAR(36) NULL AFTER role;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS tenant_id CHAR(36) NULL AFTER id;
ALTER TABLE call_events ADD COLUMN IF NOT EXISTS tenant_id CHAR(36) NULL AFTER id;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id CHAR(36) NULL AFTER id;

INSERT INTO tenants (
  id, name, workspace, status, price_per_user, max_users, outbound_minutes, inbound_minutes,
  features_json, extension_start, next_extension, timezone
) VALUES (
  @legacy_tenant_id, 'Legacy Workspace', 'legacy', 'ACTIVE', 0, NULL, NULL, NULL,
  '{"ALL":true}', 1001,
  GREATEST(1001, COALESCE((SELECT MAX(CAST(extension AS UNSIGNED)) + 1 FROM users WHERE extension REGEXP '^[0-9]+$'), 1001)),
  'UTC'
) ON DUPLICATE KEY UPDATE name=VALUES(name);

UPDATE users SET tenant_id=@legacy_tenant_id WHERE tenant_id IS NULL;
UPDATE calls SET tenant_id=@legacy_tenant_id WHERE tenant_id IS NULL;
UPDATE call_events SET tenant_id=@legacy_tenant_id WHERE tenant_id IS NULL;
UPDATE audit_logs SET tenant_id=@legacy_tenant_id WHERE tenant_id IS NULL;

-- Permission catalog. IDs are deterministic enough for repeated migration execution because permission_key is unique.
INSERT IGNORE INTO permissions (id, permission_key, name, category) VALUES
(UUID(),'VIEW_DASHBOARD','View Dashboard','General'),
(UUID(),'VIEW_DIALER','View Dialer','Call & Media'),
(UUID(),'MAKE_CALLS','Make Outbound Calls','Call & Media'),
(UUID(),'RECEIVE_CALLS','Receive Inbound Calls','Call & Media'),
(UUID(),'HOLD_CALL','Hold / Resume Calls','Call & Media'),
(UUID(),'SEND_DTMF','Send DTMF','Call & Media'),
(UUID(),'BLIND_TRANSFER','Blind Transfer','Call & Media'),
(UUID(),'WARM_TRANSFER','Warm Transfer','Call & Media'),
(UUID(),'ADD_PARTICIPANT','Add Participant','Call & Media'),
(UUID(),'RECORD_CALL','Recording','Call & Media'),
(UUID(),'VIEW_CALL_LOGS','View Call Logs','Agent Dashboard'),
(UUID(),'EDIT_CALL_DISPOSITION','Edit Call Disposition','Agent Dashboard'),
(UUID(),'VIEW_RECORDINGS','Play Recordings','Agent Dashboard'),
(UUID(),'VIEW_CONTACTS','View Contacts','Agent Dashboard'),
(UUID(),'CREATE_CONTACTS','Create Contacts','Agent Dashboard'),
(UUID(),'EDIT_CONTACTS','Edit Contacts','Agent Dashboard'),
(UUID(),'DELETE_CONTACTS','Delete Contacts','Agent Dashboard'),
(UUID(),'VIEW_AGENTS','View Users / Agents','Admin Dashboard'),
(UUID(),'MANAGE_AGENTS','Manage Users / Agents','Admin Dashboard'),
(UUID(),'VIEW_TEAMS','View Teams','Admin Dashboard'),
(UUID(),'MANAGE_TEAMS','Manage Teams','Admin Dashboard'),
(UUID(),'VIEW_ROLES','View Roles','Admin Dashboard'),
(UUID(),'MANAGE_ROLES','Manage Roles','Admin Dashboard'),
(UUID(),'VIEW_REPORTS','View Reports','Admin Dashboard'),
(UUID(),'VIEW_USAGE','View Usage','Admin Dashboard'),
(UUID(),'VIEW_DIDS','View Phone Numbers / DIDs','Admin Dashboard'),
(UUID(),'MANAGE_DIDS','Assign Phone Numbers / DIDs','Admin Dashboard'),
(UUID(),'MONITOR_CALLS','Live Call Monitoring','Supervisor'),
(UUID(),'LISTEN_LIVE_CALLS','Listen Live Calls','Supervisor'),
(UUID(),'WHISPER_CALLS','Whisper','Supervisor'),
(UUID(),'BARGE_CALLS','Barge','Supervisor'),
(UUID(),'VIEW_BILLING','View Billing','Billing'),
(UUID(),'MANAGE_SETTINGS','Manage Tenant Settings','Security & Account');

-- Default roles for the migrated single-tenant installation.
SET @owner_role = '00000000-0000-4000-8000-000000000101';
SET @admin_role = '00000000-0000-4000-8000-000000000102';
SET @supervisor_role = '00000000-0000-4000-8000-000000000103';
SET @agent_role = '00000000-0000-4000-8000-000000000104';

INSERT IGNORE INTO roles (id,tenant_id,name,description,is_system,active) VALUES
(@owner_role,@legacy_tenant_id,'Tenant Owner','Legacy tenant owner role',1,1),
(@admin_role,@legacy_tenant_id,'Tenant Admin','Legacy tenant admin role',1,1),
(@supervisor_role,@legacy_tenant_id,'Supervisor','Legacy supervisor role',1,1),
(@agent_role,@legacy_tenant_id,'Agent','Legacy agent role',1,1);

-- Owner/Admin get every permission.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT @owner_role, id FROM permissions;
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT @admin_role, id FROM permissions;

-- Supervisor permissions.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT @supervisor_role, id FROM permissions WHERE permission_key IN (
'VIEW_DASHBOARD','VIEW_DIALER','MAKE_CALLS','RECEIVE_CALLS','HOLD_CALL','SEND_DTMF','BLIND_TRANSFER',
'WARM_TRANSFER','ADD_PARTICIPANT','RECORD_CALL','VIEW_CALL_LOGS','EDIT_CALL_DISPOSITION','VIEW_RECORDINGS',
'VIEW_CONTACTS','CREATE_CONTACTS','EDIT_CONTACTS','VIEW_AGENTS','VIEW_TEAMS','VIEW_REPORTS','MONITOR_CALLS',
'LISTEN_LIVE_CALLS','WHISPER_CALLS','BARGE_CALLS');

-- Agent permissions.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT @agent_role, id FROM permissions WHERE permission_key IN (
'VIEW_DASHBOARD','VIEW_DIALER','MAKE_CALLS','RECEIVE_CALLS','HOLD_CALL','SEND_DTMF','BLIND_TRANSFER',
'WARM_TRANSFER','ADD_PARTICIPANT','RECORD_CALL','VIEW_CALL_LOGS','EDIT_CALL_DISPOSITION','VIEW_RECORDINGS',
'VIEW_CONTACTS','CREATE_CONTACTS','EDIT_CONTACTS');

UPDATE users SET role_id = CASE role
  WHEN 'ADMIN' THEN @admin_role
  WHEN 'SUPERVISOR' THEN @supervisor_role
  ELSE @agent_role
END
WHERE role_id IS NULL;

-- Preserve existing assigned extensions in the tenant extension registry.
INSERT IGNORE INTO tenant_extensions (id,tenant_id,extension,user_id,status)
SELECT UUID(), tenant_id, extension, id, 'ASSIGNED'
FROM users
WHERE extension IS NOT NULL AND extension <> '';

-- Preserve existing per-agent DIDs as tenant-owned DIDs.
INSERT IGNORE INTO tenant_dids (id,tenant_id,number,assigned_user_id,status)
SELECT UUID(), tenant_id, caller_id_number, id, 'ASSIGNED'
FROM users
WHERE caller_id_number IS NOT NULL AND caller_id_number <> '';

-- Convert global email uniqueness to tenant-scoped uniqueness.
SET @email_unique_index = (
  SELECT INDEX_NAME
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'email'
    AND NON_UNIQUE = 0
    AND INDEX_NAME NOT IN ('PRIMARY','uq_users_tenant_email')
  ORDER BY SEQ_IN_INDEX
  LIMIT 1
);
SET @drop_email_index_sql = IF(
  @email_unique_index IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE users DROP INDEX `', REPLACE(@email_unique_index,'`',''), '`')
);
PREPARE stmt FROM @drop_email_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tenant_email_index_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='uq_users_tenant_email'
);
SET @tenant_email_sql = IF(
  @tenant_email_index_exists = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_tenant_email (tenant_id,email)',
  'SELECT 1'
);
PREPARE stmt FROM @tenant_email_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users (tenant_id, role_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_extension ON users (tenant_id, extension);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_started ON calls (tenant_id, started_at);
CREATE INDEX IF NOT EXISTS idx_call_events_tenant ON call_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs (tenant_id);

-- A default plan is available for new setups; NULL minute/user limits mean unlimited.
INSERT IGNORE INTO pricing_plans (
  id, code, name, description, price_per_user, max_users, outbound_minutes, inbound_minutes, features_json, active
) VALUES (
  '00000000-0000-4000-8000-000000000201', 'custom-unlimited', 'Custom Unlimited',
  'Default SaaS plan. Super Admin can edit or create additional pricing cards.', 45.00, NULL, NULL, NULL,
  '{"ALL":true}', 1
);
