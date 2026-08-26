import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  ChevronRight,
  CircleUserRound,
  Clock3,
  ContactRound,
  CreditCard,
  FileAudio,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Phone,
  PhoneCall,
  PhoneForwarded,
  Radio,
  RefreshCw,
  ShieldCheck,
  Signal,
  Users,
  UsersRound,
  X
} from "lucide-react";

import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import PageHeader from "./components/ui/PageHeader";
import Select from "./components/ui/Select";
import { SkeletonCards } from "./components/ui/Skeleton";
import StatusBadge from "./components/ui/StatusBadge";
import ThemeToggle from "./components/ui/ThemeToggle";
import { notifyError, notifySuccess } from "./lib/toast";
import { api, getToken, recordingBlob, setToken } from "./lib/api";

// Softphone stays eagerly imported and permanently mounted (see TenantApp) so
// an in-progress SIP call never drops when the agent navigates to another
// page. Everything else below is lazy-loaded to keep the initial bundle lean.
import Softphone from "./Softphone";

const LazyAutoDialer = lazy(() => import("./AutoDialer"));
const LazyOwnerDashboard = lazy(() => import("./OwnerDashboard"));
const LazyTeamsAdmin = lazy(() => import("./TeamsAdmin"));
const LazyCallLogsPage = lazy(() => import("./CallPages").then((m) => ({ default: m.CallLogsPage })));
const LazyRecordingsPage = lazy(() => import("./CallPages").then((m) => ({ default: m.RecordingsPage })));
const LazyContactsPage = lazy(() => import("./TenantManagement").then((m) => ({ default: m.ContactsPage })));
const LazyDidsPage = lazy(() => import("./TenantManagement").then((m) => ({ default: m.DidsPage })));
const LazyRolesAdmin = lazy(() => import("./TenantManagement").then((m) => ({ default: m.RolesAdmin })));
const LazyUsagePage = lazy(() => import("./TenantManagement").then((m) => ({ default: m.UsagePage })));
const LazyUsersAdmin = lazy(() => import("./TenantManagement").then((m) => ({ default: m.UsersAdmin })));
const LazySuperAdminApp = lazy(() => import("./SuperAdminApp"));

const NAVIGATION = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, permissions: ["VIEW_DASHBOARD"] },
  { id: "dialer", label: "Agent dialer", icon: PhoneCall, permissions: ["VIEW_DIALER"] },
  {
    id: "auto-dialer",
    label: "Auto Dialer",
    icon: PhoneForwarded,
    permissions: [
      "USE_AUTO_DIALER",
      "VIEW_CAMPAIGNS",
      "CREATE_CAMPAIGNS",
      "MANAGE_CAMPAIGNS",
      "UPLOAD_CONTACTS",
      "ASSIGN_CONTACTS",
      "VIEW_CAMPAIGN_REPORTS"
    ]
  },
  { id: "contacts", label: "Contacts", icon: ContactRound, permissions: ["VIEW_CONTACTS"] },
  { id: "call-logs", label: "Call Logs", icon: PhoneCall, permissions: ["VIEW_CALL_LOGS"] },
  { id: "recordings", label: "Recordings", icon: FileAudio, permissions: ["VIEW_RECORDINGS"] },
  { id: "supervisor", label: "Live supervisor", icon: Headphones, permissions: ["MONITOR_CALLS"] },
  { id: "reports", label: "Reports", icon: BarChart3, permissions: ["VIEW_REPORTS"] },
  { id: "users", label: "Users & Agents", icon: Users, permissions: ["VIEW_AGENTS", "MANAGE_AGENTS"] },
  { id: "teams", label: "Team Management", icon: UsersRound, permissions: ["VIEW_TEAMS", "MANAGE_TEAMS"] },
  { id: "roles", label: "Roles & Privileges", icon: ShieldCheck, permissions: ["VIEW_ROLES", "MANAGE_ROLES"] },
  { id: "dids", label: "Phone Numbers", icon: Phone, permissions: ["VIEW_DIDS", "MANAGE_DIDS", "MANAGE_AGENTS"] },
  { id: "usage", label: "Usage & Billing", icon: CreditCard, permissions: ["VIEW_USAGE", "VIEW_BILLING"] }
];

const AGENT_STATUS_OPTIONS = [
  { value: "OFFLINE", label: "Offline" },
  { value: "READY", label: "Ready" },
  { value: "PAUSED", label: "Paused" },
  { value: "WRAP_UP", label: "Wrap up" }
];

