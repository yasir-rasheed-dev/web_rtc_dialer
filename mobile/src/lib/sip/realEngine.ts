import { registerGlobals } from "react-native-webrtc";
import InCallManager from "react-native-incall-manager";

import { CallEngine, CallSnapshot, IDLE, Party, Registration, SipConfig } from "./types";

// sip.js's web platform touches `window` in a few spots; RN has no DOM.
// Point it at the global object before sip.js is imported. react-native-
// webrtc's registerGlobals() then adds RTCPeerConnection / MediaStream /
// navigator.mediaDevices so SimpleUser can run unchanged.
const g: any = globalThis as any;
if (typeof g.window === "undefined") g.window = g;
if (typeof g.navigator === "undefined") g.navigator = {};
registerGlobals();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SimpleUser } = require("sip.js/lib/platform/web");

// keep a trailing "+ * #" and digits only for the SIP user part
const sipUser = (n: string) => n.replace(/[^\d+*#]/g, "");

export function createRealEngine(): CallEngine {
  let user: any = null;
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
      console.log(`[sip] connect → ${c.wssUrl}  aor sip:${c.username}@${c.domain}`);
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
            onServerConnect: () => console.log("[sip] ws connected"),
            onServerDisconnect: (err?: unknown) => {
              console.warn("[sip] ws disconnected", err);
              reg = "offline";
              emitReg();
            },
            onRegistered: () => {
              console.log("[sip] REGISTERED");
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
          .then(() => {
            console.log("[sip] transport connected, registering…");
            return user.register();
          })
          .catch((e: unknown) => {
            console.warn("[sip] connect/register failed:", e);
            reg = "failed";
            emitReg();
          });
      } catch (e) {
        console.warn("[sip] SimpleUser construction failed:", e);
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
      if (!user || !cfg) {
        console.warn("[sip] startCall ignored — engine not connected yet");
        return;
      }
      const dest = `sip:${sipUser(number)}@${cfg.domain}`;
      console.log(`[sip] call → ${dest}  (reg=${reg})`);
      set({ status: "dialing", direction: "out", party: { name: name || number, number }, endedReason: null });
      user
        .call(dest, {}, {
          requestDelegate: {
            onProgress: () => set({ status: "ringing" }),
            onReject: (r: unknown) => {
              console.warn("[sip] call rejected:", r);
              stopAudio();
              set({ status: "ended", endedReason: "rejected" });
              scheduleReset();
            }
          }
        })
        .catch((e: unknown) => {
          console.warn("[sip] call() threw:", e);
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
