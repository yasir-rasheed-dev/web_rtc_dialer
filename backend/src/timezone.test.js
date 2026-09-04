import "./_test-env.js";
import test from "node:test";
import assert from "node:assert/strict";

import { isValidTimeZone, tzOffsetMinutes, tzNumericOffset, zonedWallTimeToUtc, addDaysToDateStr } from "./timezone.js";

test("isValidTimeZone accepts IANA zones and rejects junk", () => {
  assert.equal(isValidTimeZone("Asia/Karachi"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone(null), false);
});

test("tzOffsetMinutes returns the fixed offset for a no-DST zone", () => {
  // Karachi is UTC+5 year round.
  assert.equal(tzOffsetMinutes("Asia/Karachi", new Date("2026-01-15T12:00:00Z")), 300);
  assert.equal(tzOffsetMinutes("Asia/Karachi", new Date("2026-07-15T12:00:00Z")), 300);
  assert.equal(tzOffsetMinutes("UTC", new Date()), 0);
});

test("tzOffsetMinutes tracks DST for a zone that observes it", () => {
  // New York: EST (-300) in January, EDT (-240) in July.
  assert.equal(tzOffsetMinutes("America/New_York", new Date("2026-01-15T12:00:00Z")), -300);
  assert.equal(tzOffsetMinutes("America/New_York", new Date("2026-07-15T12:00:00Z")), -240);
});

test("tzNumericOffset formats as +HH:MM / -HH:MM", () => {
  assert.equal(tzNumericOffset("Asia/Karachi", new Date("2026-01-15T12:00:00Z")), "+05:00");
  assert.equal(tzNumericOffset("America/New_York", new Date("2026-07-15T12:00:00Z")), "-04:00");
  assert.equal(tzNumericOffset("Asia/Kolkata", new Date("2026-01-15T12:00:00Z")), "+05:30");
  assert.equal(tzNumericOffset("UTC", new Date()), "+00:00");
});

test("zonedWallTimeToUtc converts a tenant wall-clock day start to UTC", () => {
  // Midnight in Karachi is 19:00 the previous day in UTC.
  assert.equal(zonedWallTimeToUtc("2026-09-03 00:00:00", "Asia/Karachi"), "2026-09-02 19:00:00");
  // Midnight in New York (EDT) is 04:00 UTC.
  assert.equal(zonedWallTimeToUtc("2026-09-03 00:00:00", "America/New_York"), "2026-09-03 04:00:00");
  // UTC is a no-op.
  assert.equal(zonedWallTimeToUtc("2026-09-03 00:00:00", "UTC"), "2026-09-03 00:00:00");
  // A date-only string is treated as that day's 00:00.
  assert.equal(zonedWallTimeToUtc("2026-09-03", "Asia/Karachi"), "2026-09-02 19:00:00");
  // Unknown zone falls back to treating the wall time as UTC.
  assert.equal(zonedWallTimeToUtc("2026-09-03 00:00:00", "Bogus/Zone"), "2026-09-03 00:00:00");
  assert.equal(zonedWallTimeToUtc("not a date", "UTC"), null);
});

test("addDaysToDateStr adds whole days and rolls over months", () => {
  assert.equal(addDaysToDateStr("2026-09-03", 1), "2026-09-04");
  assert.equal(addDaysToDateStr("2026-09-30", 1), "2026-10-01");
  assert.equal(addDaysToDateStr("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysToDateStr("2026-03-01", -1), "2026-02-28");
});
