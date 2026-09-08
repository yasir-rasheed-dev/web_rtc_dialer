import Constants from "expo-constants";

import { CallEngine } from "./types";
import { createMockEngine } from "./mockEngine";

export * from "./types";

// One engine per app session.
//
//  - Dev / production build → the real sip.js + react-native-webrtc engine
//    (./realEngine): actual SIP registration + WebRTC audio.
//  - Expo Go (no native WebRTC) → the simulated engine.
//
// Expo Go reports executionEnvironment "storeClient"; a dev/standalone
// build reports "standalone" or "bare". That's the reliable signal —
// NativeModules.WebRTCModule is undefined under the new architecture even
// when react-native-webrtc IS present (it's a TurboModule).
let engine: CallEngine | null = null;

const IN_EXPO_GO = Constants.executionEnvironment === "storeClient";

export function getEngine(): CallEngine {
  if (engine) return engine;
  if (!IN_EXPO_GO) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createRealEngine } = require("./realEngine");
      engine = createRealEngine();
      console.log("[sip] using REAL engine (react-native-webrtc)");
    } catch (e) {
      console.warn("[sip] real engine failed to load, falling back to mock:", e);
      engine = createMockEngine();
    }
  } else {
    engine = createMockEngine();
    console.log("[sip] using SIMULATED engine (Expo Go)");
  }
  return engine!;
}

export function isRealCalling() {
  return getEngine().isReal;
}
