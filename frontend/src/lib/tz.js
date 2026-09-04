// Workspace timezone — set once from session.tenant.timezone at login and
// read by every date formatter so timestamps, reports and clocks all show
// the workspace's wall clock rather than each viewer's local one. Kept as
// a module singleton (not context) so the plain formatDate() helpers that
// are imported all over the app don't each need a hook.

let workspaceTz = null;

export function isValidTz(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function setWorkspaceTz(tz) {
  workspaceTz = isValidTz(tz) ? tz : null;
}

// Falls back to the viewer's own zone until a valid workspace zone is set.
export function getWorkspaceTz() {
  return workspaceTz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

// Format an instant (ISO string / Date / epoch ms) in the workspace zone.
export function formatInWorkspaceTz(value, options = { dateStyle: "medium", timeStyle: "short" }) {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone: getWorkspaceTz() }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

// Current UTC offset of `tz`, as "UTC+05:00" / "UTC−04:30" (real minus sign
// U+2212 for display). Used to annotate the timezone picker.
export function tzOffsetLabel(tz, at = new Date()) {
  if (!isValidTz(tz)) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(at);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    let hour = Number(p.hour);
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
    const mins = Math.round((asUtc - at.getTime()) / 60000);
    const sign = mins < 0 ? "−" : "+";
    const abs = Math.abs(mins);
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

// A conservative worldwide fallback for engines without
// Intl.supportedValuesOf (older Safari). Covers every current UTC offset.
const FALLBACK_TZS = [
  "Pacific/Midway", "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver",
  "America/Chicago", "America/New_York", "America/Halifax", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
  "Atlantic/Azores", "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Athens", "Europe/Moscow",
  "Africa/Cairo", "Africa/Nairobi", "Asia/Jerusalem", "Asia/Riyadh", "Asia/Tehran", "Asia/Dubai", "Asia/Karachi",
  "Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Bangkok", "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Perth", "Australia/Adelaide", "Australia/Sydney", "Pacific/Auckland", "Pacific/Tongatapu"
];

let cachedZones = null;
export function listTimeZones() {
  if (cachedZones) return cachedZones;
  let zones;
  try {
    zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : null;
  } catch {
    zones = null;
  }
  if (!zones || !zones.length) zones = FALLBACK_TZS;
  if (!zones.includes("UTC")) zones = ["UTC", ...zones];
  cachedZones = zones;
  return zones;
}

// [{ value, label }] for the Select, sorted by actual offset then name so
// the list reads west-to-east. Labels look like "Asia/Karachi  (UTC+05:00)".
let cachedOptions = null;
export function timeZoneOptions() {
  if (cachedOptions) return cachedOptions;
  const now = new Date();
  cachedOptions = listTimeZones()
    .map((tz) => {
      const offLabel = tzOffsetLabel(tz, now);
      const offMin = (() => {
        const m = /UTC([+−-])(\d{2}):(\d{2})/.exec(offLabel);
        if (!m) return 0;
        const sign = m[1] === "+" ? 1 : -1;
        return sign * (Number(m[2]) * 60 + Number(m[3]));
      })();
      return { value: tz, label: `${tz.replace(/_/g, " ")}  (${offLabel})`, offMin };
    })
    .sort((a, b) => a.offMin - b.offMin || a.value.localeCompare(b.value))
    .map(({ value, label }) => ({ value, label }));
  return cachedOptions;
}
