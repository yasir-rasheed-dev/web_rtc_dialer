import { useEffect, useState } from "react";
import { CircleUserRound, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Phone, RotateCw } from "lucide-react";

import Button from "../ui/Button";
import Select from "../ui/Select";
import ThemeToggle from "../ui/ThemeToggle";
import { hasAny } from "../../lib/permissions";
import { formatDuration } from "../../lib/phone";
import { confirmModal } from "../../lib/modal";
import { getWorkspaceTz } from "../../lib/tz";

// Reload safely: on the web a mid-call reload tears down the SIP/WebRTC
// session and drops the call, so confirm first. On the desktop app the
// call runs in its own popup window and survives a main-window reload, so
// no prompt is needed there.
async function reloadWithCallGuard() {
  const onCall = window.ringnexSoftphoneState && window.ringnexSoftphoneState.callStatus !== "idle";
  if (onCall && !window.ringnexDesktop) {
    const ok = await confirmModal({
      title: "Reload while on a call?",
      message: "You are on a live call. Reloading the page will end the call. Continue?",
      confirmText: "Reload anyway",
      cancelText: "Stay on call",
      danger: true
    });
    if (!ok) return;
  }
  window.location.reload();
}

const AGENT_STATUS_OPTIONS = [
  { value: "OFFLINE", label: "Offline" },
  { value: "READY", label: "Ready" },
  { value: "PAUSED", label: "Paused" },
  { value: "WRAP_UP", label: "Wrap up" },
  // Set automatically by the backend the moment an agent is bridged to a
  // call (see applyAgentStatus in server.js), never picked here — kept
  // disabled so the dropdown shows it correctly instead of going blank
  // (AGENT_STATUS_OPTIONS.find(...) below would find nothing without
  // this entry) while still blocking it as a manual choice.
  { value: "ON_CALL", label: "On call", isDisabled: true }
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

// Live clock in the workspace's timezone (set from session.tenant.timezone
// via lib/tz). Replaces the old AMI "Connected" pill in the header.
function WorkspaceClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const tz = getWorkspaceTz();
  let time = "";
  let zone = "";
  try {
    time = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: tz
    }).format(now);
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone: tz }).formatToParts(now);
    zone = parts.find((p) => p.type === "timeZoneName")?.value || tz;
  } catch {
    time = now.toLocaleTimeString();
  }
  return (
    <span
      className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-text"
      title={`Workspace time — ${tz}`}
    >
      {time}
      <span className="hidden font-sans text-[10px] font-medium text-muted md:inline">{zone}</span>
    </span>
  );
}

export default function Header({
  session,
  ownerAccount,
  activeLabel,
  agentStatus,
  changeStatus,
  logout,
  setSidebarOpen,
  amiConnected,
  collapsed,
  setCollapsed
}) {
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
      <button
        onClick={() => setCollapsed((current) => !current)}
        className="hidden rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text lg:block"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <div className="hidden text-sm font-semibold text-text sm:block">{activeLabel}</div>

      <div className="ml-auto flex items-center gap-3">
        <WorkspaceClock />
        <DesktopCallPill />
        <Button
          variant="icon"
          size="icon"
          icon={RotateCw}
          onClick={reloadWithCallGuard}
          title="Refresh page"
          aria-label="Refresh page"
        />
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
