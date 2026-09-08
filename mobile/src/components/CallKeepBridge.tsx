import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { useCall } from "@/store/call";
import { CK, callkeepAvailable, initCallKeep, newUuid, promptCallAccount } from "@/lib/callkeep";
import type { CallStatus } from "@/lib/sip";

const ACCOUNT_NUDGE_KEY = "ck.accountNudge.v1";

// Bridges the JsSIP call engine to the OS call UI (CallKit /
// ConnectionService). Mount once, renders nothing. No-op in Expo Go.
export default function CallKeepBridge() {
  const router = useRouter();
  const snap = useCall((s) => s.snap);
  const uuidRef = useRef<string | null>(null);
  const lastStatus = useRef<CallStatus>("idle");

  useEffect(() => {
    if (!callkeepAvailable) return;
    (async () => {
      await initCallKeep();
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
    if (!callkeepAvailable) return;
    const offs = [
      CK.on("answerCall", () => {
        useCall.getState().answer();
        router.push("/(agent)/call" as any);
      }),
      CK.on("endCall", () => {
        const s = useCall.getState().snap.status;
        if (s === "incoming") useCall.getState().decline();
        else useCall.getState().hangup();
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

  // engine state → OS UI
  useEffect(() => {
    if (!callkeepAvailable) return;
    const prev = lastStatus.current;
    const s = snap.status;
    lastStatus.current = s;

    if ((s === "incoming" || s === "dialing") && (prev === "idle" || prev === "ended")) {
      uuidRef.current = newUuid();
      const handle = snap.party?.number || "unknown";
      const name = snap.party?.name || handle;
      if (s === "incoming") CK.showIncoming(uuidRef.current, handle, name);
      else CK.reportOutgoing(uuidRef.current, handle, name);
    }
    if (s === "ringing" && uuidRef.current) CK.connecting(uuidRef.current);
    if (s === "active" && uuidRef.current) CK.connected(uuidRef.current);
    if ((s === "ended" || s === "idle") && uuidRef.current) {
      CK.end(uuidRef.current);
      uuidRef.current = null;
    }
  }, [snap.status, snap.party?.number]);

  // in-app mute/hold changes → reflect on the OS UI
  useEffect(() => {
    if (callkeepAvailable && uuidRef.current) CK.setMuted(uuidRef.current, snap.muted);
  }, [snap.muted]);
  useEffect(() => {
    if (callkeepAvailable && uuidRef.current) CK.setOnHold(uuidRef.current, snap.held);
  }, [snap.held]);

  return null;
}