const DAYS_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" }
];

let socketClientLoader;
function ensureSocketClient() {
  if (window.io) return Promise.resolve();
  if (socketClientLoader) return socketClientLoader;
  socketClientLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Real-time client could not be loaded"));
    document.head.appendChild(script);
  });
  return socketClientLoader;
}

function hasAny(session, permissions) {
  const available = new Set(session?.permissions || []);
  return permissions.some((permission) => available.has(permission));
}

function formatSeconds(value = 0) {
  const seconds = Number(value) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function PageLoadingFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-7 w-56 animate-pulse rounded-lg bg-surface-2" />
      <SkeletonCards />
    </div>
  );
}

function Login({ onAuthenticated }) {
  const [workspace, setWorkspace] = useState(localStorage.getItem("ringnex.workspace") || "legacy");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await api("/auth/login", { method: "POST", body: { workspace, email, password } });
      setToken(payload.token);
      localStorage.setItem("ringnex.workspace", workspace);
      onAuthenticated(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-[480px_1fr]">
      <ThemeToggle className="absolute right-6 top-6 z-10" />

      <section className="flex flex-col justify-center border-b border-border bg-surface px-8 py-12 sm:px-14 lg:border-b-0 lg:border-r lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mx-auto w-full max-w-sm"
        >
          <div className="mb-9 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-blue-700 text-sm font-extrabold text-white shadow-[0_12px_30px_-8px_rgb(var(--rn-blue)/0.45)]">
              RN
            </span>
            <div>
              <p className="text-base font-bold text-text">Ringnex</p>
              <p className="text-xs text-muted">SaaS Contact Center</p>
            </div>
          </div>

          <span className="text-[11px] font-extrabold tracking-[0.16em] text-brand">WORKSPACE SIGN IN</span>
          <h1 className="mt-2 text-[38px] font-bold leading-tight tracking-tight text-text">Welcome back</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Use the setup/workspace assigned by your Ringnex Product Owner.
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              Workspace
              <input
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value.toLowerCase())}
                placeholder="abc-towing"
                autoComplete="organization"
                required
                className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
            <Button type="submit" loading={busy} icon={ShieldCheck} className="mt-1 w-full justify-center">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-8 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck size={16} />
            <span>Tenant-isolated session · WSS signaling · DTLS-SRTP media</span>
          </div>
        </motion.div>
      </section>

      <aside className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-surface-2 to-bg lg:flex">
        <div className="max-w-sm px-10 text-center">
          <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full bg-brand/25"
            />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-surface shadow-card">
              <Radio size={28} className="text-brand" />
            </span>
          </div>
          <h2 className="text-2xl font-bold leading-snug text-text">
            One app.
            <br />
            Your own workspace.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Roles, extensions, contacts, calls and DIDs are resolved after authentication.
          </p>
        </div>
      </aside>
    </main>
  );
}

const KPI_TONES = {
  blue: "bg-brand/10 text-brand",
  green: "bg-success-soft text-success",
  purple: "bg-violet-500/10 text-violet-500",
  orange: "bg-warning-soft text-warning"
};

function KpiCard({ label, value, detail, icon: Icon, tone = "blue" }) {
  return (
    <Card className="flex items-start gap-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${KPI_TONES[tone] || KPI_TONES.blue}`}>
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-text">{value}</p>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
      </div>
    </Card>
  );
}

