// Turns a raw SIP response ("487 Request Terminated") or a browser/WebRTC
// exception message into something an agent can actually act on. Used
// anywhere a dial/transfer/answer failure would otherwise surface the wire
// protocol text straight in a toast.

const BY_CODE = {
  400: "That number isn't valid. Check it and try again.",
  401: "Your SIP account couldn't be verified. Contact your admin.",
  403: "You don't have permission to call this number.",
  404: "That number couldn't be reached. Check it and try again.",
  405: "That number can't be dialled from this line.",
  408: "No answer — the call timed out.",
  410: "That number is no longer in service.",
  480: "The person you're calling is unavailable right now.",
  484: "That number looks incomplete. Check it and try again.",
  486: "The line is busy.",
  487: "The call ended before it connected.",
  488: "The call couldn't be set up (a network/audio issue). Try again.",
  500: "Something went wrong on the call server. Please try again.",
  502: "The call couldn't be routed. Please try again.",
  503: "Calling is temporarily unavailable. Please try again shortly.",
  504: "The call timed out reaching the carrier. Please try again.",
  600: "The line is busy everywhere.",
  603: "The call was declined."
};

// Common WebRTC/browser exceptions that leak through as callError.message —
// map the recognizable ones, let anything else fall through to the fallback
// rather than showing a stack-trace-flavoured string.
const BY_SUBSTRING = [
  [/notallowederror|permission denied/i, "Microphone access is blocked. Allow it in your browser and try again."],
  [/notfounderror|no microphone|requested device not found/i, "No microphone was found. Check your audio device."],
  [/notreadableerror/i, "The microphone is in use by another app. Close it and try again."],
  [/networkerror|ice failed|ice connection/i, "A network issue interrupted the call. Please try again."]
];

/** `reason` is either "487 Request Terminated" (from sip.js's response
 *  delegates) or a plain Error message. Always returns agent-readable text. */
export function friendlyCallError(reason, fallback = "The call couldn't be completed. Please try again.") {
  const text = String(reason || "").trim();
  if (!text) return fallback;

  const code = Number(text.match(/^\d{3}\b/)?.[0]);
  if (code && BY_CODE[code]) return BY_CODE[code];

  for (const [pattern, message] of BY_SUBSTRING) {
    if (pattern.test(text)) return message;
  }

  // Still looks like raw SIP/protocol text (a 3-digit code we don't have a
  // mapping for, or an all-caps exception name) — don't show it as-is.
  if (code || /error$/i.test(text.replace(/\s/g, ""))) return fallback;

  // Otherwise it's already a normal sentence (e.g. our own thrown
  // messages) — safe to show directly.
  return text;
}
