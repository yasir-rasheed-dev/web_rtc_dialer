import { db } from "./db.js";

export const TEAM_PRIVILEGES = Object.freeze([
  { key: "VIEW_TEAM_MEMBERS", name: "View team members", category: "Members" },
  { key: "ADD_TEAM_MEMBERS", name: "Add team members", category: "Members" },
  { key: "REMOVE_TEAM_MEMBERS", name: "Remove team members", category: "Members" },
  { key: "EDIT_TEAM_SETTINGS", name: "Edit team settings", category: "Team Settings" },
  { key: "VIEW_TEAM_LIVE_CALLS", name: "View team live calls", category: "Call Visibility" },
  { key: "VIEW_TEAM_CALL_LOGS", name: "View team call logs", category: "Call Visibility" },
  { key: "VIEW_TEAM_RECORDINGS", name: "View team recordings", category: "Call Visibility" },
  { key: "VIEW_TEAM_VOICEMAILS", name: "View team voicemails", category: "Call Visibility" },
  { key: "VIEW_TEAM_REPORTS", name: "View team reports", category: "Call Visibility" },
  { key: "MONITOR_TEAM_CALLS", name: "Monitor team calls", category: "Monitoring" },
  { key: "LISTEN_TEAM_CALLS", name: "Listen to team calls", category: "Monitoring" },
  { key: "WHISPER_TEAM_CALLS", name: "Whisper on team calls", category: "Monitoring" },
  { key: "BARGE_TEAM_CALLS", name: "Barge into team calls", category: "Monitoring" }
]);

export const DEFAULT_TEAM_PRIVILEGES = Object.freeze({
  VIEW_TEAM_MEMBERS: true,
  ADD_TEAM_MEMBERS: false,
  REMOVE_TEAM_MEMBERS: false,
  EDIT_TEAM_SETTINGS: false,
  VIEW_TEAM_LIVE_CALLS: true,
  VIEW_TEAM_CALL_LOGS: true,
  VIEW_TEAM_RECORDINGS: true,
  VIEW_TEAM_VOICEMAILS: true,
  VIEW_TEAM_REPORTS: true,
  MONITOR_TEAM_CALLS: false,
  LISTEN_TEAM_CALLS: false,
  WHISPER_TEAM_CALLS: false,
  BARGE_TEAM_CALLS: false
});

export function parseTeamPrivileges(value) {
  let parsed = {};
  if (value && typeof value === "object") parsed = value;
  else if (value) {
    try { parsed = JSON.parse(value); } catch { parsed = {}; }
  }

  return Object.fromEntries(
    TEAM_PRIVILEGES.map(({ key }) => [
      key,
      Object.prototype.hasOwnProperty.call(parsed, key)
        ? Boolean(parsed[key])
        : Boolean(DEFAULT_TEAM_PRIVILEGES[key])
    ])
  );
}

export function normalizeTeamPrivileges(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    TEAM_PRIVILEGES.map(({ key }) => [key, Boolean(input[key])])
  );
}

export async function supervisorTeams(userId, tenantId) {
  const [rows] = await db.execute(
    `SELECT t.id,t.tenant_id,t.name,t.description,t.active,
            ts.supervisor_user_id,ts.privileges_json
       FROM team_supervisors ts
       JOIN teams t ON t.id=ts.team_id AND t.tenant_id=ts.tenant_id
      WHERE ts.supervisor_user_id=? AND ts.tenant_id=? AND t.active=1
      ORDER BY t.name ASC`,
    [userId, tenantId]
  );
  return rows.map((row) => ({ ...row, privileges: parseTeamPrivileges(row.privileges_json) }));
}

export async function supervisorTeamIdsForPrivilege(userId, tenantId, privilege) {
  const teams = await supervisorTeams(userId, tenantId);
  return teams
    .filter((team) => !privilege || team.privileges?.[privilege] === true)
    .map((team) => team.id);
}

export async function supervisorAgentIdsForPrivilege(userId, tenantId, privilege) {
  const teamIds = await supervisorTeamIdsForPrivilege(userId, tenantId, privilege);
  if (!teamIds.length) return [];
  const [rows] = await db.query(
    `SELECT DISTINCT tm.user_id
       FROM team_members tm
       JOIN teams t ON t.id=tm.team_id AND t.tenant_id=tm.tenant_id
      WHERE tm.tenant_id=? AND tm.active=1 AND t.active=1
        AND tm.team_id IN (${teamIds.map(() => "?").join(",")})`,
    [tenantId, ...teamIds]
  );
  return rows.map((row) => row.user_id);
}

export async function supervisorSipUsernamesForPrivilege(userId, tenantId, privilege) {
  const agentIds = await supervisorAgentIdsForPrivilege(userId, tenantId, privilege);
  if (!agentIds.length) return [];
  const [rows] = await db.query(
    `SELECT sip_username FROM users
      WHERE tenant_id=? AND id IN (${agentIds.map(() => "?").join(",")})
        AND sip_username IS NOT NULL`,
    [tenantId, ...agentIds]
  );
  return rows.map((row) => row.sip_username);
}

export async function supervisorTeamAccess(userId, tenantId, teamId) {
  const [rows] = await db.execute(
    `SELECT t.id,t.tenant_id,t.name,t.active,ts.privileges_json
       FROM teams t
       JOIN team_supervisors ts ON ts.team_id=t.id AND ts.tenant_id=t.tenant_id
      WHERE t.id=? AND t.tenant_id=? AND ts.supervisor_user_id=? LIMIT 1`,
    [teamId, tenantId, userId]
  );
  if (!rows[0]) return null;
  return { ...rows[0], privileges: parseTeamPrivileges(rows[0].privileges_json) };
}
