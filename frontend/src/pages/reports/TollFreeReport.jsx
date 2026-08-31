import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Headset, RefreshCw } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import DatePicker from "../../components/ui/DatePicker";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { getTollFreeQueueStatus, getTollFreeReportSummary } from "../../lib/api";
import { CallDirectionReportPage } from "./ReportsHub";
import { fieldLabelClass } from "./shared";

const QUEUE_STATUS_POLL_MS = 15000;

function formatAvgWait(sec) {
  if (sec === null || sec === undefined) return "—";
  const n = Math.round(Number(sec));
  if (!n) return "0s";
  return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${n % 60}s`;
}

// Per-number detail: the same filterable/exportable call table every other
// report uses, just pinned to one DID via extraParams. No toll-free-
// specific columns here on purpose — "who answered" is already the Agent
// column via agentId filtering, and duplicating that table would drift.
function TollFreeNumberDetail({ number, onBack }) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ArrowLeft size={15} /> Back to Toll-Free numbers
      </button>
      <CallDirectionReportPage
        direction="INBOUND"
        eyebrow="TOLL-FREE"
        title={number.campaign_name ? `${number.did_number} · ${number.campaign_name}` : number.did_number}
        description="Calls received on this toll-free number — filter, browse and export."
        extraParams={{ toNumber: number.did_number }}
      />
    </div>
  );
}

export default function TollFreeReportPage() {
  const [range, setRange] = useState({ from: "", to: "" });
  const [summary, setSummary] = useState({ numbers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [queueStatus, setQueueStatus] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await getTollFreeReportSummary(range));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  // Live "waiting now" for every campaign currently on-screen — same
  // polling pattern as the Toll-Free management page's queue badge.
  const activeCampaignIds = summary.numbers
    .filter((n) => n.campaign_status === "ACTIVE")
    .map((n) => n.campaign_id)
    .join(",");
  useEffect(() => {
    const ids = activeCampaignIds ? activeCampaignIds.split(",") : [];
    if (!ids.length) return undefined;
    let cancelled = false;
    const poll = () => {
      ids.forEach((id) => {
        getTollFreeQueueStatus(id)
          .then((status) => {
            if (!cancelled) setQueueStatus((current) => ({ ...current, [id]: status }));
          })
          .catch(() => {});
      });
    };
    poll();
    const timer = setInterval(poll, QUEUE_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeCampaignIds]);

  if (selected) {
    return <TollFreeNumberDetail number={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="TOLL-FREE"
        title="Toll-Free Report"
        description="Call volume and live queue status per toll-free number — click a number for the full filterable call list."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>
            Refresh
          </Button>
        }
      />

      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            load();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className={`${fieldLabelClass()} w-[150px]`}>
            From
            <DatePicker value={range.from} onChange={(value) => setRange({ ...range, from: value })} />
          </label>
          <label className={`${fieldLabelClass()} w-[150px]`}>
            To
            <DatePicker value={range.to} onChange={(value) => setRange({ ...range, to: value })} />
          </label>
          <Button type="submit" loading={loading}>
            Apply
          </Button>
        </form>
      </Card>

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card
        title="Toll-free numbers"
        description={`${summary.numbers.length} number${summary.numbers.length === 1 ? "" : "s"} · ${summary.from || "…"} – ${summary.to || "…"}`}
      >
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={4} cols={7} />
          ) : summary.numbers.length ? (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Number</th>
                  <th className="pb-2 pr-4">Campaign</th>
                  <th className="pb-2 pr-4">Total calls</th>
                  <th className="pb-2 pr-4">Answered</th>
                  <th className="pb-2 pr-4">Abandoned</th>
                  <th className="pb-2 pr-4">Avg wait</th>
                  <th className="pb-2 pr-4">Queue now</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {summary.numbers.map((number) => {
                  const status = queueStatus[number.campaign_id];
                  return (
                    <tr
                      key={number.did_id}
                      onClick={() => setSelected(number)}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-2"
                    >
                      <td className="py-3 pr-4 font-medium text-text">{number.did_number}</td>
                      <td className="py-3 pr-4 text-muted">
                        {number.campaign_name || "—"}
                        {number.campaign_status && (
                          <StatusBadge className="ml-2" tone={number.campaign_status === "ACTIVE" ? "success" : "neutral"}>
                            {number.campaign_status}
                          </StatusBadge>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted">{number.total_calls}</td>
                      <td className="py-3 pr-4 text-muted">{number.answered_calls}</td>
                      <td className="py-3 pr-4 text-muted">{number.abandoned_calls}</td>
                      <td className="py-3 pr-4 text-muted">{formatAvgWait(number.avg_wait_sec)}</td>
                      <td className="py-3 pr-4 text-muted">
                        {number.campaign_status !== "ACTIVE" ? (
                          "—"
                        ) : status === undefined ? (
                          <span className="text-xs">…</span>
                        ) : status.ok === false ? (
                          <span className="text-xs">unavailable</span>
                        ) : status.waiting > 0 ? (
                          <StatusBadge tone="warning">
                            {status.waiting} waiting · {status.longestWaitSec}s
                          </StatusBadge>
                        ) : (
                          <span className="text-xs">0 waiting</span>
                        )}
                      </td>
                      <td className="py-3 text-brand">
                        <ArrowRight size={15} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={Headset} title="No toll-free numbers yet" description="Buy one from Phone Numbers and build a campaign to see reporting here." />
          )}
        </div>
      </Card>
    </div>
  );
}
