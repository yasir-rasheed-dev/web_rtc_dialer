import "./_test-env.js";
import test from "node:test";
import assert from "node:assert/strict";

import {
  encryptSecret,
  decryptSecret,
  hashRefreshToken,
  createRefreshTokenValue,
  signToken,
  verifyToken,
  signSuperAdminToken,
  hashPassword,
  verifyPassword
} from "./security.js";

test("encryptSecret / decryptSecret round-trips and is non-deterministic", () => {
  const plain = "s3cr3t-sip-password";
  const a = encryptSecret(plain);
  const b = encryptSecret(plain);
  assert.notEqual(a, b, "each encryption uses a fresh IV");
  assert.equal(decryptSecret(a), plain);
  assert.equal(decryptSecret(b), plain);
});

test("decryptSecret rejects a tampered payload", () => {
  const token = encryptSecret("hello");
  const parts = token.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptSecret(parts.join(".")));
});

test("decryptSecret returns empty string for falsy input", () => {
  assert.equal(decryptSecret(""), "");
  assert.equal(decryptSecret(null), "");
});

test("hashRefreshToken is deterministic; token values are unique", () => {
  const v = createRefreshTokenValue();
  assert.equal(hashRefreshToken(v), hashRefreshToken(v));
  assert.notEqual(createRefreshTokenValue(), createRefreshTokenValue());
  assert.equal(hashRefreshToken(v).length, 64); // sha256 hex
});

test("signToken carries sub/tenantId/sid and verifies", () => {
  const token = signToken({ id: "u1", tenant_id: "t1", role_id: "r1", name: "A", current_session_id: "sid1" });
  const claims = verifyToken(token);
  assert.equal(claims.sub, "u1");
  assert.equal(claims.tenantId, "t1");
  assert.equal(claims.sid, "sid1");
  assert.equal(claims.scope, "tenant");
});

test("signSuperAdminToken is super-admin scoped and carries sid", () => {
  const claims = verifyToken(signSuperAdminToken({ id: "sa1", name: "Root", current_session_id: "sid9" }));
  assert.equal(claims.scope, "super-admin");
  assert.equal(claims.sub, "sa1");
  assert.equal(claims.sid, "sid9");
});

test("verifyToken rejects a token signed with a different secret", () => {
  // tamper the middle segment
  const t = signToken({ id: "u1", tenant_id: "t1" });
  const segs = t.split(".");
  segs[1] = Buffer.from(JSON.stringify({ sub: "attacker", scope: "tenant" })).toString("base64url");
  assert.throws(() => verifyToken(segs.join(".")));
});

test("hashPassword enforces a 12-char minimum and verifies", async () => {
  assert.throws(() => hashPassword("short"), /at least 12/);
  const hash = await hashPassword("a-long-enough-password");
  assert.equal(await verifyPassword("a-long-enough-password", hash), true);
  assert.equal(await verifyPassword("wrong-password-value", hash), false);
});
