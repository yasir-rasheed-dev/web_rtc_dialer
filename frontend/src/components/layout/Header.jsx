import { useEffect, useState } from "react";
import { CircleUserRound, LogOut, Menu, Phone } from "lucide-react";

import Button from "../ui/Button";
import Select from "../ui/Select";
import ThemeToggle from "../ui/ThemeToggle";
import { hasAny } from "../../lib/permissions";
import { formatDuration } from "../../lib/phone";

const AGENT_STATUS_OPTIONS = [
  { value: "OFFLINE", label: "Offline" },
  { value: "READY", label: "Ready" },
  { value: "PAUSED", label: "Paused" },
  { value: "WRAP_UP", label: "Wrap up" }
];

// Desktop-only: the call popup window (see DesktopCallBridge.jsx) can be
// closed mid-call without ending it, so this stays visible the whole time
// a call is active as the way back to it — clicking it just re-shows/
// focuses the popup, which already has the live state. Reads the same
// "ringnex:softphone-state" broadcast GlobalCallOverlay/DialerPanel do; on
// the web window.ringnexDesktop never exists, so this renders nothing
// there.
function DesktopCallPill() {
  const [state, setState] = useState(() => window.ringnexSoftphoneState || { callStatus: "idle" });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const onState = (event) => setState(event.detail || { callStatus: "idle" });
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

  if (!window.ringnexDesktop || state.callStatus === "idle") return null;

  const label = state.callStatus === "active" || state.callStatus === "held" ? formatDuration(elapsed) : state.callStatus;

  return (
    <button
      type="button"
      onClick={() => window.ringnexDesktop.callWindow.show()}
      className="flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success-soft/80"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      <Phone size={13} />
      <span>{label}</span>
    </button>
  );
}

export default function Header({ session, ownerAccount, activeLabel, agentStatus, changeStatus, logout, setSidebarOpen }) {
  const canSeeAgentState = !ownerAccount && hasAny(session, ["VIEW_DIALER"]) && session.sip;

  return (
    <header className="console-header !bg-surface/95 !border-border">
      <button
        onClick={() => setSidebarOpen(true)}
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="hidden text-sm font-semibold text-text sm:block">{activeLabel}</div>

      <div className="ml-auto flex items-center gap-3">
        <DesktopCallPill />
        <ThemeToggle />
        {canSeeAgentState && (
          <Select
            className="w-36"
            isSearchable={false}
            options={AGENT_STATUS_OPTIONS}
            value={AGENT_STATUS_OPTIONS.find((option) => option.value === agentStatus)}
            onChange={(option) => changeStatus(option.value)}
          />
        )}
        <div className="hidden items-center gap-2.5 border-l border-border pl-3 sm:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-muted">
            <CircleUserRound size={18} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-text">{session.user.name}</p>
            <p className="text-xs text-muted">{session.role?.name || session.user.roleName}</p>
          </div>
        </div>
        <Button variant="icon" size="icon" icon={LogOut} onClick={logout} title="Sign out" aria-label="Sign out" />
      </div>
    </header>
  );
}
