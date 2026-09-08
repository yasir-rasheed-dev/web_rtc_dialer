import { registerGlobals } from "react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { SimpleUser } from "sip.js/lib/platform/web";

import { CallEngine, CallSnapshot, IDLE, Party, Registration, SipConfig } from "./types";

// react-native-webrtc polyfills RTCPeerConnection / MediaStream /
// navigator.mediaDevices onto the RN global scope so sip.js's web platform
// (SimpleUser) can run unchanged. Must happen before SimpleUser loads.
registerGlobals();

// keep a trailing "+ * #" and digits only for the SIP user part
const sipUser = (n: string) => n.replace(/[^\d+*#]/g, "");

export function createRealEngine(): CallEngine {
  let user: SimpleUser | null = null;
  let cfg: SipConfig | null = null;
  let snap: CallSnapshot = { ...IDLE };
  let reg: Registration = "offline";
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const callSubs = new Set<(s: CallSnapshot) => void>();
  const regSubs = new Set<(r: Registration) => void>();
  const emit = () => {
    const s = { ...snap };
    callSubs.forEach((cb) => cb(s));
  };
  const emitReg = () => regSubs.forEach((cb) => cb(reg));
  const set = (p: Partial<CallSnapshot>) => {
    snap = { ...snap, ...p };
    emit();
  };
  const scheduleReset = () => {
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      snap = { ...IDLE };
      emit();
    }, 1000);
  };

  const party = (): Party => {
    try {
      const s: any = (user as any)?.session;
      const uri = s?.remoteIdentity?.uri;
      const num = uri?.user || "";
      return { name: s?.remoteIdentity?.displayName || num || "Unknown", number: num };
    } catch {
      return { name: "Unknown", number: "" };
    }
  };

  const startAudio = (speaker = false) => {
    try {
      InCallManager.start({ media: "audio" });
      InCallManager.setForceSpeakerphoneOn(speaker);
    } catch {
      /* noop */
    }
  };
  const stopAudio = () => {
    try {
      InCallManager.stop();
    } catch {
      /* noop */
    }
  };

  return {
    isReal: true,

    connect(c: SipConfig) {
      cfg = c;
      reg = "connecting";
      emitReg();
      try {
        user = new SimpleUser(c.wssUrl, {
          aor: `sip:${c.username}@${c.domain}`,
          media: { constraints: { audio: true, video: false } },
          userAgentOptions: {
            authorizationUsername: c.username,
            authorizationPassword: c.password,
            displayName: c.displayName || c.username,
            logBuiltinEnabled: false
          },
          reconnectionAttempts: 5,
          reconnectionDelay: 4,
          delegate: {
            onServerDisconnect: () => {
              reg = "offline";
              emitReg();
            },
            onRegistered: () => {
              reg = "registered";
              emitReg();
            },
            onUnregistered: () => {
              reg = "offline";
              emitReg();
            },
            onCallCreated: () => set({ status: "dialing", direction: "out", party: party(), endedReason: null }),
            onCallReceived: () => set({ status: "incoming", direction: "in", party: party(), endedReason: null }),
            onCallAnswered: () => {
              set({ status: "active", connectedAt: Date.now(), party: party() });
              startAudio(snap.speaker);
            },
            onCallHangup: () => {
              stopAudio();
              set({ status: snap.status === "ended" ? "ended" : "ended", endedReason: snap.endedReason ?? "ended" });
              scheduleReset();
            },
            onCallHold: (held: boolean) => set({ held, status: held ? "held" : "active" })
          }
        });
        user
          .connect()
          .then(() => user!.register())
          .catch(() => {
            reg = "failed";
            emitReg();
          });
      } catch {
        reg = "failed";
        emitReg();
      }
    },

    disconnect() {
      stopAudio();
      if (resetTimer) clearTimeout(resetTimer);
      user?.unregister().catch(() => {});
      user?.disconnect().catch(() => {});
      user = null;
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
      if (!user || !cfg) return;
      const dest = `sip:${sipUser(number)}@${cfg.domain}`;
      set({ status: "dialing", direction: "out", party: { name: name || number, number }, endedReason: null });
      user
        .call(dest, {}, {
          requestDelegate: {
            onProgress: () => set({ status: "ringing" }),
            onReject: () => {
              stopAudio();
              set({ status: "ended", endedReason: "rejected" });
              scheduleReset();
            }
          }
        })
        .catch(() => {
          set({ status: "ended", endedReason: "failed" });
          scheduleReset();
        });
    },

    answer() {
      user?.answer().catch(() => {});
    },
    decline() {
      const s: any = (user as any)?.session;
      try {
        if (s && typeof s.reject === "function") s.reject({ statusCode: 486, reasonPhrase: "Busy Here" });
        else user?.decline().catch(() => {});
      } catch {
        /* noop */
      }
      set({ status: "ended", endedReason: "declined" });
      scheduleReset();
    },
    hangup() {
      user?.hangup().catch(() => {});
    },

    setMuted(m) {
      try {
        m ? user?.mute() : user?.unmute();
      } catch {
        /* noop */
      }
      set({ muted: m });
    },
    setHeld(h) {
      try {
        (h ? user?.hold() : user?.unhold())?.catch(() => {});
      } catch {
        /* noop */
      }
      set({ held: h, status: h ? "held" : "active" });
    },
    setSpeaker(s) {
      try {
        InCallManager.setForceSpeakerphoneOn(s);
      } catch {
        /* noop */
      }
      set({ speaker: s });
    },
    sendDtmf(digit) {
      user?.sendDTMF(digit).catch(() => {});
    }
  };
}
