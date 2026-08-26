import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Filter, FileSpreadsheet, FileText, PhoneIncoming, PhoneOutgoing, RefreshCw, Timer } from "lucide-react";

import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import DatePicker from "./components/ui/DatePicker";
import EmptyState from "./components/ui/EmptyState";
import { FIELD_CLASS } from "./components/ui/Input";
import Modal from "./components/ui/Modal";
import PageHeader from "./components/ui/PageHeader";
import Select from "./components/ui/Select";
import { SkeletonTable } from "./components/ui/Skeleton";
import StatusBadge from "./components/ui/StatusBadge";
import { api, exportCallReport } from "./lib/api";
import { notifyError, notifySuccess } from "./lib/toast";

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

const CONNECTED_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "true", label: "Connected" },
  { value: "false", label: "Not connected" }
];

const PAGE_SIZE_OPTIONS = [
  { value: 25, label: "25 / page" },
  { value: 50, label: "50 / page" },
  { value: 100, label: "100 / page" }
];

function fieldLabelClass() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

function ReportFilters({ filters, setFilters, onApply, agents, loading }) {
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
      <label className={`${fieldLabelClass()} w-[170px]`}>
        Status
        <Select
          options={CONNECTED_OPTIONS}
          value={CONNECTED_OPTIONS.find((option) => option.value === filters.connected) || CONNECTED_OPTIONS[0]}
          onChange={(option) => setFilters({ ...filters, connected: option.value })}
        />
      </label>
      <label className={`${fieldLabelClass()} w-[120px]`}>
        Min duration (s)
        <input
          type="number"
          min="0"
          value={filters.durationMin}
          onChange={(event) => setFilters({ ...filters, durationMin: event.target.value })}
          placeholder="0"
          className={FIELD_CLASS}
        />
      </label>
      <label className={`${fieldLabelClass()} w-[120px]`}>
        Max duration (s)
        <input
          type="number"
          min="0"
          value={filters.durationMax}
          onChange={(event) => setFilters({ ...filters, durationMax: event.target.value })}
          placeholder="Any"
          className={FIELD_CLASS}
        />
      </label>
      <Button type="submit" icon={Filter} loading={loading}>
        Apply
      </Button>
    </form>
  );
}

function CustomPagination({ result, pageSize, onPageSizeChange, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const [jumpValue, setJumpValue] = useState("");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-1 pt-4 text-xs text-muted">
      <div className="flex items-center gap-2">
        <span className="shrink-0">Rows per page</span>
        <div className="w-[120px]">
          <Select
            options={PAGE_SIZE_OPTIONS}
            value={PAGE_SIZE_OPTIONS.find((option) => option.value === pageSize) || PAGE_SIZE_OPTIONS[0]}
            onChange={(option) => onPageSizeChange(option.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={result.page <= 1} onClick={() => onPageChange(1)}>
          First
        </Button>
        <Button size="sm" variant="secondary" disabled={result.page <= 1} onClick={() => onPageChange(result.page - 1)}>
          Previous
        </Button>
        <span className="whitespace-nowrap">
          Page {result.page} of {totalPages} · {result.total} records
        </span>
        <Button size="sm" variant="secondary" disabled={result.page >= totalPages} onClick={() => onPageChange(result.page + 1)}>
          Next
        </Button>
        <Button size="sm" variant="secondary" disabled={result.page >= totalPages} onClick={() => onPageChange(totalPages)}>
          Last
        </Button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const target = Number(jumpValue);
            if (Number.isFinite(target) && target >= 1 && target <= totalPages) onPageChange(target);
            setJumpValue("");
          }}
        >
          <input
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value)}
            placeholder="Go to…"
            className={`${FIELD_CLASS} h-8 w-20 px-2 py-1 text-xs`}
          />
        </form>
      </div>
    </div>
  );
}

function ExportProgressModal({ open, format, percent, done, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={`Exporting to ${format === "pdf" ? "PDF" : "Excel"}`} width="max-w-sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {done
            ? "Your file has been downloaded."
            : "Preparing your file — this can take a while for very large datasets. You can keep working; it'll download automatically when ready."}
        </p>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full bg-brand"
            initial={false}
            animate={{ width: `${Math.max(2, percent)}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{percent}%</span>
          <Button size="sm" variant="secondary" onClick={onClose}>
            {done ? "Close" : "Dismiss"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CallDirectionReportPage({ direction, eyebrow, title, description }) {
  const agents = useAgentOptions();
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", connected: "", durationMin: "", durationMax: "" });
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState(null);

  const load = useCallback(
    async (page = 1, size = pageSize) => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ page: String(page), pageSize: String(size), direction });
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
    [filters, direction, pageSize]
  );

  useEffect(() => {
    load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async (format) => {
    setExportState({ format, percent: 0, done: false });
    try {
      await exportCallReport({
        direction,
        filters,
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
      className="group flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-6 text-left shadow-card transition-colors hover:border-border-strong hover:bg-surface-2"
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
export function ReportsHub() {
  const [view, setView] = useState("hub");

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
