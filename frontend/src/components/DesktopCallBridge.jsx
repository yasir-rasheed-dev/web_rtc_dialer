import { useEffect, useRef } from "react";

// Zero-UI. Mounted once in app/App.jsx right next to Softphone/
// GlobalCallOverlay, under the same `{!ownerAccount && session.sip && ...}`
// guard. No-ops entirely when not running inside the Electron desktop app
// (window.ringnexDesktop only exists there — see electron/preload.js), so
// this has no effect at all on the web build.
//
// This is the only piece that talks to both sides of the call-popup
// window: it re-broadcasts Softphone.jsx's existing "ringnex:softphone-state"
// event to the popup over IPC, opens/closes the popup automatically as a
// call starts/ends, and turns commands sent back from the popup
// (answer/decline/hangup/mute/hold/transfer/dtmf) into calls on the
// existing window.ringnex* globals Softphone.jsx already exposes — the
// exact same globals GlobalCallOverlay itself calls on the web. Softphone.jsx
// never needs to know this bridge (or the popup) exists.
export default function DesktopCallBridge() {
  const wasActiveRef = useRef(false);

  useEffect(() => {
    const bridge = window.ringnexDesktop?.callWindow;
    if (!bridge) return undefined;

    const onState = (event) => {
      const state = event.detail;
      bridge.sendState(state);

      const isActive = state?.callStatus && state.callStatus !== "idle";
      if (isActive && !wasActiveRef.current) bridge.show();
      else if (!isActive && wasActiveRef.current) bridge.hide();
      wasActiveRef.current = Boolean(isActive);
    };

    window.addEventListener("ringnex:softphone-state", onState);
    // Sync immediately in case a call is already in progress when this
    // mounts (e.g. the desktop app restarts DesktopCallBridge without a
    // fresh Softphone mount — unlikely today since both mount together,
    // but cheap insurance).
    if (window.ringnexSoftphoneState) onState({ detail: window.ringnexSoftphoneState });

    return () => window.removeEventListener("ringnex:softphone-state", onState);
  }, []);

  useEffect(() => {
    const bridge = window.ringnexDesktop?.callWindow;
    if (!bridge) return undefined;

    return bridge.onCommand(async ({ command, payload } = {}) => {
      switch (command) {
        case "answer":
          window.ringnexAnswerCall?.();
          break;
        case "decline":
          window.ringnexDeclineCall?.();
          break;
        case "hangup":
          window.ringnexHangup?.();
          break;
        case "toggleMute":
          window.ringnexToggleMute?.();
          break;
        case "toggleHold":
          window.ringnexToggleHold?.();
          break;
        case "dtmf":
          window.ringnexSendDTMF?.(payload?.key);
          break;
        case "transfer":
          // The only command with meaningful failure feedback the popup
          // should show inline (invalid/unreachable number, no active
          // call, etc.) — the others are fire-and-forget, same as the
          // in-page UI's own mute/hold/DTMF buttons.
          try {
            await window.ringnexBlindTransfer?.(payload?.number);
            bridge.sendCommandResult({ command: "transfer", ok: true });
          } catch (error) {
            bridge.sendCommandResult({ command: "transfer", ok: false, error: error?.message });
          }
          break;
        default:
          break;
      }
    });
  }, []);

  return null;
}
