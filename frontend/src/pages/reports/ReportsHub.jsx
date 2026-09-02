import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  Headset,
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
  Timer
} from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import DatePicker from "../../components/ui/DatePicker";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { api, exportCallReport, exportPerformanceReport, getPerformanceReport } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/toast";
import TollFreeReportPage from "./TollFreeReport";
import {
  CustomPagination,
  ExportProgressModal,
  FILTER_INPUT,
  ReportFilters,
  fieldLabelClass,
  formatDate,
  formatSeconds,
  useAgentOptions
} from "./shared";

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
  const [sort, setSort] = useState(null); // { key, dir }

  const extraParamsKey = JSON.stringify(extraParams);

  const outbound = direction === "OUTBOUND";
  const otherParty = (call) => (outbound ? call.to_number : call.from_number) || "";
  const SORT_VALUE = {
    number: otherParty,
    agent: (c) => c.agent_name || c.agent_sip_username || "",
    status: (c) => (c.answered_at ? 1 : 0),
    duration: (c) => Number(c.billable_sec) || 0,
    started: (c) => c.started_at || ""
  };
  const sortedRows = useMemo(() => {
    if (!sort) return result.rows;
    const get = SORT_VALUE[sort.key] || (() => "");
    return [...result.rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "desc" ? -cmp : cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.rows, sort]);
  const toggleSort = (key) =>
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });

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

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <Card
        compact
        title={`${title} records`}
        description={`${result.total} matching calls — export includes every matching record, not just this page`}
      >
        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : sortedRows.length ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {[
                      ["number", "Number"],
                      ["agent", "Agent"],
                      ["direction", "Direction"],
                      ["status", "Status"],
                      ["duration", "Duration"],
                      ["started", "Date & time"]
                    ].map(([key, label]) => {
                      const active = sort?.key === key;
                      const sortable = key !== "direction";
                      return (
                        <th key={label} className="h-10 whitespace-nowrap px-4 text-left font-semibold">
                          {sortable ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(key)}
                              className={"inline-flex items-center gap-1 transition-colors hover:text-text " + (active ? "text-text" : "")}
                            >
                              {label}
                              {active ? (
                                sort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                              ) : (
                                <ChevronsUpDown size={13} className="opacity-50" />
                              )}
                            </button>
                          ) : (
                            label
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((call) => {
                    const connected = Boolean(call.answered_at);
                    const agentName = call.agent_name || call.agent_sip_username || "—";
                    return (
                      <tr key={call.id} className="border-t border-border transition-colors hover:bg-surface-2">
                        <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-text">
                          {otherParty(call) || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                              {agentName.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-text">{agentName}</span>
                              {call.agent_sip_username && (
                                <span className="block truncate text-[11px] text-muted">{call.agent_sip_username}</span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={"inline-flex items-center gap-1.5 font-medium " + (outbound ? "text-brand" : "text-accent")}>
                            {outbound ? <PhoneOutgoing size={14} /> : <PhoneIncoming size={14} />}
                            {outbound ? "Outbound" : "Inbound"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {connected ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connected
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-muted">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted" /> Not connected
                            </span>
                          )}
                        </td>
                        <td className={"whitespace-nowrap px-4 py-3 tabular-nums " + (connected ? "font-semibold text-success" : "text-muted")}>
                          {connected ? formatSeconds(call.billable_sec) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(call.started_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState title="No matching calls" />
        )}
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

const PERF_COLUMNS = [
  { key: "dialed", label: "Dialed" },
  { key: "connected", label: "Connected" },
  { key: "notConnected", label: "Not connected" },
  { key: "inbound", label: "Inbound" },
  { key: "missed", label: "Missed" },
  { key: "voicemails", label: "Voicemails" }
];

function PerformanceReportPage() {
  const agents = useAgentOptions();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [filters, setFilters] = useState({ from: monthAgo, to: today, agentId: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState(null);
  const [sort, setSort] = useState({ key: "dialed", dir: "desc" });

  const agentOptions = useMemo(
    () => [
      { value: "", label: "All agents" },
      ...agents.map((a) => ({ value: a.id, label: a.extension ? `${a.name} · ${a.extension}` : a.name }))
    ],
    [agents]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await getPerformanceReport(filters);
      setRows(payload.rows || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedRows = useMemo(() => {
    const get =
      sort.key === "agent"
        ? (r) => r.agent || ""
        : sort.key === "talkSec"
          ? (r) => r.talkSec || 0
          : sort.key === "avgTalkSec"
            ? (r) => r.avgTalkSec || 0
            : (r) => r[sort.key] || 0;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "desc" ? -cmp : cmp;
    });
  }, [rows, sort]);
  const toggleSort = (key) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const handleExport = async (format) => {
    setExportState({ format, percent: 0, done: false });
    try {
      await exportPerformanceReport({
        ...filters,
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

  const SortTh = ({ colKey, children, align = "left" }) => {
    const active = sort.key === colKey;
    return (
      <th className={`h-10 whitespace-nowrap px-4 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => toggleSort(colKey)}
          className={
            "inline-flex items-center gap-1 transition-colors hover:text-text " + (active ? "text-text" : "")
          }
        >
          {children}
          {active ? (
            sort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
          ) : (
            <ChevronsUpDown size={13} className="opacity-50" />
          )}
        </button>
      </th>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="AGENT PERFORMANCE"
        title="Performance Report"
        description="Per-agent call activity over a date range — busiest dialer on top."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>
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

      <Card compact>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className={`${fieldLabelClass()} w-[150px]`}>
            From
            <DatePicker value={filters.from} onChange={(value) => setFilters((f) => ({ ...f, from: value }))} />
          </label>
          <label className={`${fieldLabelClass()} w-[150px]`}>
            To
            <DatePicker value={filters.to} onChange={(value) => setFilters((f) => ({ ...f, to: value }))} />
          </label>
          <label className={`${fieldLabelClass()} w-[220px]`}>
            Agent
            <Select
              options={agentOptions}
              value={agentOptions.find((o) => o.value === filters.agentId) || agentOptions[0]}
              onChange={(o) => setFilters((f) => ({ ...f, agentId: o?.value || "" }))}
            />
          </label>
          <Button type="submit" icon={Timer} loading={loading} className="h-10">
            Apply
          </Button>
        </form>
      </Card>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <Card compact title="Agents" description={`${rows.length} agent${rows.length === 1 ? "" : "s"} with activity in this range`}>
        {loading ? (
          <SkeletonTable rows={6} cols={9} />
        ) : sortedRows.length ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <SortTh colKey="agent">Agent</SortTh>
                    {PERF_COLUMNS.map((c) => (
                      <SortTh key={c.key} colKey={c.key} align="right">
                        {c.label}
                      </SortTh>
                    ))}
                    <SortTh colKey="talkSec" align="right">Total talk</SortTh>
                    <SortTh colKey="avgTalkSec" align="right">Avg talk</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r, i) => (
                    <tr key={r.agentId || r.agent || i} className="border-t border-border transition-colors hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                            {(r.agent || "?").slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-text">{r.agent}</span>
                            {r.extension && <span className="block text-[11px] text-muted">Ext {r.extension}</span>}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-text">{r.dialed}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-success">{r.connected}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{r.notConnected}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-text">{r.inbound}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-accent">{r.missed}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{r.voicemails}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-text">{formatSeconds(r.talkSec)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{formatSeconds(r.avgTalkSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState icon={Timer} title="No agent activity in this range" />
        )}
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
          description="Per-agent dialed / connected / missed / talk-time over a date range — sorted by busiest dialer, exportable to PDF or Excel."
          onClick={() => setView("performance")}
        />
      </div>
    </div>
  );
}
