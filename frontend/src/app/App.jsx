import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  BarChart3,
  ContactRound,
  CreditCard,
  FileAudio,
  Headphones,
  Headset,
  LayoutDashboard,
  MessageCircle,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
  UsersRound
} from "lucide-react";

import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from "../components/layout/Sidebar";
import Header from "../components/layout/Header";
import { SkeletonCards } from "../components/ui/Skeleton";
import { notifyError, notifyWarning } from "../lib/toast";
import { api, getToken, getRefreshToken, refreshSession, clearAuth } from "../lib/api";
import { API_BASE } from "../lib/apiConfig";
import { hasAny } from "../lib/permissions";
import { confirmModal } from "../lib/modal";
import { setWorkspaceTz } from "../lib/tz";
import { useTeamChatUnreadCount } from "../lib/teamChatBadge";
import { useFollowUpsBadge } from "../lib/followUpsBadge";
import { useMissedCallsBadge } from "../lib/missedCallsBadge";
import { useVoicemailBadge } from "../lib/voicemailBadge";
import Login from "../pages/login/Login";
import Dashboard from "../pages/dashboard/Dashboard";
import Supervisor from "../pages/supervisor/Supervisor";

// Softphone stays eagerly imported and permanently mounted (see TenantApp) so
// an in-progress SIP call never drops when the agent navigates to another
// page. Everything else below is lazy-loaded to keep the initial bundle lean.
import EndCallPopup from "../components/ui/EndCallPopup";
import GlobalCallOverlay from "../components/ui/GlobalCallOverlay";
import DesktopCallBridge from "../components/DesktopCallBridge";
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
const LazyTollFreePage = lazy(() => import("../pages/toll-free/TollFreePage"));
const LazyDncManagement = lazy(() => import("../pages/dnc/DncManagement"));
const LazyLeadsPage = lazy(() => import("../pages/leads/LeadsPage"));
const LazyFollowUpsPage = lazy(() => import("../pages/leads/FollowUpsPage"));
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
  { id: "leads", label: "Leads", icon: Target, permissions: ["VIEW_LEADS"] },
  { id: "follow-ups", label: "Follow-ups", icon: AlarmClock, permissions: ["VIEW_LEADS"] },
  { id: "call-logs", label: "Call Logs", icon: PhoneCall, permissions: ["VIEW_CALL_LOGS"] },
  { id: "recordings", label: "Recordings", icon: FileAudio, permissions: ["VIEW_RECORDINGS"] },
  { id: "supervisor", label: "Live supervisor", icon: Headphones, permissions: ["MONITOR_CALLS"] },
  { id: "reports", label: "Reports", icon: BarChart3, permissions: ["VIEW_REPORTS"] },
  { id: "users", label: "Users & Agents", icon: Users, permissions: ["VIEW_AGENTS", "MANAGE_AGENTS"] },
  { id: "teams", label: "Team Management", icon: UsersRound, permissions: ["VIEW_TEAMS", "MANAGE_TEAMS"] },
  { id: "roles", label: "Roles & Privileges", icon: ShieldCheck, permissions: ["VIEW_ROLES", "MANAGE_ROLES"] },
  { id: "dids", label: "Phone Numbers", icon: Phone, permissions: ["VIEW_DIDS", "MANAGE_DIDS", "MANAGE_AGENTS"] },
  { id: "toll-free", label: "Toll-Free", icon: Headset, permissions: ["VIEW_TOLL_FREE", "MANAGE_TOLL_FREE_CAMPAIGNS"] },
  { id: "dnc", label: "Do-Not-Call", icon: PhoneOff, permissions: ["MANAGE_DNC"] },
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
  const [loading, setLoading] = useState(Boolean(getToken() || getRefreshToken()));
  // Persist the current page so a reload (or the header Refresh button)
  // lands back where the user was, not on the dashboard.
  const [page, setPage] = useState(() => {
    try { return localStorage.getItem("ringnex.page") || "dashboard"; } catch { return "dashboard"; }
  });
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
  const missedCalls = useMissedCallsBadge(session);
  const voicemails = useVoicemailBadge(session);
  const followUps = useFollowUpsBadge(session);

  useEffect(() => {
    localStorage.setItem("ringnex.sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    try { localStorage.setItem("ringnex.page", page); } catch { /* private mode */ }
  }, [page]);

  useEffect(() => {
    if (!getToken() && !getRefreshToken()) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // Reopened tab / restarted app: access token may be gone or stale
        // but the refresh token in localStorage brings the session back
        // with no visible login.
        if (!getToken()) await refreshSession();
        const restored = await api("/auth/session");
        setSession(restored);
      } catch {
        clearAuth();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Every date/time on screen (reports, call logs, the header clock)
  // renders in the workspace's timezone, not the viewer's — keep the
  // shared formatter in sync with whatever the session says.
  useEffect(() => {
    setWorkspaceTz(session?.tenant?.timezone || null);
  }, [session?.tenant?.timezone]);

  // request() fires this when the access token expired AND a silent
  // refresh failed (refresh token gone / revoked / reused) — drop to the
  // login screen instead of leaving a half-dead session on screen.
  useEffect(() => {
    const onExpired = () => {
      clearAuth();
      setSession(null);
    };
    window.addEventListener("ringnex:auth-expired", onExpired);
    return () => window.removeEventListener("ringnex:auth-expired", onExpired);
  }, []);

  // Seeds the header dropdown from the real backend value (sanitizeUser()
  // already includes users.status) the moment session loads/refreshes —
  // otherwise it would sit on the useState("OFFLINE") default until the
  // first agent:status socket event arrives, which can lag a beat behind
  // login's own auto-READY.
  useEffect(() => {
    if (session?.user?.status) setAgentStatus(session.user.status);
  }, [session?.user?.status]);

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
        // auth as a callback (not a static object) so every (re)connect
        // picks up the CURRENT access token — it may have been rotated by
        // a silent refresh since this socket first connected.
        const authCb = (cb) => cb({ token: getToken() });
        socket = API_BASE
          ? window.io(API_BASE, { path: "/socket.io", auth: authCb })
          : window.io({ path: "/socket.io", auth: authCb });
        socket.on("system:state", (state) => {
          setAmiConnected(Boolean(state.ami));
          setLiveCalls(state.calls || []);
        });
        socket.on("ami:status", (state) => setAmiConnected(Boolean(state.connected)));
        socket.on("call:update", (call) =>
          setLiveCalls((calls) => [...calls.filter((item) => item.linkedid !== call.linkedid), call])
        );
        socket.on("call:ended", (call) => {
          setLiveCalls((calls) => calls.filter((item) => item.linkedid !== call.linkedid));
          missedCalls.recordCallEnded(call);
        });
        socket.on("presence:update", (item) =>
          setPresence((items) => [...items.filter((entry) => entry.agent !== item.agent), item])
        );
        socket.on("agent:status", (item) => {
          setLiveAgentStatus((map) => ({ ...map, [item.userId]: item.status }));
          // Keeps the header's own Ready/Paused/On call dropdown in sync
          // with the real backend status — applyAgentStatus() sets this
          // automatically (READY on login, ON_CALL the moment a call
          // bridges), not just when the agent picks something themselves.
          if (item.userId === session.user.id) setAgentStatus(item.status);
        });
        // Pushed by callTracker.js the moment a declined/unanswered direct
        // PSTN call falls through to voicemail for this agent (never fires
        // for the toll-free queue path) — see voicemailBadge.js.
        socket.on("voicemail:new", () => voicemails.recordNew());
        // Pushed by the server the instant a newer login elsewhere
        // supersedes this session — sign out here immediately rather than
        // waiting for the next API call to hit the revoked-session 401.
        socket.on("auth:force-logout", (item) => {
          notifyError(item?.message || "You were signed out because this account logged in on another device.");
          clearAuth();
          setSession(null);
        });
        // Soft version: this account signed in elsewhere, but there's a
        // live call here — stay usable through the call + wrap-up. The
        // server sends "auth:force-logout" to THIS device once the next
        // call starts (or the grace cap passes).
        socket.on("auth:session-superseded", (item) => {
          notifyWarning(
            item?.message ||
              "You've signed in on another device. This session will end when your current call is over."
          );
        });
      })
      .catch(() => setAmiConnected(false));
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [session, missedCalls.recordCallEnded, voicemails.recordNew]);

  // Live-calls reconciliation. Socket call:update/call:ended keep the board
  // fresh in real time, but a supervisor monitor leg can briefly hold a
  // finished call's channel open, so we also re-sync to server truth every
  // ~10s (and expose refreshLive() for the manual buttons). This makes any
  // stuck row self-heal without a page reload.
  const canSeeLive = session && hasAny(session, ["MONITOR_CALLS", "VIEW_REPORTS"]);
  const refreshLive = useCallback(() => {
    if (!canSeeLive) return Promise.resolve();
    return api("/supervisor/live")
      .then((state) => {
        setLiveCalls(state.calls || []);
        setPresence(state.presence || []);
        setSupervisorAgents(state.agents || []);
        setAmiConnected(Boolean(state.ami));
      })
      .catch(() => undefined);
  }, [canSeeLive]);

  useEffect(() => {
    if (!canSeeLive) return undefined;
    refreshLive();
    const t = setInterval(refreshLive, 10000);
    return () => clearInterval(t);
  }, [canSeeLive, refreshLive]);

  const ownerAccount = session?.role?.name === "Tenant Owner";
  const navigation = useMemo(
    () =>
      NAVIGATION.filter((item) => {
        if (ownerAccount && ["dialer", "supervisor"].includes(item.id)) return false;
        // Super Admin-controlled, tenant-wide — on top of whatever the
        // role's own permissions already say. Defaults to true (matches
        // the DB column's own default) so a session predating these flags
        // isn't suddenly missing nav items.
        if (item.id === "auto-dialer" && session?.tenant?.canUseAutoDialer === false) return false;
        if (item.id === "toll-free" && session?.tenant?.canUseTollFree === false) return false;
        // Opt-in (defaults to false, unlike the two above) — a brand-new
        // feature, so hidden unless Super Admin has explicitly turned it on
        // for this workspace.
        if ((item.id === "leads" || item.id === "follow-ups") && !session?.tenant?.canUseLeads) return false;
        return hasAny(session, item.permissions);
      }),
    [session, ownerAccount]
  );
  useEffect(() => {
    if (navigation.length && !navigation.some((item) => item.id === page)) setPage(navigation[0].id);
  }, [navigation, page]);

  useEffect(() => {
    if (page === "call-logs") missedCalls.markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const changeStatus = async (status) => {
    setAgentStatus(status);
    await api("/agent/status", { method: "POST", body: { status } }).catch(() => undefined);
  };
  const logout = async () => {
    const confirmed = await confirmModal({
      title: "Sign out?",
      message: "You'll need to sign back in to pick up where you left off.",
      confirmText: "Sign out"
    });
    if (!confirmed) return;
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearAuth();
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
    if (page === "leads") return <LazyLeadsPage permissions={session.permissions || []} />;
    if (page === "follow-ups") return <LazyFollowUpsPage />;
    if (page === "call-logs")
      return <LazyCallLogsPage permissions={session.permissions || []} onVoicemailHeard={voicemails.markHeard} />;
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
          onRefreshLive={refreshLive}
        />
      );
    }
    if (page === "reports") return <LazyReportsHub session={session} />;
    if (page === "users") return <LazyUsersAdmin permissions={session.permissions || []} />;
    if (page === "teams") return <LazyTeamsAdmin />;
    if (page === "roles") return <LazyRolesAdmin permissions={session.permissions || []} tenant={session.tenant || {}} />;
    if (page === "dids") return <LazyDidsPage permissions={session.permissions || []} canPurchaseNumbers={session.tenant?.canPurchaseNumbers !== false} />;
    if (page === "toll-free") return <LazyTollFreePage permissions={session.permissions || []} isOwner={ownerAccount} />;
    if (page === "dnc") return <LazyDncManagement />;
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
        collapsed={collapsed}
        logout={logout}
        badges={{ "team-chat": teamChatUnread, "call-logs": missedCalls.count + voicemails.count, "follow-ups": followUps.count }}
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
          amiConnected={amiConnected}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />
        <main
          className="console-main"
          style={page === "team-chat" || page === "dialer" ? { padding: 0, maxWidth: "none" } : undefined}
        >
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
      {/* Desktop (Electron): calls pop into their own native window instead
          (see DesktopCallBridge), so the in-page overlay is redundant there.
          Web: window.ringnexDesktop never exists, so this is unchanged. */}
      {!ownerAccount && session.sip && !window.ringnexDesktop && <GlobalCallOverlay onDialerPage={page === "dialer"} />}
      {!ownerAccount && session.sip && <DesktopCallBridge />}
      {!ownerAccount && session.sip && session.tenant?.canUseLeads && hasAny(session, ["SHOW_END_CALL_POPUP"]) && (
        <EndCallPopup enabled={page !== "auto-dialer"} />
      )}
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
