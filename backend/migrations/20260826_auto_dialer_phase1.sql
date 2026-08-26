-- Ringnex Auto Dialer Phase 1
-- Campaign Management + Contact Upload + Assignment + Reporting

SET NAMES utf8mb4;
SET collation_connection = 'utf8mb4_unicode_ci';


-- =========================================
-- CAMPAIGNS
-- =========================================

CREATE TABLE IF NOT EXISTS campaigns (

    id CHAR(36) NOT NULL PRIMARY KEY,

    tenant_id CHAR(36) NOT NULL,

    name VARCHAR(160) NOT NULL,
    description VARCHAR(500) NULL,

    mode ENUM(
        'PREVIEW',
        'CLICK_TO_CALL'
    ) NOT NULL DEFAULT 'CLICK_TO_CALL',

    status ENUM(
        'DRAFT',
        'ACTIVE',
        'PAUSED',
        'COMPLETED'
    ) NOT NULL DEFAULT 'DRAFT',

    start_date DATE NULL,
    end_date DATE NULL,

    timezone VARCHAR(64)
        DEFAULT 'UTC',

    max_attempts INT
        DEFAULT 3,

    retry_delay_minutes INT
        DEFAULT 30,


    created_by_user_id CHAR(36) NULL,

    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,


    KEY idx_campaign_tenant (
        tenant_id
    ),

    KEY idx_campaign_status (
        tenant_id,
        status
    )

)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;



-- =========================================
-- CAMPAIGN AGENTS
-- =========================================


CREATE TABLE IF NOT EXISTS campaign_agents (

    id CHAR(36) NOT NULL PRIMARY KEY,

    tenant_id CHAR(36) NOT NULL,

    campaign_id CHAR(36) NOT NULL,

    user_id CHAR(36) NOT NULL,


    assignment_type ENUM(
        'ROUND_ROBIN',
        'EQUAL',
        'MANUAL'
    )
    DEFAULT 'ROUND_ROBIN',


    assigned_count INT
        DEFAULT 0,


    active TINYINT(1)
        DEFAULT 1,


    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,


    UNIQUE KEY uq_campaign_agent (
        campaign_id,
        user_id
    ),


    KEY idx_campaign_agents (
        campaign_id
    )

)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;



-- =========================================
-- CAMPAIGN CONTACTS
-- =========================================


CREATE TABLE IF NOT EXISTS campaign_contacts (

    id CHAR(36) NOT NULL PRIMARY KEY,


    tenant_id CHAR(36) NOT NULL,

    campaign_id CHAR(36) NOT NULL,


    name VARCHAR(160) NULL,

    phone VARCHAR(32) NOT NULL,

    email VARCHAR(190) NULL,

    company VARCHAR(160) NULL,


    assigned_agent_id CHAR(36) NULL,


    status ENUM(
        'NEW',
        'ASSIGNED',
        'READY',
        'CALLING',
        'CONNECTED',
        'NO_ANSWER',
        'BUSY',
        'FAILED',
        'CALLBACK',
        'COMPLETED',
        'DNC'
    )
    DEFAULT 'NEW',


    attempt_count INT
        DEFAULT 0,


    last_called_at DATETIME NULL,

    next_attempt_at DATETIME NULL,


    disposition VARCHAR(100) NULL,

    notes TEXT NULL,


    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,


    KEY idx_campaign_contacts (
        campaign_id,
        status
    ),


    KEY idx_contact_agent (
        assigned_agent_id,
        status
    )

)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;



-- =========================================
-- CAMPAIGN CALLS
-- =========================================


CREATE TABLE IF NOT EXISTS campaign_calls (

    id CHAR(36) NOT NULL PRIMARY KEY,


    tenant_id CHAR(36) NOT NULL,

    campaign_id CHAR(36) NOT NULL,

    contact_id CHAR(36) NOT NULL,

    agent_id CHAR(36) NOT NULL,


    call_id VARCHAR(190) NULL,


    status ENUM(
        'DIALING',
        'CONNECTED',
        'NO_ANSWER',
        'BUSY',
        'FAILED'
    )
    DEFAULT 'DIALING',


    duration INT
        DEFAULT 0,


    disposition VARCHAR(100) NULL,


    started_at DATETIME NULL,

    ended_at DATETIME NULL,


    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,


    KEY idx_campaign_calls (
        campaign_id
    ),

    KEY idx_agent_calls (
        agent_id
    )

)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;



-- =========================================
-- DISPOSITIONS
-- =========================================


CREATE TABLE IF NOT EXISTS campaign_dispositions (

    id CHAR(36) NOT NULL PRIMARY KEY,

    tenant_id CHAR(36) NOT NULL,


    name VARCHAR(100) NOT NULL,

    active TINYINT(1)
        DEFAULT 1,


    created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,


    UNIQUE KEY uq_disposition (
        tenant_id,
        name
    )

)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;



-- =========================================
-- AUTO DIALER PERMISSIONS
-- =========================================


INSERT IGNORE INTO permissions
(
id,
permission_key,
name,
category
)
VALUES

(UUID(),
'VIEW_CAMPAIGNS',
'View Campaigns',
'Auto Dialer'),


(UUID(),
'CREATE_CAMPAIGNS',
'Create Campaigns',
'Auto Dialer'),


(UUID(),
'MANAGE_CAMPAIGNS',
'Manage Campaigns',
'Auto Dialer'),


(UUID(),
'UPLOAD_CONTACTS',
'Upload Contacts',
'Auto Dialer'),


(UUID(),
'ASSIGN_CONTACTS',
'Assign Contacts',
'Auto Dialer'),


(UUID(),
'USE_AUTO_DIALER',
'Use Auto Dialer',
'Auto Dialer'),


(UUID(),
'SKIP_CONTACT',
'Skip Contact',
'Auto Dialer'),


(UUID(),
'VIEW_CAMPAIGN_REPORTS',
'View Campaign Reports',
'Auto Dialer'),


(UUID(),
'EXPORT_CAMPAIGN_REPORTS',
'Export Campaign Reports',
'Auto Dialer');
