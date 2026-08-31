import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Button from "../../components/ui/Button";
import { api, getCallCounts } from "../../lib/api";
import { Filters, Pagination, formatDate, formatSeconds, useAgentOptions } from "./shared";

// Each tab maps to its own extra query params on top of the shared
// filters — `outcome=missed` (not direction+connected) so the Missed tab
// uses the exact same server-side definition (MISSED_CALL_SQL in
// server.js) as the counts endpoint's own "missed" SUM. Keeping list and
// counts on one shared predicate is what guarantees they can't disagree.
const TABS = [
  { id: "all", label: "All", countKey: "all", params: {} },
  { id: "incoming", label: "Incoming", countKey: "incoming", params: { direction: "INBOUND" } },
  { id: "outgoing", label: "Outgoing", countKey: "outgoing", params: { direction: "OUTBOUND" } },
  { id: "missed", label: "Missed", countKey: "missed", params: { outcome: "missed" } }
];

function TabBar({ tab, counts, countsLoading, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = tab === t.id;
        const count = counts[t.countKey];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-brand bg-brand text-white"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                active ? "bg-white/20 text-white" : t.id === "missed" && count > 0 ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted"
              }`}
            >
              {countsLoading ? "…" : count ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function CallLogsPage() {
  const agents = useAgentOptions();
  const [tab, setTab] = useState("all");
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", status: "", search: "" });
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [counts, setCounts] = useState({ all: 0, incoming: 0, outgoing: 0, missed: 0 });
  const [loading, setLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (page, activeTab, activeFilters) => {
      setLoading(true);
      setError("");
      try {
        const tabParams = TABS.find((t) => t.id === activeTab)?.params || {};
        const query = new URLSearchParams({ page: String(page), pageSize: "25" });
        Object.entries(activeFilters).forEach(([key, value]) => {
          if (value) query.set(key, value);
        });
        Object.entries(tabParams).forEach(([key, value]) => query.set(key, value));
        setResult(await api(`/calls?${query.toString()}`));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Counts intentionally use only the SHARED filters (date/agent/search —
  // never `status`, which is an additional refinement within whichever
  // tab is active, not a tab-defining filter) — this is what keeps every
  // tab's number stable no matter which tab you're looking at.
  const loadCounts = useCallback(async (activeFilters) => {
    setCountsLoading(true);
    try {
      const { status: _status, ...shared } = activeFilters;
      setCounts(await getCallCounts(shared));
    } catch {
      // Counts annotate the tabs; a failed fetch shouldn't block the page
      // — leave the last-known numbers showing instead of erroring out.
    } finally {
      setCountsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1, "all", filters);
    loadCounts(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTab = (tabId) => {
    setTab(tabId);
    load(1, tabId, filters);
  };

  const applyFilters = () => {
    load(1, tab, filters);
    loadCounts(filters);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="CONVERSATION HISTORY"
        title="Call Logs"
        description="Filter tenant call history by agent, date and outcome."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => load(result.page, tab, filters)}>
            Refresh
          </Button>
        }
      />

      <TabBar tab={tab} counts={counts} countsLoading={countsLoading} onSelect={selectTab} />

      <Card>
        <Filters filters={filters} setFilters={setFilters} onApply={applyFilters} agents={agents} includeCallFilters loading={loading} />
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
        <Pagination result={result} load={(page) => load(page, tab, filters)} />
      </Card>
    </div>
  );
}
