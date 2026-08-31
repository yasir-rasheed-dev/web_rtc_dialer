import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Headset, PhoneCall, RefreshCw, Users, Wifi, WifiOff } from "lucide-react";

import Select from "../../components/ui/Select";
import EmptyState from "../../components/ui/EmptyState";
import ThemeToggle from "../../components/ui/ThemeToggle";
import { api, getToken, getTollFreeCampaign, listTollFreeCampaigns, lookupCallerIdentity } from "../../lib/api";
import { API_BASE } from "../../lib/apiConfig";

// The standalone "#toll-free-live" window opened by the Toll-Free page's
// "Open Dashboard Mode" button (see TollFreePage.jsx) — its own top-level
// render target (frontend/src/main.jsx), not part of the normal Sidebar/
// App.jsx shell. Same-origin window.open() clones sessionStorage at
// creation time, so getToken() already has a valid auth token here with
// no separate login step.
//
// Live calls + agent presence/status ride the app's existing tenant-wide
// socket broadcasts (call:update/call:ended/presence:update/agent:status)
// — this window just needs its own socket connection (browser windows
// don't share a JS heap, so App.jsx's connection can't be reused
// directly) landing in the same tenant:<id>:live room every other
// tenant-wide viewer joins server-side. Queue (waiting-caller) state has
// no natural event stream (AMI QueueStatus is request/response, not
// pushed), so the backend polls it every 2s per campaign and re-emits
// over the toll-free:<campaignId> room — see server.js's
// startCampaignQueuePoll.

const AGENT_STATUS_LABEL = { READY: "Ready", PAUSED: "Paused", WRAP_UP: "Wrap-up", OFFLINE: "Offline" };

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

function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

