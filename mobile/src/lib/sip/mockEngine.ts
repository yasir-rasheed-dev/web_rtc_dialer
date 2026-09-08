import { CallEngine, CallSnapshot, IDLE, Party, Registration, SipConfig } from "./types";

// Simulated call engine — no native modules, runs in Expo Go. Lets the
// whole call UI (dialer → dialing → ringing → active → controls →
// incoming ring → answer/decline) be built and demoed before the real
// react-native-webrtc engine is wired on a dev build.
export function createMockEngine(): CallEngine {
  let snap: CallSnapshot = { ...IDLE };
  let reg: Registration = "offline";
  const callSubs = new Set<(s: CallSnapshot) => void>();
  const regSubs = new Set<(r: Registration) => void>();
  const timers: ReturnType<typeof setTimeout>[] = [];

  const emit = () => {
    const s = { ...snap };
    callSubs.forEach((cb) => cb(s));
  };
  const emitReg = () => regSubs.forEach((cb) => cb(reg));
  const set = (patch: Partial<CallSnapshot>) => {
    snap = { ...snap, ...patch };
    emit();
  };
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => {
    while (timers.length) clearTimeout(timers.pop()!);
  };
  const reset = () => {
    clearTimers();
    later(1200, () => {
      snap = { ...IDLE };
      emit();
    });
  };

  return {
    isReal: false,

    connect(_cfg: SipConfig) {
      reg = "connecting";
      emitReg();
      later(700, () => {
        reg = "registered";
        emitReg();
      });
    },
    disconnect() {
      clearTimers();
      reg = "offline";
      emitReg();
      snap = { ...IDLE };
      emit();
    },

    onCall(cb) {
      callSubs.add(cb);
      return () => callSubs.delete(cb);
    },
    onRegistration(cb) {
      regSubs.add(cb);
      return () => regSubs.delete(cb);
    },
    getSnapshot: () => snap,
    getRegistration: () => reg,

    startCall(number, name) {
      clearTimers();
      set({ status: "dialing", direction: "out", party: { number, name: name || number }, endedReason: null });
      later(1400, () => {
        if (snap.status === "dialing") set({ status: "ringing" });
      });
      later(3600, () => {
        if (snap.status === "ringing") set({ status: "active", connectedAt: Date.now() });
      });
    },

    answer() {
      if (snap.status !== "incoming") return;
      set({ status: "active", connectedAt: Date.now() });
    },
    decline() {
      set({ status: "ended", endedReason: "declined" });
      reset();
    },
    hangup() {
      set({ status: "ended", endedReason: "ended" });
      reset();
    },

    setMuted: (m) => set({ muted: m }),
    setHeld: (h) => set({ held: h, status: h ? "held" : "active" }),
    setSpeaker: (s) => set({ speaker: s }),
    sendDtmf: () => {
      /* no-op in the mock */
    },

    simulateIncoming(party: Party) {
      clearTimers();
      set({ status: "incoming", direction: "in", party, endedReason: null });
      // auto-miss after 30s if untouched
      later(30000, () => {
        if (snap.status === "incoming") {
          set({ status: "ended", endedReason: "missed" });
          reset();
        }
      });
    }
  };
}
