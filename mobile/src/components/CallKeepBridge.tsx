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
import { clearPendingVoip, getPendingVoip, registerVoipTask, rejectPendingVoip } from "@/lib/voipPush";
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
      await registerVoipTask();
      // Cold-started by tapping "Answer" on a VoIP-push call? Arm the
      // engine so the incoming INVITE (still in flight) auto-answers, and
      // reuse the UUID the push task already showed.
      const p = getPendingVoip();
      if (p) {
        uuidRef.current = p.uuid;
        useCall.setState((st) => ({ snap: { ...st.snap, party: { name: p.callerName, number: p.caller } } }));
        useCall.getState().armAutoAnswer(true);
        router.push("/(agent)/call" as any);
      }
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

  // OS UI actions → engine
  useEffect(() => {
    if (!ckReady) return;
    const offs = [
      CK.on("answerCall", () => {
        // A VoIP-push call whose SIP INVITE hasn't landed yet: arm
        // auto-answer instead of answering a session that isn't there.
        if (getPendingVoip() && useCall.getState().snap.status !== "incoming") {
          useCall.getState().armAutoAnswer(true);
        } else {
          useCall.getState().answer();
        }
        router.push("/(agent)/call" as any);
      }),
      CK.on("endCall", () => {
        const s = useCall.getState().snap.status;
        if (getPendingVoip() && s !== "incoming" && s !== "active") {
          rejectPendingVoip();
          useCall.getState().armAutoAnswer(false);
        } else if (s === "incoming") {
          useCall.getState().decline();
        } else {
          useCall.getState().hangup();
        }
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

  // engine state → OS UI (only when the OS UI can actually render)
  useEffect(() => {
    if (!ckReady || !canShowNative) return;
    const prev = lastStatus.current;
    const s = snap.status;
    lastStatus.current = s;

    if ((s === "incoming" || s === "dialing") && (prev === "idle" || prev === "ended")) {
      // A VoIP-push call already has its UUID + incoming UI from the push
      // task — don't raise a second one.
      if (uuidRef.current && getPendingVoip()) {
        // reuse
      } else {
        uuidRef.current = newUuid();
        const handle = snap.party?.number || "unknown";
        const name = snap.party?.name || handle;
        if (s === "incoming") CK.showIncoming(uuidRef.current, handle, name);
        else CK.reportOutgoing(uuidRef.current, handle, name);
      }
    }
    if (s === "ringing" && uuidRef.current) CK.connecting(uuidRef.current);
    if (s === "active" && uuidRef.current) {
      CK.connected(uuidRef.current);
      clearPendingVoip();
    }
    if ((s === "ended" || s === "idle") && uuidRef.current) {
      CK.end(uuidRef.current);
      uuidRef.current = null;
      clearPendingVoip();
    }
  }, [snap.status, snap.party?.number, canShowNative]);

  // in-app mute/hold changes → reflect on the OS UI
  useEffect(() => {
    if (ckReady && uuidRef.current) CK.setMuted(uuidRef.current, snap.muted);
  }, [snap.muted]);
  useEffect(() => {
    if (ckReady && uuidRef.current) CK.setOnHold(uuidRef.current, snap.held);
  }, [snap.held]);

  return null;
}