function SummaryCard({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    {
      default: "border-border bg-surface text-text",
      brand: "border-brand/30 bg-brand/10 text-brand",
      success: "border-success/30 bg-success-soft text-success",
      warning: "border-warning/30 bg-warning-soft text-warning",
      danger: "border-danger/30 bg-danger-soft text-danger",
      muted: "border-border bg-surface-2 text-muted"
    }[tone] || "border-border bg-surface text-text";
  return (
    <div className={`flex flex-1 min-w-[130px] flex-col gap-1.5 rounded-2xl border px-4 py-3.5 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-80">
        {Icon && <Icon size={13} />}
        {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function TollFreeLiveDashboard() {
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState("");
  const [campaignDetail, setCampaignDetail] = useState(null); // { campaign, agents }
  const [socketConnected, setSocketConnected] = useState(false);
  const [liveCalls, setLiveCalls] = useState([]);
  const [presence, setPresence] = useState({}); // agent (sip username) -> "ONLINE"|"OFFLINE"
  const [liveAgentStatus, setLiveAgentStatus] = useState({}); // userId -> READY|PAUSED|WRAP_UP|OFFLINE
  const [queueState, setQueueState] = useState({ waiting: 0, entries: [], ok: true });
  const [nowTick, setNowTick] = useState(Date.now());
  // number -> { type, name } | "pending" | "unknown" — a saved contact's
  // name or (if the number is actually a teammate's extension) an agent's
  // name beats showing a raw digit string; anything that resolves to
  // neither shows "Unknown caller" rather than the number itself.
  const [callerIdentities, setCallerIdentities] = useState({});
  const socketRef = useRef(null);
  const subscribedCampaignRef = useRef("");

  // Auth + campaign list — once.
  useEffect(() => {
    if (!getToken()) {
      setAuthError("No session found. Open this from the Toll-Free page's \"Open Dashboard Mode\" button.");
      return;
    }
    api("/auth/session")
      .then(setSession)
      .catch(() => setAuthError("Your session has expired — close this window and reopen it from the Toll-Free page."));
    listTollFreeCampaigns()
      .then((rows) => {
        setCampaigns(rows);
        if (rows.length) setCampaignId((current) => current || rows[0].id);
      })
      .catch(() => undefined);
  }, []);

  // Socket connection — once, kept open across campaign switches.
  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    let socket;
    ensureSocketClient()
      .then(() => {
        if (cancelled) return;
        socket = API_BASE
          ? window.io(API_BASE, { path: "/socket.io", auth: { token: getToken() } })
          : window.io({ path: "/socket.io", auth: { token: getToken() } });
        socketRef.current = socket;
        socket.on("connect", () => {
          setSocketConnected(true);
          if (subscribedCampaignRef.current) socket.emit("toll-free:subscribe", { campaignId: subscribedCampaignRef.current });
        });
        socket.on("disconnect", () => setSocketConnected(false));
        socket.on("system:state", (state) => setLiveCalls(state.calls || []));
        socket.on("call:update", (call) =>
          setLiveCalls((calls) => [...calls.filter((item) => item.linkedid !== call.linkedid), call])
        );
        socket.on("call:ended", (call) => setLiveCalls((calls) => calls.filter((item) => item.linkedid !== call.linkedid)));
        socket.on("presence:update", (item) =>
          setPresence((current) => ({ ...current, [item.agent]: item.status }))
        );
        socket.on("agent:status", (item) =>
          setLiveAgentStatus((current) => ({ ...current, [item.userId]: item.status }))
        );
        socket.on("toll-free:queue", (payload) => {
          if (payload.campaignId !== subscribedCampaignRef.current) return;
          setQueueState({
            waiting: payload.waiting || 0,
            entries: payload.entries || [],
            ok: payload.ok !== false,
            // Stamped per-snapshot so activityRows can interpolate each
            // entry's wait time smoothly between 2s polls instead of it
            // jumping only when a new poll actually lands.
            receivedAt: Date.now()
          });
        });
      })
      .catch(() => setSocketConnected(false));
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [session]);

  // Switch subscription when the selected campaign changes. Relies on
  // React running this effect's own cleanup (unsubscribing whichever
  // campaign THIS effect run subscribed to) before the next run fires for
  // a newly-selected campaign — no separate "previous campaign" tracking
  // needed. subscribedCampaignRef exists purely so the socket's own
  // "connect" handler (a reconnect after a drop) knows what to
  // re-subscribe to, independent of this effect's lifecycle.
  useEffect(() => {
    if (!campaignId) return undefined;
    setCampaignDetail(null);
    setQueueState({ waiting: 0, entries: [], ok: true });
    getTollFreeCampaign(campaignId).then(setCampaignDetail).catch(() => undefined);

    subscribedCampaignRef.current = campaignId;
    const socket = socketRef.current;
    if (socket?.connected) socket.emit("toll-free:subscribe", { campaignId });

    return () => {
      if (socket?.connected) socket.emit("toll-free:unsubscribe", { campaignId });
    };
  }, [campaignId]);

  // Per-second re-render for live duration/wait-time ticking (both derived
  // from real timestamps — answeredAt for calls, an estimated start for
  // queue entries — so this is purely a display tick, not a data refetch).
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const didNumber = campaignDetail?.campaign?.did_number;
  const agents = campaignDetail?.agents || [];

  const campaignLiveCalls = useMemo(() => {
    if (!didNumber) return [];
    return liveCalls.filter((call) => call.to === didNumber || call.to === didNumber.replace(/^1/, ""));
  }, [liveCalls, didNumber]);

  const agentRows = useMemo(() => {
    const busyAgentIds = new Set(
      campaignLiveCalls.filter((call) => call.status === "ANSWERED" || call.status === "HELD").map((call) => call.agentUserId)
    );
    return agents.map((agent) => {
      const onCall = busyAgentIds.has(agent.user_id);
      const liveStatus = liveAgentStatus[agent.user_id] || agent.status || "OFFLINE";
      const online = presence[agent.sip_username] !== "OFFLINE";
      return { ...agent, onCall, status: onCall ? "ON_CALL" : liveStatus, online };
    });
  }, [agents, campaignLiveCalls, liveAgentStatus, presence]);

  const summary = useMemo(() => {
    const counts = { total: agentRows.length, onCall: 0, ready: 0, paused: 0, wrapUp: 0, offline: 0 };
    for (const agent of agentRows) {
      if (agent.onCall) counts.onCall += 1;
      else if (agent.status === "PAUSED") counts.paused += 1;
      else if (agent.status === "WRAP_UP") counts.wrapUp += 1;
      else if (agent.status === "OFFLINE" || !agent.online) counts.offline += 1;
      else counts.ready += 1;
    }
    return counts;
  }, [agentRows]);

  // One combined, color-coded feed: bridged calls (green) and callers
  // still on hold in the queue (amber) — deliberately not two separate
  // tables, so "what's happening on this number right now" reads as one
  // timeline instead of two things you have to mentally merge yourself.
  const activityRows = useMemo(() => {
    const live = campaignLiveCalls
      .filter((call) => call.status === "ANSWERED" || call.status === "HELD" || call.status === "RINGING")
      .map((call) => ({
        kind: call.status === "RINGING" ? "ringing" : "live",
        key: call.linkedid,
        caller: call.from || null,
        agent: call.agentName || call.agent || "—",
        detail: call.status === "HELD" ? "On hold" : call.status === "RINGING" ? "Ringing" : "Connected",
        seconds: call.answeredAt ? (nowTick - new Date(call.answeredAt).getTime()) / 1000 : 0
      }));
    const queued = (queueState.entries || []).map((entry) => ({
      kind: "queue",
      key: entry.uniqueid,
      caller: entry.callerIdNum || null,
      agent: "—",
      detail: `Position ${entry.position || "—"}`,
      // entry.waitSec is a fresh-as-of-last-poll snapshot; interpolate
      // smoothly between 2s polls off an estimated start time.
      seconds: entry.waitSec + (nowTick - queueState.receivedAt) / 1000
    }));
    return [...live, ...queued].sort((a, b) => b.seconds - a.seconds);
  }, [campaignLiveCalls, queueState, nowTick]);

  // Deliberately separate from activityRows above (which recomputes every
  // second for the ticking duration) — this only changes when the actual
  // SET of caller numbers on screen changes, which is what should trigger
  // a lookup, not every per-second re-render.
  const callerNumbersKey = useMemo(() => {
    const numbers = new Set([
      ...campaignLiveCalls.map((call) => call.from).filter(Boolean),
      ...(queueState.entries || []).map((entry) => entry.callerIdNum).filter(Boolean)
    ]);
    return [...numbers].join(",");
  }, [campaignLiveCalls, queueState.entries]);

  useEffect(() => {
    const numbers = callerNumbersKey ? callerNumbersKey.split(",") : [];
    const unresolved = numbers.filter((number) => !callerIdentities[number]);
    if (!unresolved.length) return;
    setCallerIdentities((current) => {
      const next = { ...current };
      for (const number of unresolved) next[number] = "pending";
      return next;
    });
    unresolved.forEach((number) => {
      lookupCallerIdentity(number)
        .then((result) => {
          setCallerIdentities((current) => ({ ...current, [number]: result.name ? result : "unknown" }));
        })
        .catch(() => setCallerIdentities((current) => ({ ...current, [number]: "unknown" })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callerNumbersKey]);

  function callerLabel(number) {
    const identity = callerIdentities[number];
    if (!identity || identity === "pending") return number; // brief loading state
    if (identity === "unknown") return "Unknown caller";
    return identity.type === "agent" ? `${identity.name} (teammate)` : identity.name;
  }

  if (authError) {
    return (
      <div className="grid min-h-screen place-content-center gap-3 justify-items-center bg-bg px-6 text-center text-muted">
        <Headset size={28} />
        <p className="max-w-sm text-sm">{authError}</p>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="grid min-h-screen place-content-center gap-3 justify-items-center bg-bg text-muted">
        <RefreshCw className="animate-spin text-brand" size={24} />
        <span className="text-sm">Loading live dashboard…</span>
      </div>
    );
  }

  const campaignOptions = campaigns.map((c) => ({ value: c.id, label: `${c.name} · ${c.did_number}` }));

  return (
    <div className="min-h-screen bg-bg px-6 py-5 text-text">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Headset size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">Toll-Free Live Dashboard</p>
              <p className="text-xs text-muted">{session.tenant?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-xs font-medium ${socketConnected ? "text-success" : "text-danger"}`}>
              {socketConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
              {socketConnected ? "Live" : "Reconnecting…"}
            </span>
            <ThemeToggle />
          </div>
        </div>

        <div className="w-full max-w-sm">
          <Select
            options={campaignOptions}
            value={campaignOptions.find((o) => o.value === campaignId) || null}
            onChange={(o) => setCampaignId(o?.value || "")}
            placeholder={campaignOptions.length ? "Select a campaign…" : "No campaigns yet"}
            isDisabled={!campaignOptions.length}
          />
        </div>

        {!campaignDetail ? (
          <div className="py-16 text-center text-sm text-muted">
            {campaignOptions.length ? "Loading campaign…" : "No toll-free campaigns exist yet for this tenant."}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <SummaryCard icon={Users} label="Total agents" value={summary.total} />
              <SummaryCard icon={PhoneCall} label="On call" value={summary.onCall} tone="brand" />
              <SummaryCard label="Ready" value={summary.ready} tone="success" />
              <SummaryCard label="Paused" value={summary.paused} tone="warning" />
              <SummaryCard label="Wrap-up" value={summary.wrapUp} tone="warning" />
              <SummaryCard label="Offline" value={summary.offline} tone="muted" />
            </div>

            <div className="flex flex-wrap gap-2">
              {agentRows.map((agent) => (
                <span
                  key={agent.user_id}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    agent.onCall
                      ? "border-brand/30 bg-brand/10 text-brand"
                      : agent.status === "PAUSED"
                        ? "border-warning/30 bg-warning-soft text-warning"
                        : agent.status === "WRAP_UP"
                          ? "border-warning/30 bg-warning-soft text-warning"
                          : agent.status === "OFFLINE" || !agent.online
                            ? "border-border bg-surface-2 text-muted"
                            : "border-success/30 bg-success-soft text-success"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {agent.name}
                  <span className="opacity-70">
                    {agent.onCall ? "On call" : AGENT_STATUS_LABEL[agent.status] || agent.status}
                  </span>
                </span>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-text">Live activity</p>
                <p className="text-xs text-muted">{queueState.ok === false ? "Queue feed unavailable" : `${queueState.waiting} waiting`}</p>
              </div>
              {activityRows.length ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <th className="px-4 pb-2 pt-3">Type</th>
                      <th className="px-4 pb-2 pt-3">Caller</th>
                      <th className="px-4 pb-2 pt-3">Agent</th>
                      <th className="px-4 pb-2 pt-3">Detail</th>
                      <th className="px-4 pb-2 pt-3">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityRows.map((row) => (
                      <tr
                        key={row.key}
                        className={
                          row.kind === "queue"
                            ? "border-b border-border/60 bg-warning-soft/40 last:border-0"
                            : row.kind === "ringing"
                              ? "border-b border-border/60 bg-brand/5 last:border-0"
                              : "border-b border-border/60 bg-success-soft/30 last:border-0"
                        }
                      >
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              row.kind === "queue"
                                ? "bg-warning-soft text-warning"
                                : row.kind === "ringing"
                                  ? "bg-brand/10 text-brand"
                                  : "bg-success-soft text-success"
                            }`}
                          >
                            {row.kind === "queue" ? "In queue" : row.kind === "ringing" ? "Ringing" : "Live call"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-text">{row.caller ? callerLabel(row.caller) : "Unknown caller"}</td>
                        <td className="px-4 py-2.5 text-muted">{row.agent}</td>
                        <td className="px-4 py-2.5 text-muted">{row.detail}</td>
                        <td className="px-4 py-2.5 font-mono text-text">{formatDuration(row.seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState icon={PhoneCall} title="Nothing happening right now" description="No live calls or queued callers on this number." />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
