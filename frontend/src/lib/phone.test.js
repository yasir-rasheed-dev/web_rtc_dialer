import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatForDialing,
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

  it("adds a 1 prefix to a bare 10-digit US number before dialing", () => {
    expect(formatForDialing("7127307170")).toBe("17127307170");
  });

  it("leaves an 11-digit number that already has the 1 prefix as bare digits", () => {
    expect(formatForDialing("17127307170")).toBe("17127307170");
  });

  it("strips the + from an E.164 number — the dialplan's _X. pattern only matches strings starting with a digit", () => {
    expect(formatForDialing("+17127307170")).toBe("17127307170");
  });

  it("leaves a short internal extension untouched", () => {
    expect(formatForDialing("1002")).toBe("1002");
  });

  it("leaves DTMF/service codes untouched", () => {
    expect(formatForDialing("*123#")).toBe("*123#");
  });
});
