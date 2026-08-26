import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileAudio, Filter, RefreshCw, Search, X } from "lucide-react";

import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import DatePicker from "./components/ui/DatePicker";
import EmptyState from "./components/ui/EmptyState";
import { FIELD_CLASS } from "./components/ui/Input";
import PageHeader from "./components/ui/PageHeader";
import Select from "./components/ui/Select";
import { SkeletonTable } from "./components/ui/Skeleton";
import StatusBadge from "./components/ui/StatusBadge";
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
    api("/users")
      .then((payload) => setAgents((payload.users || []).filter((user) => user.roleName !== "Tenant Owner" && user.sipUsername)))
      .catch(() => setAgents([]));
  }, []);
  return agents;
}

const DIRECTION_OPTIONS = [
  { value: "", label: "All directions" },
  { value: "INBOUND", label: "Inbound" },
  { value: "OUTBOUND", label: "Outbound" }
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
  { value: "ANSWERED", label: "Answered" },
  { value: "RINGING", label: "Ringing" }
];

function fieldLabelClass() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

function Filters({ filters, setFilters, onApply, agents, includeCallFilters = false, loading = false }) {
  const agentOptions = [
    { value: "", label: "All agents" },
    ...agents.map((agent) => ({
      value: agent.id,
      label: agent.extension ? `${agent.name} · ${agent.extension}` : agent.name
    }))
  ];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className={`${fieldLabelClass()} w-[150px]`}>
        From
        <DatePicker value={filters.from} onChange={(value) => setFilters({ ...filters, from: value })} />
      </label>
      <label className={`${fieldLabelClass()} w-[150px]`}>
        To
        <DatePicker value={filters.to} onChange={(value) => setFilters({ ...filters, to: value })} />
      </label>
      {agents.length > 0 && (
        <label className={`${fieldLabelClass()} w-[190px]`}>
          Agent
          <Select
            options={agentOptions}
            value={agentOptions.find((option) => option.value === filters.agentId) || agentOptions[0]}
            onChange={(option) => setFilters({ ...filters, agentId: option.value })}
          />
        </label>
      )}
      {includeCallFilters && (
        <label className={`${fieldLabelClass()} w-[170px]`}>
          Direction
          <Select
            options={DIRECTION_OPTIONS}
            value={DIRECTION_OPTIONS.find((option) => option.value === filters.direction) || DIRECTION_OPTIONS[0]}
            onChange={(option) => setFilters({ ...filters, direction: option.value })}
          />
        </label>
      )}
      {includeCallFilters && (
        <label className={`${fieldLabelClass()} w-[170px]`}>
          Status
          <Select
            options={STATUS_OPTIONS}
            value={STATUS_OPTIONS.find((option) => option.value === filters.status) || STATUS_OPTIONS[0]}
            onChange={(option) => setFilters({ ...filters, status: option.value })}
          />
        </label>
      )}
      <label className={`${fieldLabelClass()} min-w-[220px] flex-1`}>
        Search
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <Search size={15} className="shrink-0 text-muted" />
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Number or agent…"
            className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none"
          />
        </div>
      </label>
      <Button type="submit" icon={Filter} loading={loading}>
        Apply
      </Button>
    </form>
  );
}