function Dashboard({ user, tenant, liveCalls, amiConnected }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/reports/kpis?days=7").then(setReport).catch((e) => setError(e.message));
  }, []);

  const summary = report?.summary || {};
  const maximum = Math.max(1, ...(report?.daily || []).map((row) => Number(row.calls)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={tenant?.name || "WORKSPACE"}
        title={`Good day, ${user.name.split(" ")[0]}`}
        description={`${tenant?.workspace || ""} · ${user.roleName}`}
        actions={
          <StatusBadge tone={amiConnected ? "success" : "danger"} icon={Signal}>
            AMI {amiConnected ? "connected" : "offline"}
          </StatusBadge>
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {!report && !error ? (
        <SkeletonCards />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total calls" value={summary.total_calls || 0} detail="Last 7 days" icon={PhoneCall} />
          <KpiCard
            label="Completed"
            value={summary.completed_calls || 0}
            detail={`${summary.answer_rate || 0}% answer rate`}
            icon={ShieldCheck}
            tone="green"
          />
          <KpiCard
            label="Average talk"
            value={formatSeconds(summary.avg_talk_sec)}
            detail="Connected calls"
            icon={Clock3}
            tone="purple"
          />
          <KpiCard label="Live now" value={liveCalls.length} detail="Visible to your role" icon={Activity} tone="orange" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Call volume" description="Daily activity for the last 7 days" icon={BarChart3}>
          {report?.daily?.length ? (
            <div className="flex h-[180px] items-end gap-3">
              {report.daily.map((row) => (
                <div key={row.day} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-muted">{row.calls}</span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: Math.max(8, (Number(row.calls) / maximum) * 140) }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full rounded-t-md bg-gradient-to-t from-brand to-brand/70"
                  />
                  <span className="text-[11px] text-muted">
                    {new Date(row.day).toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No call data yet" />
          )}
        </Card>

        <Card
          title="Live activity"
          description="Tenant-isolated Asterisk channels"
          actions={<StatusBadge tone="danger">LIVE</StatusBadge>}
        >
          <div className="flex flex-col gap-3">
            {liveCalls.slice(0, 6).map((call) => (
              <div key={call.linkedid} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-bold text-text">
                  {(call.agent || "?").slice(-2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{call.agent || "Unassigned"}</p>
                  <p className="truncate text-xs text-muted">
                    {call.from} → {call.to}
                  </p>
                </div>
                <StatusBadge tone="success">{call.status}</StatusBadge>
              </div>
            ))}
            {!liveCalls.length && <EmptyState title="No active calls" />}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Supervisor({ liveCalls, presence, amiConnected, permissions }) {
  const [busyAction, setBusyAction] = useState(null);
  const can = (key) => permissions.includes(key);

  const monitor = async (linkedid, mode) => {
    setBusyAction(`${linkedid}:${mode}`);
    try {
      await api("/supervisor/monitor", { method: "POST", body: { linkedid, mode } });
      notifySuccess(`${mode[0].toUpperCase()}${mode.slice(1)} request sent to your SIP phone.`);
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="REAL-TIME FLOOR"
        title="Supervisor dashboard"
        description="Only agents and calls inside this tenant are eligible for monitoring."
        actions={
          <StatusBadge tone={amiConnected ? "success" : "danger"} icon={Radio}>
            {amiConnected ? "Live" : "AMI offline"}
          </StatusBadge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Agents online"
          value={presence.filter((p) => p.status === "ONLINE").length}
          detail={`${presence.length} tracked`}
          icon={Users}
          tone="green"
        />
        <KpiCard label="Live calls" value={liveCalls.length} detail="Right now" icon={PhoneCall} />
        <KpiCard
          label="Ringing"
          value={liveCalls.filter((c) => c.status === "RINGING").length}
          detail="Awaiting answer"
          icon={Clock3}
          tone="orange"
        />
      </div>

      <Card title="Active calls" description="Buttons are shown only when the assigned role permits that monitoring mode.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Agent</th>
                <th className="pb-2 pr-4">From</th>
                <th className="pb-2 pr-4">To</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Started</th>
                <th className="pb-2">Supervisor action</th>
              </tr>
            </thead>
            <tbody>
              {liveCalls.map((call) => (
                <tr key={call.linkedid} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4 text-text">{call.agent || "—"}</td>
                  <td className="py-3 pr-4 text-muted">{call.from}</td>
                  <td className="py-3 pr-4 text-muted">{call.to}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge tone="success">{call.status}</StatusBadge>
                  </td>
                  <td className="py-3 pr-4 text-muted">{formatDate(call.startedAt)}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      {can("LISTEN_LIVE_CALLS") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busyAction === `${call.linkedid}:listen`}
                          onClick={() => monitor(call.linkedid, "listen")}
                        >
                          Listen
                        </Button>
                      )}
                      {can("WHISPER_CALLS") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busyAction === `${call.linkedid}:whisper`}
                          onClick={() => monitor(call.linkedid, "whisper")}
                        >
                          Whisper
                        </Button>
                      )}
                      {can("BARGE_CALLS") && (
                        <Button
                          size="sm"
                          variant="danger"
                          loading={busyAction === `${call.linkedid}:barge`}
                          onClick={() => monitor(call.linkedid, "barge")}
                        >
                          Barge
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!liveCalls.length && <EmptyState title="No live calls to monitor" />}
        </div>
      </Card>
    </div>
  );
}

function Reports() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/reports/kpis?days=${days}`).then(setReport).catch((e) => setError(e.message));
  }, [days]);

  const summary = report?.summary || {};

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="PERFORMANCE INTELLIGENCE"
        title="Reports & KPIs"
        description="Tenant-scoped operational metrics calculated from Asterisk call events."
        actions={
          <Select
            className="w-44"
            isSearchable={false}
            options={DAYS_OPTIONS}
            value={DAYS_OPTIONS.find((option) => option.value === days)}
            onChange={(option) => setDays(option.value)}
          />
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Answer rate"
          value={`${summary.answer_rate || 0}%`}
          detail={`${summary.completed_calls || 0} completed`}
          icon={ShieldCheck}
          tone="green"
        />
        <KpiCard label="Talk time" value={formatSeconds(summary.total_talk_sec)} detail="Total connected" icon={Clock3} />
        <KpiCard label="Failed" value={summary.failed_calls || 0} detail="Review routing/CDR" icon={Activity} tone="orange" />
      </div>

      <Card title="Agent performance" description="Volume and handling time by agent">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Agent</th>
                <th className="pb-2 pr-4">Calls</th>
                <th className="pb-2 pr-4">Completed</th>
                <th className="pb-2 pr-4">Answer rate</th>
                <th className="pb-2 pr-4">Total talk</th>
                <th className="pb-2">Average talk</th>
              </tr>
            </thead>
            <tbody>
              {(report?.agents || []).map((row) => (
                <tr key={row.agent} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4 font-semibold text-text">{row.agent}</td>
                  <td className="py-3 pr-4 text-muted">{row.calls}</td>
                  <td className="py-3 pr-4 text-muted">{row.completed}</td>
                  <td className="py-3 pr-4 text-muted">{row.calls ? Math.round((row.completed / row.calls) * 100) : 0}%</td>
                  <td className="py-3 pr-4 text-muted">{formatSeconds(row.talk_sec)}</td>
                  <td className="py-3 text-muted">{formatSeconds(row.avg_talk_sec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report?.agents?.length && <EmptyState title="No performance data yet" />}
        </div>
      </Card>
    </div>
  );
}

function Sidebar({ navigation, page, setPage, sidebarOpen, setSidebarOpen, session, amiConnected }) {
  return (
    <>
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`console-sidebar !bg-surface !border-border ${sidebarOpen ? "open" : ""}`}>
        <div className="mb-6 flex items-center gap-3 px-1">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-blue-700 text-sm font-extrabold text-white">
            RN
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-text">{session.tenant?.name || "Ringnex"}</p>
            <p className="truncate text-xs text-muted">{session.tenant?.workspace || "Contact Center"}</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {navigation.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setPage(id);
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-brand/10 text-brand" : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <Icon size={17} />
                <span className="flex-1 text-left">{label}</span>
                {active && <ChevronRight size={14} />}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-border px-3 py-3">
          <span className={`h-2 w-2 shrink-0 rounded-full ${amiConnected ? "bg-success shadow-[0_0_0_4px_rgb(var(--rn-green)/0.15)]" : "bg-muted"}`} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-text">Asterisk AMI</p>
            <p className="truncate text-[11px] text-muted">{amiConnected ? "Connected" : "Offline"}</p>
          </div>
        </div>
      </aside>
    </>
  );
}

function Header({ session, ownerAccount, activeLabel, agentStatus, changeStatus, logout, setSidebarOpen }) {
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

function TenantApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [liveCalls, setLiveCalls] = useState([]);
  const [presence, setPresence] = useState([]);
  const [amiConnected, setAmiConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState("OFFLINE");

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api("/auth/session").then(setSession).catch(() => setToken("")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    let socket;
    ensureSocketClient()
      .then(() => {
        if (cancelled) return;
        socket = window.io({ path: "/socket.io", auth: { token: getToken() } });
        socket.on("system:state", (state) => {
          setAmiConnected(Boolean(state.ami));
          setLiveCalls(state.calls || []);
        });
        socket.on("ami:status", (state) => setAmiConnected(Boolean(state.connected)));
        socket.on("call:update", (call) =>
          setLiveCalls((calls) => [...calls.filter((item) => item.linkedid !== call.linkedid), call])
        );
        socket.on("call:ended", (call) =>
          setLiveCalls((calls) => calls.filter((item) => item.linkedid !== call.linkedid))
        );
        socket.on("presence:update", (item) =>
          setPresence((items) => [...items.filter((entry) => entry.agent !== item.agent), item])
        );
      })
      .catch(() => setAmiConnected(false));
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [session]);

  useEffect(() => {
    if (!session || !hasAny(session, ["MONITOR_CALLS", "VIEW_REPORTS"])) return;
    api("/supervisor/live")
      .then((state) => {
        setLiveCalls(state.calls || []);
        setPresence(state.presence || []);
        setAmiConnected(Boolean(state.ami));
      })
      .catch(() => undefined);
  }, [session]);

  const ownerAccount = session?.role?.name === "Tenant Owner";
  const navigation = useMemo(
    () =>
      NAVIGATION.filter((item) => {
        if (ownerAccount && ["dialer", "supervisor"].includes(item.id)) return false;
        return hasAny(session, item.permissions);
      }),
    [session, ownerAccount]
  );
  useEffect(() => {
    if (navigation.length && !navigation.some((item) => item.id === page)) setPage(navigation[0].id);
  }, [navigation, page]);

  const changeStatus = async (status) => {
    setAgentStatus(status);
    await api("/agent/status", { method: "POST", body: { status } }).catch(() => undefined);
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setToken("");
    setSession(null);
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-content-center gap-3 justify-items-center bg-bg text-muted">
        <RefreshCw className="animate-spin text-brand" size={26} />
        <span className="text-sm">Loading Ringnex…</span>
      </div>
    );
  }
  if (!session) return <Login onAuthenticated={setSession} />;

  const renderPage = () => {
    if (page === "dialer") return null;
    if (page === "auto-dialer") {
      return <LazyAutoDialer permissions={session.permissions || []} sipReady={!ownerAccount && Boolean(session.sip)} />;
    }
    if (page === "contacts") return <LazyContactsPage />;
    if (page === "call-logs") return <LazyCallLogsPage />;
    if (page === "recordings") return <LazyRecordingsPage />;
    if (page === "supervisor") {
      return (
        <Supervisor
          liveCalls={liveCalls}
          presence={presence}
          amiConnected={amiConnected}
          permissions={session.permissions || []}
        />
      );
    }
    if (page === "reports") return <Reports />;
    if (page === "users") return <LazyUsersAdmin permissions={session.permissions || []} />;
    if (page === "teams") return <LazyTeamsAdmin />;
    if (page === "roles") return <LazyRolesAdmin />;
    if (page === "dids") return <LazyDidsPage />;
    if (page === "usage") return <LazyUsagePage />;
    if (ownerAccount) {
      return (
        <LazyOwnerDashboard tenant={session.tenant} user={session.user} amiConnected={amiConnected} socketLiveCalls={liveCalls} />
      );
    }
    return <Dashboard user={session.user} tenant={session.tenant} liveCalls={liveCalls} amiConnected={amiConnected} />;
  };

  const activeNav = navigation.find((item) => item.id === page);

  return (
    <div className="console-shell !bg-bg">
      <Sidebar
        navigation={navigation}
        page={page}
        setPage={setPage}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        session={session}
        amiConnected={amiConnected}
      />
      <div className="console-content">
        <Header
          session={session}
          ownerAccount={ownerAccount}
          activeLabel={activeNav?.label}
          agentStatus={agentStatus}
          changeStatus={changeStatus}
          logout={logout}
          setSidebarOpen={setSidebarOpen}
        />
        <main className="console-main">
          {!ownerAccount && session.sip && (
            <div style={{ display: page === "dialer" ? "block" : "none" }}>
              <div className="embedded-softphone">
                <Softphone sip={session.sip} permissions={session.permissions || []} />
              </div>
            </div>
          )}
          {page !== "dialer" && (
            <Suspense fallback={<PageLoadingFallback />}>{renderPage()}</Suspense>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  if (window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")) {
    return (
      <Suspense
        fallback={
          <div className="grid min-h-screen place-content-center gap-3 justify-items-center bg-bg text-muted">
            <RefreshCw className="animate-spin text-brand" size={26} />
            <span className="text-sm">Loading Product Owner portal…</span>
          </div>
        }
      >
        <LazySuperAdminApp />
      </Suspense>
    );
  }
  return <TenantApp />;
}
