-- Adds ON_CALL to users.status — set automatically by callTracker.js the
-- moment an agent is actually bridged to a call (inbound or outbound) and
-- reverted to READY when that call ends (see applyAgentStatus in
-- server.js, wired into CallTracker's constructor). Not a value agents
-- (or the POST /api/agent/status endpoint) can set themselves — that
-- route still only accepts READY/PAUSED/WRAP_UP/OFFLINE.
ALTER TABLE users
  MODIFY status ENUM('READY','PAUSED','WRAP_UP','OFFLINE','ON_CALL') NOT NULL DEFAULT 'OFFLINE';
