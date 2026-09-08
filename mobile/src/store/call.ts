import { create } from "zustand";

import { getEngine } from "@/lib/sip";
import type { CallSnapshot, Party, Registration, SipConfig } from "@/lib/sip";
import { IDLE } from "@/lib/sip";

type CallState = {
  snap: CallSnapshot;
  registration: Registration;
  connected: boolean;
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
  simulateIncoming: (party: Party) => void;
  isReal: () => boolean;
};

let unsub: Array<() => void> = [];

export const useCall = create<CallState>((set, get) => ({
  snap: { ...IDLE },
  registration: "offline",
  connected: false,

  init(cfg) {
    if (get().connected) return;
    const e = getEngine();
    unsub.forEach((u) => u());
    unsub = [
      e.onCall((snap) => set({ snap })),
      e.onRegistration((registration) => set({ registration }))
    ];
    e.connect(cfg);
    set({ connected: true, snap: e.getSnapshot(), registration: e.getRegistration() });
  },

  teardown() {
    unsub.forEach((u) => u());
    unsub = [];
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
  simulateIncoming: (party) => getEngine().simulateIncoming?.(party),
  isReal: () => getEngine().isReal
}));
