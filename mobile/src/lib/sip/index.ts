import { NativeModules } from "react-native";

import { CallEngine } from "./types";
import { createMockEngine } from "./mockEngine";

export * from "./types";

// One engine per app session.
//
//  - Dev / production build with react-native-webrtc → the real sip.js
//    engine (./realEngine): actual SIP registration + WebRTC audio.
//  - Expo Go (no WebRTC native module) → the simulated engine, so the
//    whole call UI still runs.
//
// Same CallEngine interface either way — no screen changes between them.
let engine: CallEngine | null = null;

export function getEngine(): CallEngine {
  if (engine) return engine;
  const hasWebRTC = Boolean((NativeModules as any)?.WebRTCModule);
  if (hasWebRTC) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createRealEngine } = require("./realEngine");
      engine = createRealEngine();
    } catch {
      engine = createMockEngine();
    }
  } else {
    engine = createMockEngine();
  }
  return engine!;
}

export function isRealCalling() {
  return getEngine().isReal;
}
