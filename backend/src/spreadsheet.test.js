import "./_test-env.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readSheetRows, writeSheetBuffer, MAX_SHEET_ROWS } from "./spreadsheet.js";

function tmp(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rnx-ss-")), name);
}

test("writeSheetBuffer -> readSheetRows round-trips as [{header: value}]", async () => {
  const buf = await writeSheetBuffer(
    "T",
    ["Phone", "Name", "Reason"],
    [["+13125550147", "Jo", "test"], ["4155550182", "", "dup"]]
  );
  const file = tmp("out.xlsx");
  fs.writeFileSync(file, buf);
  const rows = await readSheetRows(file);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Phone, "+13125550147");
  assert.equal(rows[0].Name, "Jo");
  assert.equal(rows[1].Reason, "dup");
});

test("readSheetRows parses a .csv by header", async () => {
  const file = tmp("in.csv");
  fs.writeFileSync(file, "Phone,Reason\n5551234567,manual\n999,x\n");
  const rows = await readSheetRows(file);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Reason, "manual");
  assert.equal(rows[1].Phone, "999");
});

test("readSheetRows returns [] for a header-only sheet", async () => {
  const file = tmp("empty.csv");
  fs.writeFileSync(file, "Phone,Reason\n");
  assert.deepEqual(await readSheetRows(file), []);
});

test("MAX_SHEET_ROWS cap is a sane positive number", () => {
  assert.ok(Number.isInteger(MAX_SHEET_ROWS) && MAX_SHEET_ROWS > 0);
});
