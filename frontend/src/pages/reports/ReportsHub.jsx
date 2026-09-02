import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, FileSpreadsheet, FileText, Headset, PhoneIncoming, PhoneOutgoing, RefreshCw, Timer } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { api, exportCallReport } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/toast";
import TollFreeReportPage from "./TollFreeReport";
import { CustomPagination, ExportProgressModal, ReportFilters, formatDate, formatSeconds, useAgentOptions } from "./shared";

// `extraParams` merges fixed, non-user-editable query params into every
// request (list + export) alongside the usual filter form — the Toll-Free
// report's per-number drill-down uses it to pin `toNumber` so the table
// only shows calls for that one DID, on top of the same date/agent/status
// filters every other report already has.
export function CallDirectionReportPage({ direction, eyebrow, title, description, extraParams = {} }) {
  const agents = useAgentOptions();
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", connected: "", durationMin: "", durationMax: "" });
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState(null);

  const extraParamsKey = JSON.stringify(extraParams);

  const load = useCallback(
    async (page = 1, size = pageSize) => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ page: String(page), pageSize: String(size), direction, ...extraParams });
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== "" && value !== undefined && value !== null) query.set(key, value);
        });
        setResult(await api(`/calls?${query.toString()}`));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, direction, pageSize, extraParamsKey]
  );

  useEffect(() => {
    load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraParamsKey]);

  const handleExport = async (format) => {
    setExportState({ format, percent: 0, done: false });
    try {
      await exportCallReport({
        direction,
        filters: { ...filters, ...extraParams },
        format,
        onProgress: (percent) => setExportState((current) => (current ? { ...current, percent } : current))
      });
      setExportState((current) => (current ? { ...current, percent: 100, done: true } : current));
      notifySuccess(`${format === "pdf" ? "PDF" : "Excel"} export downloaded`);
    } catch (exportError) {
      notifyError(exportError.message || "Export failed");
      setExportState(null);
    }
  };

  const exportBusy = (format) => exportState?.format === format && !exportState.done;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => load(result.page, pageSize)}>
              Refresh
            </Button>
            <Button variant="secondary" icon={FileText} loading={exportBusy("pdf")} onClick={() => handleExport("pdf")}>
              Export PDF
            </Button>
            <Button variant="secondary" icon={FileSpreadsheet} loading={exportBusy("xlsx")} onClick={() => handleExport("xlsx")}>
              Export Excel
            </Button>
          </>
        }
      />

      <Card>
        <ReportFilters filters={filters} setFilters={setFilters} onApply={() => load(1, pageSize)} agents={agents} loading={loading} />
      </Card>

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card title={`${title} records`} description={`${result.total} matching calls — export includes every matching record, not just this page`}>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={8} cols={5} />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((call) => (
                  <tr key={call.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 text-text">{call.to_number || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{call.from_number || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{formatSeconds(call.billable_sec)}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={call.answered_at ? "success" : "neutral"}>
                        {call.answered_at ? "Connected" : "Not connected"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 text-muted">{formatDate(call.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !result.rows.length && <EmptyState title="No matching calls" />}
        </div>
        <CustomPagination
          result={result}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            load(1, size);
          }}
          onPageChange={(page) => load(page, pageSize)}
        />
      </Card>

      <ExportProgressModal
        open={Boolean(exportState)}
        format={exportState?.format}
        percent={exportState?.percent ?? 0}
        done={Boolean(exportState?.done)}
        onClose={() => setExportState(null)}
      />
    </div>
  );
}

function InboundReportPage() {
  return (
    <CallDirectionReportPage
      direction="INBOUND"
      eyebrow="INBOUND CALLS"
      title="Inbound Report"
      description="Filter and export inbound call activity by agent, duration and connection status."
    />
  );
}

function OutboundReportPage() {
  return (
    <CallDirectionReportPage
      direction="OUTBOUND"
      eyebrow="OUTBOUND CALLS"
      title="Outbound Report"
      description="Filter and export outbound call activity by agent, duration and connection status."
    />
  );
}

function PerformanceReportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="COMING SOON" title="Performance Report" description="Agent performance analytics for this tenant." />
      <Card>
        <EmptyState
          icon={Timer}
          title="Performance report is coming soon"
          description="This report is still being built and will be available in a future update."
        />
      </Card>
    </div>
  );
}

function ReportCard({ icon: Icon, title, description, pending, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="group flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-6 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <Icon size={20} />
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-text">{title}</h3>
          {pending && (
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">Soon</span>
          )}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100">
        Open report <ArrowRight size={13} />
      </span>
    </motion.button>
  );
}

function BackToReports({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <ArrowLeft size={15} /> Back to Reports
    </button>
  );
}

// Single "Reports" nav destination: a 3-card hub (Inbound/Outbound/
// Performance) that swaps in the chosen report inline via local state,
// rather than each report getting its own top-level sidebar entry.
export default function ReportsHub({ session } = {}) {
  const [view, setView] = useState("hub");
  // Toll-Free reporting is a Super Admin-controlled tenant feature — the
  // backend's toll-free routes already 403 when can_use_toll_free is off
  // (tollFreeRoutes.js's requireTenantFeature), so match that here: hide
  // the card and never render the report when the workspace lacks it.
  const canUseTollFree = session?.tenant?.canUseTollFree !== false;

  if (view === "inbound") {
    return (
      <div className="flex flex-col gap-4">
        <BackToReports onClick={() => setView("hub")} />
        <InboundReportPage />
      </div>
    );
  }

  if (view === "outbound") {
    return (
      <div className="flex flex-col gap-4">
        <BackToReports onClick={() => setView("hub")} />
        <OutboundReportPage />
      </div>
    );
  }

  if (view === "performance") {
    return (
      <div className="flex flex-col gap-4">
        <BackToReports onClick={() => setView("hub")} />
        <PerformanceReportPage />
      </div>
    );
  }

  if (view === "tollfree" && canUseTollFree) {
    return (
      <div className="flex flex-col gap-4">
        <BackToReports onClick={() => setView("hub")} />
        <TollFreeReportPage />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="CALL REPORTING"
        title="Reports"
        description="Pick a report to filter, browse and export tenant call activity."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ReportCard
          icon={PhoneIncoming}
          title="Inbound Report"
          description="Calls received, filterable by agent, duration and connection status — exportable to PDF or Excel."
          onClick={() => setView("inbound")}
        />
        <ReportCard
          icon={PhoneOutgoing}
          title="Outbound Report"
          description="Calls placed, filterable by agent, duration and connection status — exportable to PDF or Excel."
          onClick={() => setView("outbound")}
        />
        {canUseTollFree && (
          <ReportCard
            icon={Headset}
            title="Toll-Free Report"
            description="Per-number call volume, live queue status and the full call list for each toll-free number."
            onClick={() => setView("tollfree")}
          />
        )}
        <ReportCard
          icon={Timer}
          title="Performance Report"
          description="Agent performance analytics for this tenant."
          pending
          onClick={() => setView("performance")}
        />
      </div>
    </div>
  );
}
