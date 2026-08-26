import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Button from "../../components/ui/Button";
import { api } from "../../lib/api";
import { Filters, Pagination, formatDate, formatSeconds, useAgentOptions } from "./shared";

export default function CallLogsPage() {
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
