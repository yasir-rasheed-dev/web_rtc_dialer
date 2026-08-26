import test from "node:test";
import assert from "node:assert/strict";
import { parseFrame } from "./ami.js";

test("parseFrame converts AMI headers and keeps repeated variables", () => {
  const message = parseFrame(
    "Event: Newchannel\r\nChannel: PJSIP/webdialer01-00000001\r\nVariable: one\r\nVariable: two"
  );
  assert.equal(message.Event, "Newchannel");
  assert.equal(message.Channel, "PJSIP/webdialer01-00000001");
  assert.deepEqual(message.Variable, ["one", "two"]);
});
