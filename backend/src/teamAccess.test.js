import "./_test-env.js";
import test from "node:test";
import assert from "node:assert/strict";

import {
  TEAM_PRIVILEGES,
  DEFAULT_TEAM_PRIVILEGES,
  parseTeamPrivileges,
  normalizeTeamPrivileges
} from "./teamAccess.js";

test("the Monitoring privileges exist in the catalogue", () => {
  const keys = TEAM_PRIVILEGES.map((p) => p.key);
  for (const k of ["MONITOR_TEAM_CALLS", "LISTEN_TEAM_CALLS", "WHISPER_TEAM_CALLS", "BARGE_TEAM_CALLS"]) {
    assert.ok(keys.includes(k), `${k} missing from TEAM_PRIVILEGES`);
  }
});

test("monitoring privileges default to OFF", () => {
  for (const k of ["MONITOR_TEAM_CALLS", "LISTEN_TEAM_CALLS", "WHISPER_TEAM_CALLS", "BARGE_TEAM_CALLS"]) {
    assert.equal(DEFAULT_TEAM_PRIVILEGES[k], false);
  }
});

test("parseTeamPrivileges fills every key, honouring explicit values", () => {
  const parsed = parseTeamPrivileges('{"LISTEN_TEAM_CALLS":true}');
  assert.equal(parsed.LISTEN_TEAM_CALLS, true);
  assert.equal(parsed.BARGE_TEAM_CALLS, false); // default
  assert.equal(parsed.VIEW_TEAM_MEMBERS, true); // default true
  assert.equal(Object.keys(parsed).length, TEAM_PRIVILEGES.length);
});

test("parseTeamPrivileges accepts an object or bad json", () => {
  assert.equal(parseTeamPrivileges({ MONITOR_TEAM_CALLS: true }).MONITOR_TEAM_CALLS, true);
  assert.equal(parseTeamPrivileges("garbage").MONITOR_TEAM_CALLS, false);
});

test("normalizeTeamPrivileges coerces to a full boolean map", () => {
  const n = normalizeTeamPrivileges({ LISTEN_TEAM_CALLS: 1, NONSENSE: true });
  assert.equal(n.LISTEN_TEAM_CALLS, true);
  assert.equal(n.MONITOR_TEAM_CALLS, false);
  assert.equal("NONSENSE" in n, false);
  assert.equal(Object.keys(n).length, TEAM_PRIVILEGES.length);
});
