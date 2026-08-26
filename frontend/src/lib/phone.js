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

// Normalizes a PSTN-bound number to E.164 (+1XXXXXXXXXX) before it's handed
// to the carrier — Commio expects that shape. Internal extensions and DTMF/
// service codes (short numbers, *xx#) are left untouched since they never
// leave the PBX, and anything already carrying a country code (leading "+",
// or 11 digits starting with "1") is assumed correct as typed.
export function formatForDialing(value) {
  const normalized = normalizeDialString(value);
  if (!normalized || normalized.startsWith("+") || normalized.startsWith("*") || normalized.startsWith("#")) {
    return normalized;
  }
  const digitsOnly = normalized.replace(/[^0-9]/g, "");
  if (digitsOnly.length === normalized.length) {
    if (digitsOnly.length === 10) return `+1${digitsOnly}`;
    if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return `+${digitsOnly}`;
  }
  return normalized;
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
