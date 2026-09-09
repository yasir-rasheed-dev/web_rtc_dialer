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

// CallKeep is used ONLY as the incoming ringer (foreground / background /
// killed-app via the VoIP push). The instant the user accepts, the system
// call is ended and the in-app call screen + InCallManager own the whole
// call — a live ConnectionService call fights react-native-webrtc for the
// mic on Android, and its state machine drifts from JsSIP's.
//
// Because RNCallKeep fires the same `endCall` event whether the *user*
// pressed decline/hangup or *we* called CK.end(), every programmatic end
// goes through endedByUs first so the event handler can tell them apart.
const endedByUs = new Set<string>();

export default function CallKeepBridge() {
  const router = useRouter();
  const snap = useCall((s) => s.snap);
  const uuidRef = useRef<string | null>(null);
  const lastStatus = useRef<CallStatus>("idle");

  const [canShowNative, setCanShowNative] = useState(false);

  const refreshNative = async () => {
    if (!ckReady) return setCanShowNative(false);
    if (Platform.OS === "ios") return setCanShowNative(true);
    const st = await callAccountStatus();
    setCanShowNative(!!st.enabled);
  };

  const ckEnd = (uuid: string | null) => {
    if (!uuid) return;
    console.log("[ck] end()", uuid);
    endedByUs.add(uuid);
    try {
      CK.end(uuid);
    } catch (e) {
      console.warn("[ck] end threw", e);
    }
    setTimeout(() => endedByUs.delete(uuid), 6000);
  };

  const clearCall = () => {
    uuidRef.current = null;
    clearPendingVoip();
  };

  useEffect(() => {
    refreshNative();
    const sub = AppState.addEventListener("change", (s) => s === "active" && refreshNative());
    return () => sub.remove();
  }, []);

  // Tell IncomingCall whether to suppress its in-app overlay.
  useEffect(() => {
    console.log("[ck] canShowNative =", canShowNative);
    useCall.setState({ nativeCallUi: canShowNative });
    return () => useCall.setState({ nativeCallUi: false });
  }, [canShowNative]);

  useEffect(() => {
    if (!ckReady) return;
    (async () => {
      await initCallKeep();
      await refreshNative();
      await registerVoipTask();

      // Cold-started by tapping "Answer" on a VoIP-push call: reuse that
      // uuid, seed the party, arm the engine to auto-answer the INVITE
      // that's still on its way, and open the call screen.
      const p = getPendingVoip();
      if (p) {
        console.log("[ck] launch with pending VoIP call", p.uuid, p.caller);
        uuidRef.current = p.uuid;
        useCall.setState((st) => ({ snap: { ...st.snap, party: { name: p.callerName, number: p.caller } } }));
        useCall.getState().armAutoAnswer(true);
        router.push("/(agent)/call" as any);
      }

      try {
        const seen = await SecureStore.getItemAsync(ACCOUNT_NUDGE_KEY);
        if (!seen) {
          await SecureStore.setItemAsync(ACCOUNT_NUDGE_KEY, "1");
          setTimeout(() => promptCallAccount(), 1200);
        }
      } catch {
        /* secure-store unavailable */
      }
    })();
  }, []);

  // ---- OS UI actions → engine ----
  useEffect(() => {
    if (!ckReady) return;
    const offs = [
      CK.on("answerCall", (data: any) => {
        const uuid = data?.callUUID || uuidRef.current;
        const st = useCall.getState();
        console.log("[ck] << answerCall", uuid, "status=", st.snap.status, "pendingVoip=", !!getPendingVoip());
        if (getPendingVoip() && st.snap.status !== "incoming") {
          st.armAutoAnswer(true); // INVITE not here yet
        } else {
          st.answer();
        }
        router.push("/(agent)/call" as any);
        // hand the call to the app right away — no lingering system call
        ckEnd(uuid);
        clearCall();
        // ConnectionService teardown can reset AudioManager after answer();
        // re-assert the in-call route once the SIP leg is actually up.
        setTimeout(() => useCall.getState().refreshAudio(), 700);
        setTimeout(() => useCall.getState().refreshAudio(), 1800);
      }),

      CK.on("endCall", (data: any) => {
        const uuid = data?.callUUID || uuidRef.current;
        if (uuid && endedByUs.has(uuid)) {
          endedByUs.delete(uuid);
          console.log("[ck] << endCall", uuid, "(ours — ignore)");
          return;
        }
        const s = useCall.getState().snap.status;
        console.log("[ck] << endCall", uuid, "(user) status=", s);
        if (getPendingVoip() && s !== "incoming" && s !== "active") {
          rejectPendingVoip();
          useCall.getState().armAutoAnswer(false);
        } else if (s === "incoming" || s === "ringing" || s === "dialing") {
          useCall.getState().decline();
        } else {
          useCall.getState().hangup();
        }
        clearCall();
      }),

      CK.on("didPerformSetMutedCallAction", ({ muted }: any) => {
        console.log("[ck] << setMuted", muted);
        if (useCall.getState().snap.muted !== muted) useCall.getState().toggleMute();
      }),
      CK.on("didToggleHoldCallAction", ({ hold }: any) => {
        console.log("[ck] << toggleHold", hold);
        if (useCall.getState().snap.held !== hold) useCall.getState().toggleHold();
      }),
      CK.on("didPerformDTMFAction", ({ digits }: any) => {
        console.log("[ck] << dtmf", digits);
        if (digits) useCall.getState().dtmf(String(digits));
      })
    ];
    return () => offs.forEach((o) => o());
  }, []);

  // ---- engine state → OS UI (ring only) ----
  useEffect(() => {
    if (!ckReady || !canShowNative) return;
    const s = snap.status;
    const prev = lastStatus.current;
    lastStatus.current = s;

    // raise the incoming ring once per call
    if (s === "incoming" && prev !== "incoming") {
      if (uuidRef.current && getPendingVoip()) {
        console.log("[ck] INVITE arrived for pushed call", uuidRef.current);
      } else if (!uuidRef.current) {
        uuidRef.current = newUuid();
        const handle = snap.party?.number || "unknown";
        console.log("[ck] >> showIncoming", uuidRef.current, handle, snap.party?.name);
        CK.showIncoming(uuidRef.current, handle, snap.party?.name || handle);
      }
    }

    // caller name resolved (saved contact lookup) after the ring started —
    // refresh what the system ringer shows.
    if (s === "incoming" && uuidRef.current && snap.party?.name && snap.party.name !== snap.party.number) {
      CK.updateDisplay(uuidRef.current, snap.party.name, snap.party.number || "unknown");
    }

    // ring ended before it was answered (declined elsewhere / caller gave
    // up / failed) — dismiss the system ringer if it's still up.
    if ((s === "ended" || s === "idle") && uuidRef.current) {
      console.log("[ck] call ", s, "→ dismiss ringer", uuidRef.current);
      ckEnd(uuidRef.current);
      clearCall();
    }
  }, [snap.status, snap.party?.number, snap.party?.name, canShowNative]);

  return null;
}
