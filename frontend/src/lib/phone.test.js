import { describe, expect, it } from "vitest";
import {
  formatDuration,
  isValidDialString,
  makeSipDestination,
  normalizeDialString
} from "./phone";

describe("phone utilities", () => {
  it("normalizes common display formatting", () => {
    expect(normalizeDialString("+1 (555) 010-2200")).toBe("+15550102200");
  });

  it("accepts service codes and rejects an empty target", () => {
    expect(isValidDialString("*123#")).toBe(true);
    expect(isValidDialString(" ")).toBe(false);
  });

  it("builds the Asterisk SIP destination", () => {
    expect(makeSipDestination("+1 555 0100", "asterisk.ringnex.co")).toBe(
      "sip:+15550100@asterisk.ringnex.co"
    );
  });

  it("formats the connected call timer", () => {
    expect(formatDuration(65)).toBe("01:05");
  });
});
