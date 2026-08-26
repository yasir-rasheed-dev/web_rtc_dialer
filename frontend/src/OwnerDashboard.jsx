import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CirclePause,
  Clock3,
  Headphones,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RefreshCw,
  Signal,
  UserCheck,
  UserRoundCheck,
  UserRoundX,
  Voicemail
} from "lucide-react";
import { api } from "./lib/api";

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function liveDuration(startedAt, now) {
  if (!startedAt) return "0:00";
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function StatCard({ label, value, detail, icon: Icon, tone = "blue" }) {
  return <article className={`owner-stat-card ${tone}`}><span className="owner-stat-icon"><Icon size={19} /></span><div><small>{label}</small><strong>{Number(value || 0)}</strong><p>{detail}</p></div></article>;
}

export default function OwnerDashboard({ tenant, user, amiConnected, socketLiveCalls = [] }) {
  const initialDate = todayValue();
  const [filters, setFilters] = useState({ from: initialDate, to: initialDate, agentId: "" });
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: filters.from, to: filters.to });
      if (filters.agentId) query.set("agentId", filters.agentId);
      setPayload(await api(`/dashboard/owner?${query.toString()}`));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to, filters.agentId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => { load(); }, 15000);
    return () => window.clearInterval(interval);
  }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const agentMap = useMemo(() => new Map((payload?.agents || []).map((agent) => [agent.id, agent])), [payload?.agents]);
  const fallbackMap = useMemo(() => new Map((payload?.agents || []).map((agent) => [agent.sipUsername, agent])), [payload?.agents]);
  const baseLiveCalls = socketLiveCalls.length ? socketLiveCalls : (payload?.liveCalls || []);
  const liveCalls = baseLiveCalls.filter((call) => !filters.agentId || call.agentUserId === filters.agentId);
  const status = payload?.agentStatus || {};
  const metrics = payload?.callMetrics || {};

  return <div className="page-stack owner-dashboard-page">
    <div className="page-heading owner-heading">
      <div><span className="overline">TENANT OWNER CONTROL CENTER</span><h1>{tenant?.name || "Workspace"} overview</h1><p>{user?.name} · management view without a SIP seat</p></div>
      <div className="owner-heading-actions"><span className={`system-pill ${amiConnected ? "ok" : "bad"}`}><Signal size={15} />AMI {amiConnected ? "connected" : "offline"}</span><button className="secondary-action" onClick={load} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={16} />Refresh</button></div>
    </div>

    <section className="console-card owner-filter-card">
      <div className="filter-row owner-filter-row">
        <label>From<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label>To<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <label>Agent<select value={filters.agentId} onChange={(e) => setFilters({ ...filters, agentId: e.target.value })}><option value="">All agents</option>{(payload?.agents || []).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.extension ? ` · ${agent.extension}` : ""}</option>)}</select></label>
        <div className="filter-range-caption"><Clock3 size={16} /><span>{filters.from === filters.to ? filters.from : `${filters.from} → ${filters.to}`}</span></div>
      </div>
    </section>

    {error && <div className="alert error">{error}</div>}

    <div className="section-caption"><div><span className="overline">AGENT AVAILABILITY</span><h2>Current agent status</h2></div><span>{status.total || 0} tracked agents</span></div>
    <div className="owner-stat-grid five">
      <StatCard label="Ready" value={status.ready} detail="Available for calls" icon={UserRoundCheck} tone="green" />
      <StatCard label="Active" value={status.active} detail="Working / signed in" icon={UserCheck} />
      <StatCard label="Inactive" value={status.inactive} detail="Offline or disabled" icon={UserRoundX} tone="slate" />
      <StatCard label="On call" value={status.onCall} detail="Ringing or connected" icon={Headphones} tone="purple" />
      <StatCard label="Paused" value={status.paused} detail="Temporarily unavailable" icon={CirclePause} tone="orange" />
    </div>

    <div className="section-caption"><div><span className="overline">CALL ACTIVITY</span><h2>Call outcomes</h2></div><span>Filtered by date and agent</span></div>
    <div className="owner-stat-grid seven">
      <StatCard label="Dialed" value={metrics.dialed} detail="Outbound attempts" icon={PhoneOutgoing} />
      <StatCard label="Missed" value={metrics.missed} detail="Unanswered inbound" icon={PhoneMissed} tone="orange" />
      <StatCard label="Voicemails" value={metrics.voicemails} detail="Marked voicemail" icon={Voicemail} tone="purple" />
      <StatCard label="Connected" value={metrics.connected} detail="Answered calls" icon={PhoneCall} tone="green" />
      <StatCard label="Not connected" value={metrics.not_connected} detail="Unanswered outbound" icon={Activity} tone="slate" />
      <StatCard label="Inbound" value={metrics.inbound} detail="Incoming calls" icon={PhoneIncoming} />
      <StatCard label="Outbound" value={metrics.outbound} detail="Outgoing calls" icon={PhoneOutgoing} tone="purple" />
    </div>

    <section className="console-card table-card owner-live-card">
      <div className="card-title"><div><h2>Live calls</h2><p>Real-time calls across this workspace. Monitoring actions are not shown here.</p></div><span className="live-dot">{liveCalls.length} LIVE</span></div>
      <div className="data-table-wrap"><table><thead><tr><th>Agent</th><th>Teams</th><th>Direction</th><th>From</th><th>To</th><th>Status</th><th>Duration</th><th>Started</th></tr></thead><tbody>{liveCalls.map((call) => {
        const agent = agentMap.get(call.agentUserId) || fallbackMap.get(call.agent);
        const teams = call.teamNames?.length ? call.teamNames : agent?.teamNames || [];
        return <tr key={call.linkedid}><td><strong>{call.agentName || agent?.name || call.agent || "Unassigned"}</strong><small className="cell-subtitle">{agent?.extension || call.agentExtension || ""}</small></td><td>{teams.length ? teams.join(", ") : "—"}</td><td><span className="direction-tag">{call.direction}</span></td><td>{call.from || "—"}</td><td>{call.to || "—"}</td><td><span className="status-tag active">{call.status}</span></td><td>{liveDuration(call.startedAt, now)}</td><td>{formatDate(call.startedAt)}</td></tr>;
      })}</tbody></table>{!liveCalls.length && <div className="empty-block">No live calls right now</div>}</div>
    </section>
  </div>;
}