function Pagination({ result, load }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-border px-1 pt-4 text-xs text-muted">
      <Button size="sm" variant="secondary" disabled={result.page <= 1} onClick={() => load(result.page - 1)}>
        Previous
      </Button>
      <span>
        Page {result.page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={result.page * result.pageSize >= result.total}
        onClick={() => load(result.page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

export function CallLogsPage() {
  const agents = useAgentOptions();
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", direction: "", status: "", search: "" });
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ page: String(page), pageSize: "25" });
        Object.entries(filters).forEach(([key, value]) => {
          if (value) query.set(key, value);
        });
        setResult(await api(`/calls?${query.toString()}`));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="CONVERSATION HISTORY"
        title="Call Logs"
        description="Filter tenant call history by agent, date, direction and outcome."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => load(result.page)}>
            Refresh
          </Button>
        }
      />

      <Card>
        <Filters filters={filters} setFilters={setFilters} onApply={() => load(1)} agents={agents} includeCallFilters loading={loading} />
      </Card>

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card title="Call records" description={`${result.total} matching records`}>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} cols={8} />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2 pr-4">Agent</th>
                  <th className="pb-2 pr-4">Direction</th>
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Talk time</th>
                  <th className="pb-2">Disposition</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((call) => (
                  <tr key={call.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 text-muted">{formatDate(call.started_at)}</td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text">{call.agent_name || call.agent_sip_username || "—"}</p>
                      {call.agent_sip_username && <p className="text-xs text-muted">{call.agent_sip_username}</p>}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone="brand">{call.direction}</StatusBadge>
                    </td>
                    <td className="py-3 pr-4 text-muted">{call.from_number || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{call.to_number || "—"}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={call.answered_at ? "success" : "neutral"}>{call.status}</StatusBadge>
                    </td>
                    <td className="py-3 pr-4 text-muted">{formatSeconds(call.billable_sec)}</td>
                    <td className="py-3 text-muted">{call.disposition || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !result.rows.length && <EmptyState title="No matching calls" />}
        </div>
        <Pagination result={result} load={load} />
      </Card>
    </div>
  );
}

export function RecordingsPage() {
  const agents = useAgentOptions();
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", search: "" });
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [audio, setAudio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ page: String(page), pageSize: "25" });
        Object.entries(filters).forEach(([key, value]) => {
          if (value) query.set(key, value);
        });
        setResult(await api(`/recordings?${query.toString()}`));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => {
    if (audio?.url) URL.revokeObjectURL(audio.url);
  }, [audio]);

  const play = async (call) => {
    setError("");
    try {
      if (audio?.url) URL.revokeObjectURL(audio.url);
      setAudio({ call, url: await recordingBlob(call.id) });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader
        eyebrow="CALL MEDIA"
        title="Recordings"
        description="Search and play recordings by agent and date without mixing them into call logs."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => load(result.page)}>
            Refresh
          </Button>
        }
      />

      <Card>
        <Filters filters={filters} setFilters={setFilters} onApply={() => load(1)} agents={agents} loading={loading} />
      </Card>

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card title="Available recordings" description={`${result.total} matching recordings`} icon={FileAudio}>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} cols={7} />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2 pr-4">Agent</th>
                  <th className="pb-2 pr-4">Direction</th>
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2 pr-4">Talk time</th>
                  <th className="pb-2">Recording</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((call) => (
                  <tr key={call.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 text-muted">{formatDate(call.started_at)}</td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text">{call.agent_name || call.agent_sip_username || "—"}</p>
                      {call.agent_sip_username && <p className="text-xs text-muted">{call.agent_sip_username}</p>}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone="brand">{call.direction}</StatusBadge>
                    </td>
                    <td className="py-3 pr-4 text-muted">{call.from_number || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{call.to_number || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{formatSeconds(call.billable_sec)}</td>
                    <td className="py-3">
                      <Button size="sm" variant="ghost" icon={FileAudio} onClick={() => play(call)}>
                        Play
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !result.rows.length && <EmptyState title="No matching recordings" />}
        </div>
        <Pagination result={result} load={load} />
      </Card>

      <AnimatePresence>
        {audio && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-x-4 bottom-4 z-40 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:inset-x-auto sm:right-6 sm:w-[440px]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <FileAudio size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">
                  {audio.call.agent_name || audio.call.agent_sip_username || "Recording"}
                </p>
                <p className="truncate text-xs text-muted">
                  {formatDate(audio.call.started_at)} · {audio.call.from_number} → {audio.call.to_number}
                </p>
              </div>
              <button
                onClick={() => setAudio(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              >
                <X size={16} />
              </button>
            </div>
            <audio src={audio.url} controls autoPlay className="w-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
