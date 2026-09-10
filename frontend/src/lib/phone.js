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

// --- display formatting (never for dialing — use formatForDialing) ---

// Splits a number into an optional country code + a 10-digit NANP local
// part, when it looks like one. Returns null otherwise.
function nanpParts(raw) {
  const s = String(raw ?? "").trim();
  if (!s || /[*#]/.test(s)) return null;
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return { cc: "", local: digits, plus };
  if (digits.length === 11 && digits[0] === "1") return { cc: "1", local: digits.slice(1), plus: true };
  if (plus && digits.length > 11) return { cc: digits.slice(0, digits.length - 10), local: digits.slice(-10), plus: true };
  return null;
}

// "(555) 123-4567", or "+1 (555) 123-4567" when a country code is present.
// Anything that isn't a clean NANP number is returned as-is.
export function formatPhoneDisplay(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const p = nanpParts(s);
  if (!p) {
    // international with a +: group as "+CC 000 000 0000"
    if (s.startsWith("+")) {
      const d = s.replace(/\D/g, "");
      if (d.length > 7) {
        const cc = d.slice(0, d.length - 10 > 0 ? d.length - 10 : d.length > 11 ? 3 : 2);
        const rest = d.slice(cc.length).replace(/(\d{3,4})(?=\d)/g, "$1 ").trim();
        return `+${cc} ${rest}`.trim();
      }
    }
    return s;
  }
  const local = `(${p.local.slice(0, 3)}) ${p.local.slice(3, 6)}-${p.local.slice(6)}`;
  return p.cc ? `+${p.cc} ${local}` : p.plus ? `+1 ${local}` : local;
}

// Progressive formatting for the dialer input, as the agent types. Falls
// back to the raw string for service codes (*, #) and short/internal
// numbers. `dialNumber` state stays raw — this is display only.
export function formatDialInput(raw) {
  const s = String(raw ?? "");
  if (!s || /[*#]/.test(s)) return s;
  const plus = s.startsWith("+");
  let d = s.replace(/\D/g, "");
  let cc = "";
  if (plus && d.length > 10) {
    cc = d.slice(0, d.length - 10);
    d = d.slice(-10);
  } else if ((plus || d.length === 11) && d[0] === "1" && d.length >= 11) {
    cc = "1";
    d = d.slice(1);
  }
  const prefix = cc ? `+${cc} ` : plus ? "+" : "";
  if (d.length <= 3) return `${prefix}${d}`;
  if (d.length <= 6) return `${prefix}(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `${prefix}(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
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
