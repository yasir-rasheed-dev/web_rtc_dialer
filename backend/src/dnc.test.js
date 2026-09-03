import "./_test-env.js";
import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDncNumber } from "./dncRoutes.js";

test("normalizeDncNumber collapses +1 / 1 / bare 10-digit onto one key", () => {
  assert.equal(normalizeDncNumber("+1 (312) 555-0147"), "3125550147");
  assert.equal(normalizeDncNumber("13125550147"), "3125550147");
  assert.equal(normalizeDncNumber("312.555.0147"), "3125550147");
});

test("normalizeDncNumber returns '' for something with no usable digits", () => {
  assert.equal(normalizeDncNumber(""), "");
  assert.equal(normalizeDncNumber("n/a"), "");
  assert.equal(normalizeDncNumber(null), "");
});
