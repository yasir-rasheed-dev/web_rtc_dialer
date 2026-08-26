import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Pause, PhoneIncoming, PhoneOff, Play } from "lucide-react";

import { formatDuration, initials } from "../../lib/phone";

const IDLE_STATE = {
  registered: false,
  callStatus: "idle",
  currentParty: { number: "", displayName: "" },
  connectedAt: null,
  muted: false,
  held: false,
  canReceive: false,
  canHold: false
};

/**
 * Renders the incoming-call popup and a compact in-call control bar on top
 * of whatever page the agent is currently on. Softphone.jsx stays the only
 * component that owns SIP/call state — this just reads the broadcast it
 * already publishes (window.ringnexSoftphoneState + the
 * "ringnex:softphone-state" event, extended with currentParty/connectedAt/
 * muted/held/canReceive/canHold) and drives it through the matching
 * window.ringnexAnswerCall/DeclineCall/Hangup/ToggleMute/ToggleHold globals,
 * the same call-through-a-global-function pattern window.ringnexDial
 * already established for the Auto Dialer. Mounted once at the app shell
 * level so it isn't unmounted by page navigation, unlike the embedded
 * Softphone UI which is hidden (not unmounted) off the dialer page.
 */
export default function GlobalCallOverlay({ onDialerPage = false }) {
  const [state, setState] = useState(() => window.ringnexSoftphoneState || IDLE_STATE);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const onState = (event) => setState(event.detail || IDLE_STATE);
    window.addEventListener("ringnex:softphone-state", onState);
    return () => window.removeEventListener("ringnex:softphone-state", onState);
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

  const callInProgress = state.callStatus !== "idle";
  const primaryParty = state.currentParty?.displayName || state.currentParty?.number || "";

  return (
    <>
      <AnimatePresence>
        {state.callStatus === "incoming" && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed right-6 top-6 z-[70] w-80 rounded-2xl border border-border bg-surface p-5 shadow-card"
            role="alertdialog"
            aria-label="Incoming call"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-base font-bold text-brand">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
                <span className="relative">{initials(primaryParty)}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{state.currentParty?.displayName || "Incoming call"}</p>
                <p className="truncate text-xs text-muted">{state.currentParty?.number || "Unknown caller"}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={() => window.ringnexDeclineCall?.()}
                className="flex flex-col items-center gap-1.5"
                aria-label="Decline call"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger text-white">
                  <PhoneOff size={19} />
                </span>
                <span className="text-xs font-medium text-danger">Decline</span>
              </button>
              {state.canReceive && (
                <button
                  type="button"
                  onClick={() => window.ringnexAnswerCall?.()}
                  className="flex flex-col items-center gap-1.5"
                  aria-label="Answer call"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success text-white">
                    <PhoneIncoming size={19} />
                  </span>
                  <span className="text-xs font-medium text-success">Answer</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full call UI (dialpad, transfer, DTMF, ...) already lives on the dialer
          page, so this compact bar only shows up elsewhere — just enough to
          see who's on the line and keep mute/hold/hangup one click away. */}
      <AnimatePresence>
        {callInProgress && state.callStatus !== "incoming" && !onDialerPage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed bottom-6 right-6 z-[70] flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
              {initials(primaryParty)}
            </span>
            <div className="min-w-0">
              <p className="max-w-[140px] truncate text-sm font-medium text-text">{primaryParty || "Unknown"}</p>
              <p className="text-xs text-muted">
                {state.callStatus === "active" || state.callStatus === "held" ? formatDuration(elapsed) : state.callStatus}
              </p>
            </div>
            <div className="ml-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => window.ringnexToggleMute?.()}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  state.muted ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted hover:text-text"
                }`}
                aria-label={state.muted ? "Unmute" : "Mute"}
              >
                {state.muted ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
              {state.canHold && (
                <button
                  type="button"
                  onClick={() => window.ringnexToggleHold?.()}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    state.held ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted hover:text-text"
                  }`}
                  aria-label={state.held ? "Resume call" : "Hold call"}
                >
                  {state.held ? <Play size={14} /> : <Pause size={14} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => window.ringnexHangup?.()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white"
                aria-label="Hang up"
              >
                <PhoneOff size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
