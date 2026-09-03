import "./_test-env.js";
import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeWorkspace,
  tenantSipKey,
  parseJson,
  tenantFeatureEnabled,
  hasPermission,
  requirePermission
} from "./saas.js";

test("normalizeWorkspace slugifies, lowercases and collapses separators", () => {
  assert.equal(normalizeWorkspace("  Acme Corp!! "), "acme-corp");
  assert.equal(normalizeWorkspace("a__b--c"), "a-b-c");
  assert.equal(normalizeWorkspace("-leading-and-trailing-"), "leading-and-trailing");
  assert.equal(normalizeWorkspace("x".repeat(200)).length, 80);
});

test("tenantSipKey strips non-alphanumerics and caps at 10 lowercase chars", () => {
  assert.equal(tenantSipKey("efa43bcf-0a7d-464c-9a3e"), "efa43bcf0a");
  assert.equal(tenantSipKey("ABC-123"), "abc123");
});

test("parseJson tolerates objects, bad json and nullish", () => {
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJson({ a: 1 }), { a: 1 });
  assert.deepEqual(parseJson("not json", { fallback: true }), { fallback: true });
  assert.deepEqual(parseJson(null, []), []);
});

test("tenantFeatureEnabled: ALL wins, explicit false blocks, default is on", () => {
  assert.equal(tenantFeatureEnabled({ features_json: '{"ALL":true}' }, "ANYTHING"), true);
  assert.equal(tenantFeatureEnabled({ features_json: '{"CAN_X":false}' }, "CAN_X"), false);
  assert.equal(tenantFeatureEnabled({ features_json: "{}" }, "CAN_X"), true);
  assert.equal(tenantFeatureEnabled({}, "CAN_X"), true);
});

test("hasPermission checks the user's permission array", () => {
  assert.equal(hasPermission({ permissions: ["VIEW_REPORTS"] }, "VIEW_REPORTS"), true);
  assert.equal(hasPermission({ permissions: ["VIEW_REPORTS"] }, "MANAGE_AGENTS"), false);
  assert.equal(hasPermission({}, "X"), false);
});

test("requirePermission middleware 403s without any of the listed permissions", () => {
  const mw = requirePermission("A", "B");
  let status; let body; let nexted = false;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };

  mw({ user: { permissions: ["C"] } }, res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(status, 403);
  assert.match(body.error, /permission/i);

  nexted = false;
  mw({ user: { permissions: ["B"] } }, res, () => { nexted = true; });
  assert.equal(nexted, true);
});
