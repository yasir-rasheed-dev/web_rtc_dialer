import { CircleUserRound, LogOut, Menu } from "lucide-react";

import Button from "../ui/Button";
import Select from "../ui/Select";
import ThemeToggle from "../ui/ThemeToggle";
import { hasAny } from "../../lib/permissions";

const AGENT_STATUS_OPTIONS = [
  { value: "OFFLINE", label: "Offline" },
  { value: "READY", label: "Ready" },
  { value: "PAUSED", label: "Paused" },
  { value: "WRAP_UP", label: "Wrap up" }
];

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
