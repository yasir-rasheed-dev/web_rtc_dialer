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
