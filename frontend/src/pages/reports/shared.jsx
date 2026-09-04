import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Filter } from "lucide-react";

import Button from "../../components/ui/Button";
import DatePicker from "../../components/ui/DatePicker";
import { FIELD_CLASS } from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { api } from "../../lib/api";
import { formatInWorkspaceTz } from "../../lib/tz";

// Building blocks shared by every direction-specific report in ReportsHub.jsx.

export function formatSeconds(value = 0) {
  const seconds = Number(value) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${rest}s` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

// Workspace-timezone aware (see lib/tz) — reports read in the tenant's
// wall clock regardless of where the viewer is.
export function formatDate(value) {
  return formatInWorkspaceTz(value);
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

export function fieldLabelClass() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

// Matches the Create Role modal field — flat white, visible border, h-10,
// soft blue focus ring. Used for the free-text filter inputs so every
// control in the filter row is the same height.
export const FILTER_INPUT =
  "h-10 w-full rounded-lg border border-border-strong bg-surface px-3.5 text-sm text-text placeholder:text-muted transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

export function ReportFilters({ filters, setFilters, onApply, agents, loading }) {
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
          className={FILTER_INPUT}
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
          className={FILTER_INPUT}
        />
      </label>
      <Button type="submit" icon={Filter} loading={loading} className="h-10">
        Apply
      </Button>
    </form>
  );
}

export function CustomPagination({ result, pageSize, onPageSizeChange, onPageChange }) {
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

export function ExportProgressModal({ open, format, percent, done, onClose }) {
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
