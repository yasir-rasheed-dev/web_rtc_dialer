import { useCallback, useEffect, useState } from "react";
import { FileAudio, Filter, RefreshCw, Search, X } from "lucide-react";
import { api, recordingBlob } from "./lib/api";

function formatSeconds(value = 0) {
  const seconds = Number(value) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${rest}s` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function useAgentOptions() {
  const [agents, setAgents] = useState([]);
  useEffect(() => {
    api("/users").then((payload) => setAgents((payload.users || []).filter((user) => user.roleName !== "Tenant Owner" && user.sipUsername))).catch(() => setAgents([]));
  }, []);
  return agents;
}

function Filters({ filters, setFilters, onApply, agents, includeCallFilters = false }) {
  return <form className="call-filter-grid" onSubmit={(event) => { event.preventDefault(); onApply(); }}>
    <label>From<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
    <label>To<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
    {agents.length > 0 && <label>Agent<select value={filters.agentId} onChange={(e) => setFilters({ ...filters, agentId: e.target.value })}><option value="">All agents</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.extension ? ` · ${agent.extension}` : ""}</option>)}</select></label>}
    {includeCallFilters && <label>Direction<select value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value })}><option value="">All directions</option><option value="INBOUND">Inbound</option><option value="OUTBOUND">Outbound</option></select></label>}
    {includeCallFilters && <label>Status<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="ANSWERED">Answered</option><option value="RINGING">Ringing</option></select></label>}
    <label className="filter-search"><span>Search</span><div className="search-box"><Search size={16} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Number or agent…" /></div></label>
    <button className="primary-action filter-submit"><Filter size={16} />Apply filters</button>
  </form>;
}

function Pagination({ result, load }) {
  return <div className="pagination"><button disabled={result.page <= 1} onClick={() => load(result.page - 1)}>Previous</button><span>Page {result.page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}</span><button disabled={result.page * result.pageSize >= result.total} onClick={() => load(result.page + 1)}>Next</button></div>;
}

export function CallLogsPage() {
  const agents = useAgentOptions();
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", direction: "", status: "", search: "" });
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "25" });
      Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
      setResult(await api(`/calls?${query.toString()}`));
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(1); }, []);

  return <div className="page-stack"><div className="page-heading"><div><span className="overline">CONVERSATION HISTORY</span><h1>Call Logs</h1><p>Filter tenant call history by agent, date, direction and outcome.</p></div><button className="secondary-action" onClick={() => load(result.page)}><RefreshCw size={16} />Refresh</button></div>
    <section className="console-card"><Filters filters={filters} setFilters={setFilters} onApply={() => load(1)} agents={agents} includeCallFilters /></section>
    {error && <div className="alert error">{error}</div>}
    <section className="console-card table-card"><div className="card-title"><div><h2>Call records</h2><p>{result.total} matching records</p></div></div><div className="data-table-wrap"><table><thead><tr><th>Started</th><th>Agent</th><th>Direction</th><th>From</th><th>To</th><th>Status</th><th>Talk time</th><th>Disposition</th></tr></thead><tbody>{result.rows.map((call) => <tr key={call.id}><td>{formatDate(call.started_at)}</td><td><strong>{call.agent_name || call.agent_sip_username || "—"}</strong><small className="cell-subtitle">{call.agent_sip_username || ""}</small></td><td><span className="direction-tag">{call.direction}</span></td><td>{call.from_number || "—"}</td><td>{call.to_number || "—"}</td><td><span className={`status-tag ${call.answered_at ? "active" : "neutral"}`}>{call.status}</span></td><td>{formatSeconds(call.billable_sec)}</td><td>{call.disposition || "—"}</td></tr>)}</tbody></table>{loading && <div className="table-loading">Loading call records…</div>}{!loading && !result.rows.length && <div className="empty-block">No matching calls</div>}</div><Pagination result={result} load={load} /></section>
  </div>;
}

export function RecordingsPage() {
  const agents = useAgentOptions();
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", search: "" });
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [audio, setAudio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "25" });
      Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
      setResult(await api(`/recordings?${query.toString()}`));
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(1); }, []);
  useEffect(() => () => { if (audio?.url) URL.revokeObjectURL(audio.url); }, [audio]);

  const play = async (call) => {
    setError("");
    try {
      if (audio?.url) URL.revokeObjectURL(audio.url);
      setAudio({ call, url: await recordingBlob(call.id) });
    } catch (requestError) { setError(requestError.message); }
  };

  return <div className="page-stack"><div className="page-heading"><div><span className="overline">CALL MEDIA</span><h1>Recordings</h1><p>Search and play recordings by agent and date without mixing them into call logs.</p></div><button className="secondary-action" onClick={() => load(result.page)}><RefreshCw size={16} />Refresh</button></div>
    <section className="console-card"><Filters filters={filters} setFilters={setFilters} onApply={() => load(1)} agents={agents} /></section>
    {error && <div className="alert error">{error}</div>}
    <section className="console-card table-card"><div className="card-title"><div><h2>Available recordings</h2><p>{result.total} matching recordings</p></div><FileAudio /></div><div className="data-table-wrap"><table><thead><tr><th>Started</th><th>Agent</th><th>Direction</th><th>From</th><th>To</th><th>Talk time</th><th>Recording</th></tr></thead><tbody>{result.rows.map((call) => <tr key={call.id}><td>{formatDate(call.started_at)}</td><td><strong>{call.agent_name || call.agent_sip_username || "—"}</strong><small className="cell-subtitle">{call.agent_sip_username || ""}</small></td><td><span className="direction-tag">{call.direction}</span></td><td>{call.from_number || "—"}</td><td>{call.to_number || "—"}</td><td>{formatSeconds(call.billable_sec)}</td><td><button className="text-button" onClick={() => play(call)}><FileAudio size={15} />Play</button></td></tr>)}</tbody></table>{loading && <div className="table-loading">Loading recordings…</div>}{!loading && !result.rows.length && <div className="empty-block">No matching recordings</div>}</div><Pagination result={result} load={load} /></section>
    {audio && <div className="audio-drawer"><div><FileAudio /><span><strong>{audio.call.agent_name || audio.call.agent_sip_username || "Recording"}</strong><small>{formatDate(audio.call.started_at)} · {audio.call.from_number} → {audio.call.to_number}</small></span></div><audio src={audio.url} controls autoPlay /><button onClick={() => setAudio(null)} aria-label="Close"><X /></button></div>}
  </div>;
}
