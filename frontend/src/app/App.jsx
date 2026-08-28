import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ContactRound,
  CreditCard,
  FileAudio,
  Headphones,
  LayoutDashboard,
  MessageCircle,
  Phone,
  PhoneCall,
  PhoneForwarded,
  RefreshCw,
  ShieldCheck,
  Users,
  UsersRound
} from "lucide-react";

import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from "../components/layout/Sidebar";
import Header from "../components/layout/Header";
import { SkeletonCards } from "../components/ui/Skeleton";
import { notifyError } from "../lib/toast";
import { api, getToken, setToken } from "../lib/api";
import { API_BASE } from "../lib/apiConfig";
import { hasAny } from "../lib/permissions";
import { useTeamChatUnreadCount } from "../lib/teamChatBadge";
import Login from "../pages/login/Login";
import Dashboard from "../pages/dashboard/Dashboard";
import Supervisor from "../pages/supervisor/Supervisor";

// Softphone stays eagerly imported and permanently mounted (see TenantApp) so
// an in-progress SIP call never drops when the agent navigates to another
// page. Everything else below is lazy-loaded to keep the initial bundle lean.
import GlobalCallOverlay from "../components/ui/GlobalCallOverlay";
import Softphone from "../pages/softphone/Softphone";

const LazyAutoDialer = lazy(() => import("../pages/auto-dialer/AutoDialer"));
const LazyOwnerDashboard = lazy(() => import("../pages/owner-dashboard/OwnerDashboard"));
const LazyTeamsAdmin = lazy(() => import("../pages/teams/TeamsAdmin"));
const LazyCallLogsPage = lazy(() => import("../pages/calls/CallLogsPage"));
const LazyRecordingsPage = lazy(() => import("../pages/calls/RecordingsPage"));
const LazyReportsHub = lazy(() => import("../pages/reports/ReportsHub"));
const LazyTeamChat = lazy(() => import("../pages/team-chat/TeamChat"));
const LazyContactsPage = lazy(() => import("../pages/contacts/ContactsPage"));
const LazyDidsPage = lazy(() => import("../pages/dids/DidsPage"));
const LazyRolesAdmin = lazy(() => import("../pages/roles/RolesAdmin"));
const LazyUsagePage = lazy(() => import("../pages/usage/UsagePage"));
const LazyUsersAdmin = lazy(() => import("../pages/users/UsersAdmin"));
const LazySuperAdminApp = lazy(() => import("../pages/super-admin/SuperAdminApp"));

const NAVIGATION = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, permissions: ["VIEW_DASHBOARD"] },
  { id: "team-chat", label: "Team Chat", icon: MessageCircle, permissions: ["VIEW_DASHBOARD"] },
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

let socketClientLoader;
function ensureSocketClient() {
  if (window.io) return Promise.resolve();
  if (socketClientLoader) return socketClientLoader;
  socketClientLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${API_BASE}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Real-time client could not be loaded"));
    document.head.appendChild(script);
  });
  return socketClientLoader;
}

function PageLoadingFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-7 w-56 animate-pulse rounded-lg bg-surface-2" />
      <SkeletonCards />
    </div>
  );
}

function TenantApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ringnex.sidebarCollapsed") === "1");
  const [liveCalls, setLiveCalls] = useState([]);
  const [presence, setPresence] = useState([]);
  const [amiConnected, setAmiConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState("OFFLINE");
  // Live per-agent business status (READY/PAUSED/WRAP_UP/OFFLINE) keyed by
  // userId, pushed in real time via the "agent:status" socket event — lets
  // the Owner and Supervisor dashboards reflect a status change instantly
  // instead of waiting for their next poll.
  const [liveAgentStatus, setLiveAgentStatus] = useState({});
  const [supervisorAgents, setSupervisorAgents] = useState([]);
  const teamChatUnread = useTeamChatUnreadCount(session);

  useEffect(() => {
    localStorage.setItem("ringnex.sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

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
        // With no API_BASE (normal web build), omitting the URL connects to
        // the current page's origin — unchanged from before. The Electron
        // build sets API_BASE to the hosted backend's absolute origin, since
        // the app itself is served from a different ("app://…") origin.
        socket = API_BASE
          ? window.io(API_BASE, { path: "/socket.io", auth: { token: getToken() } })
          : window.io({ path: "/socket.io", auth: { token: getToken() } });
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
        socket.on("agent:status", (item) =>
          setLiveAgentStatus((map) => ({ ...map, [item.userId]: item.status }))
        );
        // Pushed by the server the instant a newer login elsewhere
        // supersedes this session — sign out here immediately rather than
        // waiting for the next API call to hit the revoked-session 401.
        socket.on("auth:force-logout", (item) => {
          notifyError(item?.message || "You were signed out because this account logged in on another device.");
          setToken("");
          setSession(null);
        });
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
        setSupervisorAgents(state.agents || []);
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
    if (page === "team-chat") return <LazyTeamChat session={session} />;
    if (page === "auto-dialer") {
      return <LazyAutoDialer permissions={session.permissions || []} sipReady={!ownerAccount && Boolean(session.sip)} />;
    }
    if (page === "contacts") return <LazyContactsPage permissions={session.permissions || []} />;
    if (page === "call-logs") return <LazyCallLogsPage />;
    if (page === "recordings") return <LazyRecordingsPage />;
    if (page === "supervisor") {
      return (
        <Supervisor
          liveCalls={liveCalls}
          presence={presence}
          agents={supervisorAgents}
          liveAgentStatus={liveAgentStatus}
          amiConnected={amiConnected}
          permissions={session.permissions || []}
        />
      );
    }
    if (page === "reports") return <LazyReportsHub />;
    if (page === "users") return <LazyUsersAdmin permissions={session.permissions || []} />;
    if (page === "teams") return <LazyTeamsAdmin />;
    if (page === "roles") return <LazyRolesAdmin permissions={session.permissions || []} />;
    if (page === "dids") return <LazyDidsPage permissions={session.permissions || []} />;
    if (page === "usage") return <LazyUsagePage />;
    if (ownerAccount) {
      return (
        <LazyOwnerDashboard
          tenant={session.tenant}
          user={session.user}
          amiConnected={amiConnected}
          socketLiveCalls={liveCalls}
          liveAgentStatus={liveAgentStatus}
        />
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
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        badges={{ "team-chat": teamChatUnread }}
      />
      <div
        className="console-content transition-[margin-left] duration-200 lg:!ml-[var(--rn-sidebar-w)]"
        style={{ "--rn-sidebar-w": `${collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH}px` }}
      >
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
      {!ownerAccount && session.sip && <GlobalCallOverlay onDialerPage={page === "dialer"} />}
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
