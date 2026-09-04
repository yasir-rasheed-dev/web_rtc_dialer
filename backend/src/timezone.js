// Workspace-timezone helpers. DB DATETIMEs are stored/read as UTC (the
// mysql2 pool is opened with timezone:"Z"). A tenant picks an IANA zone
// (e.g. "Asia/Karachi"); reports, call-log date filters and on-screen
// timestamps are all expected to line up with that zone's wall clock, not
// the server's or the viewer's.
//
// We deliberately do the conversion in Node rather than lean on MySQL's
// CONVERT_TZ with named zones — CONVERT_TZ needs the mysql tz tables
// loaded (mysql_tzinfo_to_sql), which a stock cPanel MariaDB usually
// doesn't have. Intl gives us DST-correct offsets everywhere Node runs.

const OFFSET_CACHE = new Map();

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Minutes `timeZone` is ahead of UTC at the given instant (negative = west
// of UTC). Handles DST because Intl resolves the offset for that instant.
export function tzOffsetMinutes(timeZone, date = new Date()) {
  if (!isValidTimeZone(timeZone)) return 0;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  let hour = Number(p.hour);
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  return Math.round((asUtc - date.getTime()) / 60000) || 0; // normalise -0
}

// "+05:00" / "-04:30" for a zone, at `date` (default now). Suitable for a
// CONVERT_TZ(col,'+00:00',?) with a NUMERIC target — that form needs no tz
// tables. DST is captured only as of `date`, which is fine for a rolling
// dashboard window.
export function tzNumericOffset(timeZone, date = new Date()) {
  const key = `${timeZone}@${Math.floor(date.getTime() / 3600000)}`;
  if (OFFSET_CACHE.has(key)) return OFFSET_CACHE.get(key);
  const mins = tzOffsetMinutes(timeZone, date);
  const sign = mins < 0 ? "-" : "+";
  const abs = Math.abs(mins);
  const out = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  OFFSET_CACHE.set(key, out);
  return out;
}

// "YYYY-MM-DD" (or with a time) that is a WALL-CLOCK time in `timeZone` ->
// the matching "YYYY-MM-DD HH:MM:SS" in UTC, i.e. what to compare a UTC
// column against. Used for call-log / report date-range boundaries so
// "3 Sep" means 3 Sep in the tenant's zone.
export function zonedWallTimeToUtc(wall, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(wall || "").trim());
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const naiveUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (!isValidTimeZone(timeZone)) return new Date(naiveUtc).toISOString().slice(0, 19).replace("T", " ");
  // Treat the wall time as if it were UTC, look up the zone's offset near
  // then, back it out; one correction pass settles DST edges.
  let off = tzOffsetMinutes(timeZone, new Date(naiveUtc));
  let utc = naiveUtc - off * 60000;
  off = tzOffsetMinutes(timeZone, new Date(utc));
  utc = naiveUtc - off * 60000;
  return new Date(utc).toISOString().slice(0, 19).replace("T", " ");
}

// Add whole days to a "YYYY-MM-DD" string, returning the same format. Used
// to turn an inclusive `to` date into an exclusive upper bound.
export function addDaysToDateStr(dateStr, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
  if (!m) return dateStr;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
