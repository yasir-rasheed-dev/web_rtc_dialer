import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { useCall } from "@/store/call";
import {
  CK,
  callAccountStatus,
  callkeepAvailable,
  callkeepNativeLoaded,
  initCallKeep,
  newUuid,
  promptCallAccount
} from "@/lib/callkeep";
import type { CallStatus } from "@/lib/sip";

// The bridge only does anything on a build where CallKeep's native module
// actually linked. Otherwise IncomingCall.tsx handles the ring in-app.
const ckReady = callkeepAvailable && callkeepNativeLoaded;
const ACCOUNT_NUDGE_KEY = "ck.accountNudge.v1";

// Bridges the JsSIP call engine to the OS call UI (CallKit /
// ConnectionService). Mount once, renders nothing. No-op in Expo Go.
export default function CallKeepBridge() {
  const router = useRouter();
  const snap = useCall((s) => s.snap);
  const uuidRef = useRef<string | null>(null);
  const lastStatus = useRef<CallStatus>("idle");

  // Can the OS actually show calls right now? iOS: yes once linked.
  // Android: only when the user has enabled ringNex under Calling accounts
  // — otherwise displayIncomingCall silently no-ops, so keep the in-app ring.
  const [canShowNative, setCanShowNative] = useState(false);

  const refreshNative = async () => {
    if (!ckReady) return setCanShowNative(false);
    if (Platform.OS === "ios") return setCanShowNative(true);
    const st = await callAccountStatus();
    setCanShowNative(!!st.enabled);
  };

  useEffect(() => {
    refreshNative();
    const sub = AppState.addEventListener("change", (s) => s === "active" && refreshNative());
    return () => sub.remove();
  }, []);

  // Let IncomingCall know whether to suppress the in-app overlay.
  useEffect(() => {
    useCall.setState({ nativeCallUi: canShowNative });
    return () => useCall.setState({ nativeCallUi: false });
  }, [canShowNative]);

  useEffect(() => {
    if (!ckReady) return;
    (async () => {
      await initCallKeep();
      await refreshNative();
      // First run only: if the OS won't show calls natively yet, nudge
      // the user to the Calling accounts screen. Never nag twice.
      try {
        const seen = await SecureStore.getItemAsync(ACCOUNT_NUDGE_KEY);
        if (!seen) {
          await SecureStore.setItemAsync(ACCOUNT_NUDGE_KEY, "1");
          setTimeout(() => promptCallAccount(), 1200);
        }
      } catch {
        /* secure-store unavailable — skip the nudge */
      }
    })();
  }, []);

  const dropSystemCall = () => {
    const u = uuidRef.current;
    if (!u) return;
    uuidRef.current = null;
    // Close the system UI so the app + InCallManager fully own the call
    // audio (Android mic conflict), then re-assert the audio route since
    // ending a ConnectionService call resets AudioManager mode.
    setTimeout(() => {
      CK.end(u);
      setTimeout(() => useCall.getState().refreshAudio(), 400);
    }, 600);
  };

  // OS UI actions → engine
  useEffect(() => {
    if (!ckReady) return;
    const offs = [
      CK.on("answerCall", () => {
        useCall.getState().answer();
        router.push("/(agent)/call" as any);
        dropSystemCall();
      }),
      CK.on("endCall", () => {
        const s = useCall.getState().snap.status;
        if (s === "incoming") useCall.getState().decline();
        else useCall.getState().hangup();
        uuidRef.current = null;
      }),
      CK.on("didPerformSetMutedCallAction", ({ muted }: any) => {
        if (useCall.getState().snap.muted !== muted) useCall.getState().toggleMute();
      }),
      CK.on("didToggleHoldCallAction", ({ hold }: any) => {
        if (useCall.getState().snap.held !== hold) useCall.getState().toggleHold();
      }),
      CK.on("didPerformDTMFAction", ({ digits }: any) => {
        if (digits) useCall.getState().dtmf(String(digits));
      })
    ];
    return () => offs.forEach((o) => o());
  }, []);

  // engine state → OS UI.
  //
  // CallKeep is used ONLY to present the incoming-call ring (lock screen /
  // background). As soon as the call is answered or connects, the system
  // call is ended and the in-app call screen + InCallManager own it —
  // keeping the system call alive fights react-native-webrtc for the mic
  // on Android (outgoing audio breaks). Outbound calls never touch CallKeep.
  useEffect(() => {
    if (!ckReady || !canShowNative) return;
    const prev = lastStatus.current;
    const s = snap.status;
    lastStatus.current = s;

    if (s === "incoming" && (prev === "idle" || prev === "ended")) {
      uuidRef.current = newUuid();
      const handle = snap.party?.number || "unknown";
      CK.showIncoming(uuidRef.current, handle, snap.party?.name || handle);
    }
    if ((s === "active" || s === "ended" || s === "idle") && uuidRef.current) {
      CK.end(uuidRef.current);
      uuidRef.current = null;
    }
  }, [snap.status, snap.party?.number, canShowNative]);

  return null;
}
