export function normalizeDialString(value) {
  const raw = String(value ?? "").trim();
  const normalized = raw.replace(/[\s().-]/g, "");
  const plus = normalized.startsWith("+") ? "+" : "";
  const body = normalized.replace(/^\+/, "").replace(/[^0-9*#]/g, "");
  return `${plus}${body}`.slice(0, 32);
}

export function isValidDialString(value) {
  return /^\+?[0-9*#]{2,32}$/.test(normalizeDialString(value));
}

// Normalizes a PSTN-bound number to bare digits (1XXXXXXXXXX, no leading
// "+") before it's handed to the carrier. This must match what the
// Asterisk dialplan's from-webrtc-saas context actually accepts: its only
// extension pattern is `_X.`, which requires the dialed string to *start
// with a digit* — a leading "+" never matches at all and the call is
// rejected before it even reaches the Commio trunk (confirmed live via
// `dialplan show from-webrtc-saas` after a real "extension not found"
// failure). Internal extensions and DTMF/service codes (short numbers,
// *xx#) are left untouched since they never leave the PBX and aren't
// NANP-shaped.
export function formatForDialing(value) {
  const normalized = normalizeDialString(value);
  if (!normalized || normalized.startsWith("*") || normalized.startsWith("#")) {
    return normalized;
  }
  const digitsOnly = normalized.replace(/[^0-9]/g, "");
  if (digitsOnly.length === 10) return `1${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return digitsOnly;
  // Not a recognizable NANP shape (e.g. an international number) — still
  // strip a leading "+" if present, since that alone is enough to fail the
  // dialplan match regardless of length.
  return normalized.startsWith("+") ? digitsOnly || normalized : normalized;
}

export function makeSipDestination(value, domain) {
  const number = normalizeDialString(value);
  if (!isValidDialString(number)) {
    throw new Error("Enter a valid phone number before calling.");
  }
  return `sip:${number}@${domain}`;
}

export function formatDuration(totalSeconds = 0) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function initials(value) {
  const cleaned = String(value ?? "").replace(/[^a-zA-Z0-9]/g, "");
  return (cleaned.slice(-2) || "RN").toUpperCase();
}
