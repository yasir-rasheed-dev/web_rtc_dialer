import { AppState, type NativeEventSubscription } from "react-native";
import { create } from "zustand";

import { getEngine } from "@/lib/sip";
import type { CallSnapshot, Party, Registration, SipConfig } from "@/lib/sip";
import { IDLE } from "@/lib/sip";
import { lookupNumber } from "@/lib/contacts";

type CallState = {
  snap: CallSnapshot;
  registration: Registration;
  connected: boolean;
  // true only once CallKeepBridge confirms the native call UI is live;
  // when false the in-app IncomingCall overlay handles the ring.
  nativeCallUi: boolean;
  init: (cfg: SipConfig) => void;
  teardown: () => void;
  // actions (delegate to the engine)
  start: (number: string, name?: string) => void;
  answer: () => void;
  decline: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  toggleSpeaker: () => void;
  dtmf: (d: string) => void;
  startWarmTransfer: (target: string) => void;
  completeTransfer: () => void;
  cancelWarmTransfer: () => void;
  armAutoAnswer: (on: boolean) => void;
  refreshAudio: () => void;
  reconnect: () => void;
  simulateIncoming: (party: Party) => void;
  isReal: () => boolean;
};

let unsub: Array<() => void> = [];
let appStateSub: NativeEventSubscription | null = null;
let resolvedFor = ""; // number we last ran a contact lookup for

// When a call's party has only a number (no saved name), resolve it
// against the tenant's contacts/agents and patch the snapshot.
function resolveParty(party: Party | null) {
  if (!party || !party.number) return;
  if (party.name && party.name !== party.number) return;
  if (resolvedFor === party.number) return;
  resolvedFor = party.number;
  lookupNumber(party.number).then((hit) => {
    if (!hit?.name) return;
    const cur = useCall.getState().snap.party;
    if (cur && cur.number === party.number) {
      useCall.setState((st) => ({ snap: { ...st.snap, party: { ...st.snap.party!, name: hit.name! } } }));
    }
  });
}

export const useCall = create<CallState>((set, get) => ({
  snap: { ...IDLE },
  registration: "offline",
  connected: false,
  nativeCallUi: false,

  init(cfg) {
    if (get().connected) return;
    const e = getEngine();
    unsub.forEach((u) => u());
    unsub = [
      e.onCall((snap) => {
        set({ snap });
        resolveParty(snap.party);
        if (snap.status === "idle") resolvedFor = "";
      }),
      e.onRegistration((registration) => set({ registration }))
    ];
    e.connect(cfg);
    set({ connected: true, snap: e.getSnapshot(), registration: e.getRegistration() });

    // Re-assert the SIP link whenever the app comes back to the foreground.
    appStateSub?.remove();
    appStateSub = AppState.addEventListener("change", (s) => {
      if (s === "active") getEngine().reconnect?.();
    });
  },

  teardown() {
    unsub.forEach((u) => u());
    unsub = [];
    appStateSub?.remove();
    appStateSub = null;
    getEngine().disconnect();
    set({ connected: false, snap: { ...IDLE }, registration: "offline" });
  },

  start: (number, name) => getEngine().startCall(number, name),
  answer: () => getEngine().answer(),
  decline: () => getEngine().decline(),
  hangup: () => getEngine().hangup(),
  toggleMute: () => {
    const e = getEngine();
    e.setMuted(!e.getSnapshot().muted);
  },
  toggleHold: () => {
    const e = getEngine();
    e.setHeld(!e.getSnapshot().held);
  },
  toggleSpeaker: () => {
    const e = getEngine();
    e.setSpeaker(!e.getSnapshot().speaker);
  },
  dtmf: (d) => getEngine().sendDtmf(d),
  startWarmTransfer: (target) => getEngine().startWarmTransfer(target),
  completeTransfer: () => getEngine().completeTransfer(),
  cancelWarmTransfer: () => getEngine().cancelWarmTransfer(),
  armAutoAnswer: (on) => getEngine().armAutoAnswer?.(on),
  refreshAudio: () => getEngine().refreshAudio?.(),
  reconnect: () => getEngine().reconnect?.(),
  simulateIncoming: (party) => getEngine().simulateIncoming?.(party),
  isReal: () => getEngine().isReal
}));
