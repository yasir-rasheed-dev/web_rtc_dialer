import { CallEngine } from "./types";
import { createMockEngine } from "./mockEngine";

export * from "./types";

// One engine per app session.
//
// Right now this is always the SIMULATED engine — it drives the full call
// UI (dialing → ringing → active → controls → incoming ring →
// answer/decline) with no native modules, so everything works in Expo Go.
//
// Phase 1-real: once `react-native-webrtc` is added back and a dev build
// is made, swap in `createRealEngine()` here (sip.js + WebRTC). Keep the
// same CallEngine interface so no screen changes.
let engine: CallEngine | null = null;

export function getEngine(): CallEngine {
  if (!engine) engine = createMockEngine();
  return engine;
}

export function isRealCalling() {
  return getEngine().isReal;
}
