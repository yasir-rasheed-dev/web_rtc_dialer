// Incoming-call ringtone, synthesized via the Web Audio API — no bundled
// audio file to ship/host, and it works identically on the web and inside
// Electron. Classic two-beep-then-pause cadence, repeating until stopped.
//
// Deliberately a single module-level AudioContext (browsers cap how many
// can exist, and creating one per ring would leak) — created lazily on
// first use since AudioContext construction can be blocked until a user
// gesture has happened on strict browsers; Softphone.jsx only ever calls
// startRingtone() well after the agent has interacted with the page
// (registering their SIP line, etc.), so this is expected to just work.

let audioCtx = null;
let ringTimer = null;
let ringing = false;

function getContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function beep(ctx, startAt, freq, durationSec) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = freq;
  oscillator.type = "sine";
  // Quick fade in/out instead of a hard on/off edge — avoids an audible
  // click/pop at the start and end of each beep.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02);
  gain.gain.linearRampToValueAtTime(0.25, startAt + durationSec - 0.03);
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationSec);
}

function playCadence() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  const now = ctx.currentTime;
  // Two quick beeps (like a classic ring-ring), same pattern repeated by
  // the interval below every RING_CYCLE_MS.
  beep(ctx, now, 880, 0.35);
  beep(ctx, now + 0.45, 880, 0.35);
}

const RING_CYCLE_MS = 2000;

export function startRingtone() {
  if (ringing) return;
  ringing = true;
  playCadence();
  ringTimer = window.setInterval(playCadence, RING_CYCLE_MS);
}

export function stopRingtone() {
  ringing = false;
  if (ringTimer) {
    window.clearInterval(ringTimer);
    ringTimer = null;
  }
}
