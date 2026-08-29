import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Grid3x3, Mic, MicOff, Pause, PhoneIncoming, PhoneOff, Play, Send, X } from "lucide-react";

import { formatDuration, initials, isValidDialString, normalizeDialString } from "../../lib/phone";

// This is the entire content of the Electron call-popup window (see
// electron/main.js's createCallWindow + frontend/src/main.jsx's
// "#call-window" branch) — a small always-on-top "phone view" separate
// from the main app window. It deliberately never imports Softphone.jsx or
// sipClient.js: the real SIP connection, RTCPeerConnection and <audio>
// element only ever exist in the main window (see DesktopCallBridge.jsx),
// and can't be moved here. This is purely a state mirror + command sender,
// talking to the main window over IPC via window.ringnexDesktop.callWindow
// (exposed in electron/preload.js).
const IDLE_STATE = {
  registered: false,
  callStatus: "idle",
  currentParty: { number: "", displayName: "" },
  connectedAt: null,
  muted: false,
  held: false,
  canReceive: false,
  canHold: false,
  canBlindTransfer: false,
  canSendDtmf: false
};

const DTMF_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

const CALL_STATUS_LABEL = {
  dialing: "Dialing…",
  ringing: "Ringing…",
  connecting: "Connecting…",
  ending: "Ending…"
};

export default function CallWindow() {
  const [state, setState] = useState(IDLE_STATE);
  const [elapsed, setElapsed] = useState(0);
  const [panel, setPanel] = useState(null); // null | "keypad" | "transfer"
  const [transferNumber, setTransferNumber] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState("");

  useEffect(() => {
    const bridge = window.ringnexDesktop?.callWindow;
    if (!bridge) return undefined;
    return bridge.onState((next) => setState(next || IDLE_STATE));
  }, []);

  useEffect(() => {
    const bridge = window.ringnexDesktop?.callWindow;
    if (!bridge) return undefined;
    return bridge.onCommandResult((result) => {
      if (result?.command !== "transfer") return;
      setTransferBusy(false);
      if (result.ok) {
        setPanel(null);
        setTransferNumber("");
        setTransferError("");
      } else {
        setTransferError(result.error || "The call could not be transferred.");
      }
    });
  }, []);

  useEffect(() => {
    if (!state.connectedAt) {
      setElapsed(0);
      return undefined;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - state.connectedAt) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [state.connectedAt]);

  // Once a call fully ends, collapse whatever panel was open so the next
  // call (incoming or outgoing) starts from a clean slate.
  useEffect(() => {
    if (state.callStatus !== "idle") return;
    setPanel(null);
    setTransferNumber("");
    setTransferError("");
    setTransferBusy(false);
  }, [state.callStatus]);

  const send = (command, payload) => window.ringnexDesktop?.callWindow?.sendCommand(command, payload);

  const submitTransfer = (event) => {
    event.preventDefault();
    const target = normalizeDialString(transferNumber);
    if (!isValidDialString(target)) {
      setTransferError("Enter a valid agent extension or phone number.");
      return;
    }
    setTransferError("");
    setTransferBusy(true);
    send("transfer", { number: target });
  };

  const isIncoming = state.callStatus === "incoming";
  const isEstablished = state.callStatus === "active" || state.callStatus === "held";
  const primaryParty = state.currentParty?.displayName || state.currentParty?.number || "Unknown";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface text-text">
      <div
        className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2"
        style={{ WebkitAppRegion: "drag" }}
      >
        <span className="text-xs font-semibold text-muted">Ringnex Call</span>
        <button
          type="button"
          onClick={() => window.ringnexDesktop?.callWindow?.hide()}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
          style={{ WebkitAppRegion: "no-drag" }}
          aria-label="Hide call window (the call keeps going)"
          title="Hide (call keeps going — reopen from the header)"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-4">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-lg font-bold text-brand">
          {isIncoming && <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />}
          <span className="relative">{initials(primaryParty)}</span>
        </span>
        <p className="mt-2 max-w-[260px] truncate text-center text-base font-semibold text-text">{primaryParty}</p>
        <p className="truncate text-xs text-muted">{state.currentParty?.number || ""}</p>
        <p className="mt-1 text-xs font-medium text-muted">
          {isEstablished ? formatDuration(elapsed) : CALL_STATUS_LABEL[state.callStatus] || state.callStatus}
        </p>
      </div>

      {isIncoming ? (
        <div className="flex shrink-0 items-center justify-center gap-10 px-6 pb-6">
          <button
            type="button"
            onClick={() => send("decline")}
            className="flex flex-col items-center gap-1.5"
            aria-label="Decline call"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white">
              <PhoneOff size={22} />
            </span>
            <span className="text-xs font-medium text-danger">Decline</span>
          </button>
          {state.canReceive && (
            <button
              type="button"
              onClick={() => send("answer")}
              className="flex flex-col items-center gap-1.5"
              aria-label="Answer call"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
                <PhoneIncoming size={22} />
              </span>
              <span className="text-xs font-medium text-success">Answer</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-center gap-5 px-6 pb-4">
            <button
              type="button"
              onClick={() => send("toggleMute")}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                state.muted ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted hover:text-text"
              }`}
              aria-label={state.muted ? "Unmute" : "Mute"}
            >
              {state.muted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            {state.canHold && (
              <button
                type="button"
                onClick={() => send("toggleHold")}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                  state.held ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted hover:text-text"
                }`}
                aria-label={state.held ? "Resume call" : "Hold call"}
              >
                {state.held ? <Play size={17} /> : <Pause size={17} />}
              </button>
            )}
            {state.canSendDtmf && (
              <button
                type="button"
                onClick={() => setPanel((current) => (current === "keypad" ? null : "keypad"))}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                  panel === "keypad" ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted hover:text-text"
                }`}
                aria-label="Keypad"
              >
                <Grid3x3 size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={() => send("hangup")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-danger text-white"
              aria-label="Hang up"
            >
              <PhoneOff size={17} />
            </button>
          </div>

          {state.canBlindTransfer && (
            <div className="shrink-0 border-t border-border px-4 py-2 text-center">
              <button
                type="button"
                onClick={() => setPanel((current) => (current === "transfer" ? null : "transfer"))}
                className="text-xs font-medium text-muted hover:text-text"
              >
                {panel === "transfer" ? "Cancel transfer" : "Transfer call"}
              </button>
            </div>
          )}

          <AnimatePresence>
            {panel === "keypad" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="shrink-0 overflow-hidden border-t border-border px-4 py-3"
              >
                <div className="grid grid-cols-3 gap-2">
                  {DTMF_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => send("dtmf", { key })}
                      className="flex h-10 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-text transition-colors hover:bg-surface-3"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {panel === "transfer" && (
              <motion.form
                onSubmit={submitTransfer}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="shrink-0 overflow-hidden border-t border-border px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    value={transferNumber}
                    onChange={(event) => setTransferNumber(event.target.value)}
                    placeholder="Extension or number"
                    autoFocus
                    className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text outline-none transition-colors focus:border-brand"
                  />
                  <button
                    type="submit"
                    disabled={transferBusy}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white disabled:opacity-50"
                    aria-label="Send transfer"
                  >
                    <Send size={14} />
                  </button>
                </div>
                {transferError && <p className="mt-1.5 text-xs text-danger">{transferError}</p>}
              </motion.form>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
