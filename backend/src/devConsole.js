// In-memory feeds for the Super Admin "Developer" dashboard.
//
//  - Application log: a ring buffer that captures everything written to
//    console.* (which is also still forwarded to real stdout, so pm2 logs
//    are unaffected). No file access needed.
//  - Asterisk feed: a ring buffer of recent AMI events (name + a few key
//    fields), fed from the existing ami.on("event") in server.js.
//
// Both are polled over REST with an `after` sequence cursor rather than
// streamed, so nothing touches the socket auth path.

const LOG_MAX = 1000;
const AMI_MAX = 600;

const logBuf = [];
const amiBuf = [];
let logSeq = 0;
let amiSeq = 0;

function fmtArg(a) {
  if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

export function pushLog(level, message) {
  logSeq += 1;
  logBuf.push({ seq: logSeq, t: Date.now(), level, message: String(message).slice(0, 6000) });
  if (logBuf.length > LOG_MAX) logBuf.shift();
}

export function readLogs(after = 0, limit = 500) {
  const from = Number(after) || 0;
  const out = from ? logBuf.filter((l) => l.seq > from) : logBuf.slice(-limit);
  return { lines: out.slice(-limit), cursor: logSeq };
}

// Fields worth showing per AMI event without dumping everything.
const AMI_FIELDS = [
  "Channel",
  "ChannelStateDesc",
  "CallerIDNum",
  "ConnectedLineNum",
  "Exten",
  "Context",
  "Uniqueid",
  "Linkedid",
  "Cause",
  "Cause-txt",
  "Response",
  "Message"
];

export function pushAmiEvent(event) {
  if (!event || !event.Event) return;
  amiSeq += 1;
  const detail = {};
  for (const key of AMI_FIELDS) {
    if (event[key] !== undefined) detail[key] = String(event[key]).slice(0, 300);
  }
  amiBuf.push({ seq: amiSeq, t: Date.now(), name: event.Event, detail });
  if (amiBuf.length > AMI_MAX) amiBuf.shift();
}

export function readAmiEvents(after = 0, limit = 400) {
  const from = Number(after) || 0;
  const out = from ? amiBuf.filter((e) => e.seq > from) : amiBuf.slice(-limit);
  return { events: out.slice(-limit), cursor: amiSeq };
}

let captured = false;
export function installConsoleCapture() {
  if (captured) return;
  captured = true;
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    if (typeof console[level] !== "function") continue;
    const original = console[level].bind(console);
    console[level] = (...args) => {
      try {
        pushLog(level === "log" ? "info" : level, args.map(fmtArg).join(" "));
      } catch {
        /* never let logging break the app */
      }
      original(...args);
    };
  }
}
