import { useEffect, useState } from "react";
import { Filter, Search } from "lucide-react";

import Button from "../../components/ui/Button";
import DatePicker from "../../components/ui/DatePicker";
import Select from "../../components/ui/Select";
import { api } from "../../lib/api";

// Shared between CallLogsPage and RecordingsPage — both filter the same
// underlying call data, just with a different column set / no call-status
// filters on the recordings side (see `includeCallFilters`).

export function formatSeconds(value = 0) {
  const seconds = Number(value) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${rest}s` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function useAgentOptions() {
  const [agents, setAgents] = useState([]);
  useEffect(() => {
    api("/users")
      .then((payload) => setAgents((payload.users || []).filter((user) => user.roleName !== "Tenant Owner" && user.sipUsername)))
      .catch(() => setAgents([]));
  }, []);
  return agents;
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
  { value: "ANSWERED", label: "Answered" },
  { value: "RINGING", label: "Ringing" }
];

export function fieldLabelClass() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

export function Filters({ filters, setFilters, onApply, agents, includeCallFilters = false, loading = false }) {
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

export function Pagination({ result, load }) {
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
