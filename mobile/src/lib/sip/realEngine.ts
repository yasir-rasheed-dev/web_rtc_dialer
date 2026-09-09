import { registerGlobals } from "react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import JsSIP from "jssip";

import { CallEngine, CallSnapshot, IDLE, Party, Registration, SipConfig } from "./types";

// react-native-webrtc puts RTCPeerConnection / MediaStream /
// navigator.mediaDevices on the global scope. JsSIP (unlike sip.js's web
// platform) has no DOM assumptions, so it runs on RN unchanged once these
// globals exist.
registerGlobals();
JsSIP.debug.disable();

// digits + "+ * #" only, for the SIP user part
const sipUser = (n: string) => n.replace(/[^\d+*#]/g, "");

function partyOf(session: any): Party {
  try {
    const ri = session?.remote_identity;
    const num = ri?.uri?.user || "";
    return { name: ri?.display_name || num || "Unknown", number: num };
  } catch {
    return { name: "Unknown", number: "" };
  }
}

export function createRealEngine(): CallEngine {
  let ua: any = null;
  let session: any = null;
  let consultSession: any = null;
  let cfg: SipConfig | null = null;
  let snap: CallSnapshot = { ...IDLE };
  let reg: Registration = "offline";
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  let autoAnswer = false; // set when a VoIP-push call was already accepted

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
  const setReg = (r: Registration) => {
    reg = r;
    emitReg();
  };
  const scheduleReset = () => {
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      snap = { ...IDLE };
      emit();
    }, 1000);
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

  const callOpts = () => ({
    mediaConstraints: { audio: true, video: false },
    rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
    pcConfig: { iceServers: [] as RTCIceServer[], rtcpMuxPolicy: "require" as const }
  });

  function wireSession(s: any) {
    session = s;
    s.on("progress", (e: any) => {
      // On an incoming call JsSIP emits 'progress' when IT auto-sends our
      // 180 Ringing (originator "local") — that must not clobber the
      // "incoming" ring state. Only an outbound call's remote 18x means
      // "ringing".
      if (snap.direction === "in" || e?.originator === "local") return;
      set({ status: "ringing" });
    });
    s.on("accepted", () => {
      set({ status: "active", connectedAt: Date.now(), party: partyOf(s) });
      startAudio(snap.speaker);
    });
    s.on("confirmed", () => {
      if (snap.status !== "active") set({ status: "active", connectedAt: Date.now() });
    });
    s.on("hold", () => set({ held: true, status: "held" }));
    s.on("unhold", () => set({ held: false, status: "active" }));
    s.on("ended", (e: any) => {
      console.log("[sip] session ended:", e?.cause);
      stopAudio();
      session = null;
      set({ status: "ended", endedReason: e?.cause || "ended" });
      scheduleReset();
    });
    s.on("failed", (e: any) => {
      console.warn("[sip] session failed:", e?.cause, e?.message?.status_code);
      stopAudio();
      session = null;
      set({ status: "ended", endedReason: e?.cause || "failed" });
      scheduleReset();
    });
  }

  return {
    isReal: true,

    connect(c: SipConfig) {
      cfg = c;
      setReg("connecting");
      console.log(`[sip] connect → ${c.wssUrl}  aor sip:${c.username}@${c.domain}`);
      try {
        const socket = new JsSIP.WebSocketInterface(c.wssUrl);
        ua = new JsSIP.UA({
          sockets: [socket],
          uri: `sip:${c.username}@${c.domain}`,
          password: c.password,
          display_name: c.displayName || c.username,
          register: true,
          register_expires: 300,
          session_timers: false
        });

        ua.on("connected", () => console.log("[sip] ws connected"));
        ua.on("disconnected", (e: any) => {
          console.warn("[sip] ws disconnected", e?.reason);
          setReg("offline");
        });
        ua.on("registered", () => {
          console.log("[sip] REGISTERED");
          setReg("registered");
        });
        ua.on("unregistered", () => setReg("offline"));
        ua.on("registrationFailed", (e: any) => {
          console.warn("[sip] registrationFailed:", e?.cause, e?.response?.status_code, e?.response?.reason_phrase);
          setReg("failed");
        });

        ua.on("newRTCSession", ({ session: s, originator }: any) => {
          console.log(`[sip] newRTCSession originator=${originator}`);
          if (originator === "remote") {
            // incoming
            wireSession(s);
            const p = partyOf(s);
            console.log(`[sip] INCOMING from ${p.name} <${p.number}> → status=incoming`);
            set({ status: "incoming", direction: "in", party: p, endedReason: null });
            if (autoAnswer) {
              autoAnswer = false;
              console.log("[sip] auto-answering (VoIP push already accepted)");
              try {
                s.answer(callOpts());
              } catch (e) {
                console.warn("[sip] auto-answer threw:", e);
              }
            }
          } else {
            // outgoing — wireSession already called in startCall(); nothing to do
          }
        });

        ua.start();
      } catch (e) {
        console.warn("[sip] UA construction failed:", e);
        setReg("failed");
      }
    },

    disconnect() {
      stopAudio();
      if (resetTimer) clearTimeout(resetTimer);
      try {
        session?.terminate();
      } catch {
        /* noop */
      }
      try {
        ua?.stop();
      } catch {
        /* noop */
      }
      ua = null;
      session = null;
      setReg("offline");
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
      if (!ua || !cfg) {
        console.warn("[sip] startCall ignored — engine not connected");
        return;
      }
      const target = `sip:${sipUser(number)}@${cfg.domain}`;
      console.log(`[sip] call → ${target}  (reg=${reg})`);
      set({ status: "dialing", direction: "out", party: { name: name || number, number }, endedReason: null });
      try {
        const s = ua.call(target, callOpts());
        wireSession(s);
      } catch (e) {
        console.warn("[sip] ua.call threw:", e);
        set({ status: "ended", endedReason: "failed" });
        scheduleReset();
      }
    },

    answer() {
      try {
        session?.answer(callOpts());
      } catch (e) {
        console.warn("[sip] answer threw:", e);
      }
    },
    armAutoAnswer(on: boolean) {
      autoAnswer = on;
      // If the INVITE is already here (arrived between accept and this
      // call), answer it now.
      if (on && session && snap.status === "incoming") {
        autoAnswer = false;
        try {
          session.answer(callOpts());
        } catch {
          /* noop */
        }
      }
    },
    decline() {
      try {
        session?.terminate({ status_code: 486, reason_phrase: "Busy Here" });
      } catch {
        /* noop */
      }
      set({ status: "ended", endedReason: "declined" });
      scheduleReset();
    },
    hangup() {
      try {
        session?.terminate();
      } catch {
        /* noop */
      }
    },

    setMuted(m) {
      try {
        m ? session?.mute({ audio: true }) : session?.unmute({ audio: true });
      } catch {
        /* noop */
      }
      set({ muted: m });
    },
    setHeld(h) {
      try {
        h ? session?.hold() : session?.unhold();
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
      try {
        session?.sendDTMF(digit);
      } catch {
        /* noop */
      }
    },

    startWarmTransfer(target: string) {
      if (!ua || !cfg || !session) return;
      const to = `sip:${sipUser(target)}@${cfg.domain}`;
      console.log(`[sip] warm transfer → consult ${to}`);
      try {
        session.hold();
      } catch {
        /* noop */
      }
      set({ held: true, status: "held", transfer: { phase: "consulting", target } });
      try {
        consultSession = ua.call(to, callOpts());
        consultSession.on("ended", () => {
          consultSession = null;
          // consult dropped → resume the held call
          if (snap.transfer) {
            try {
              session?.unhold();
            } catch {
              /* noop */
            }
            set({ held: false, status: "active", transfer: null });
          }
        });
        consultSession.on("failed", (e: any) => {
          console.warn("[sip] consult failed:", e?.cause);
          consultSession = null;
          try {
            session?.unhold();
          } catch {
            /* noop */
          }
          set({ held: false, status: "active", transfer: null });
        });
      } catch (e) {
        console.warn("[sip] consult call threw:", e);
        try {
          session?.unhold();
        } catch {
          /* noop */
        }
        set({ held: false, status: "active", transfer: null });
      }
    },
    completeTransfer() {
      if (!session || !consultSession) return;
      console.log("[sip] completing attended transfer");
      set({ transfer: { phase: "completing", target: snap.transfer?.target || "" } });
      try {
        // JsSIP attended transfer: REFER with Replaces pointing at the consult leg
        session.refer(consultSession);
      } catch (e) {
        console.warn("[sip] refer threw:", e);
      }
      stopAudio();
      set({ status: "ended", endedReason: "transferred", transfer: null });
      scheduleReset();
    },
    cancelWarmTransfer() {
      try {
        consultSession?.terminate();
      } catch {
        /* noop */
      }
      consultSession = null;
      try {
        session?.unhold();
      } catch {
        /* noop */
      }
      set({ held: false, status: "active", transfer: null });
    }
  };
}
