import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Rocket, XCircle } from "lucide-react";

import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { notifyError, notifySuccess } from "../../lib/toast";
import { superApi } from "../../lib/api";
import { CreateSetupModal } from "./modals";

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "brand",
  REJECTED: "danger",
  PROVISIONED: "success"
};

const FILTERS = [
  { key: "", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "PROVISIONED", label: "Provisioned" }
];

function fmt(v) {
  return v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default function OnboardingPage({ plans, tenants, onReload }) {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // detail modal request
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [createFor, setCreateFor] = useState(null); // request being turned into a setup

  const load = async () => {
    setLoading(true);
    try {
      const res = await superApi(`/super-admin/onboarding${filter ? `?status=${filter}` : ""}`);
      setRows(res.requests || []);
      setCounts(res.counts || {});
    } catch (e) {
      notifyError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const openDetail = (r) => {
    setActive(r);
    setRemark(r.remark || "");
  };

  const patch = async (body, okMsg) => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await superApi(`/super-admin/onboarding/${active.id}`, { method: "PATCH", body });
      setActive(res.request);
      notifySuccess(okMsg);
      load();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo(
    () => [
      { key: "company", header: "Company", sortable: true, sortValue: (r) => r.companyName, cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-text">{r.companyName}</div>
          <div className="truncate text-[11px] text-muted">{r.workspaceSlug}.ringnex.co</div>
        </div>
      ) },
      { key: "contact", header: "Contact", cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-text">{r.contactName}</div>
          <div className="truncate text-[11px] text-muted">{r.contactEmail}</div>
        </div>
      ) },
      { key: "plan", header: "Plan", cell: (r) => r.planName || r.planCode || "—" },
      { key: "status", header: "Status", sortable: true, sortValue: (r) => r.status, cell: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status] || "neutral"}>{r.status}</StatusBadge>
      ) },
      { key: "created", header: "Submitted", sortable: true, sortValue: (r) => r.createdAt, cell: (r) => (
        <span className="whitespace-nowrap text-muted">{fmt(r.createdAt)}</span>
      ) }
    ],
    []
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Intake"
        title="Onboarding requests"
        description="Prospects who filled the form on ringnex.co. Review, add a remark, then create their setup."
        actions={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={load}>Refresh</Button>}
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = f.key ? counts[f.key.toLowerCase()] : undefined;
          const on = filter === f.key;
          return (
            <button
              key={f.key || "all"}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                on ? "border-brand bg-brand text-white" : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              {f.label}
              {n != null && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${on ? "bg-white/20 text-white" : "bg-surface-2 text-muted"}`}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        getRowKey={(r) => r.id}
        onRowClick={openDetail}
        searchKeys={["companyName", "contactName", "contactEmail", "workspaceSlug"]}
        searchPlaceholder="Search company, contact, workspace…"
        initialSort={{ key: "created", dir: "desc" }}
        emptyState={<EmptyState title="No requests" description="Nothing in this bucket yet." />}
      />

      {/* ---- detail ---- */}
      <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active?.companyName || "Request"} width="max-w-2xl">
        {active && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <StatusBadge tone={STATUS_TONE[active.status] || "neutral"}>{active.status}</StatusBadge>
              <span className="text-xs text-muted">Submitted {fmt(active.createdAt)}</span>
            </div>

            <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-2">Workspace</dt><dd className="text-text">{active.workspaceSlug}.ringnex.co</dd>
              <dt className="text-muted-2">Contact</dt><dd className="text-text">{active.contactName} · {active.contactEmail}{active.contactPhone ? ` · ${active.contactPhone}` : ""}</dd>
              <dt className="text-muted-2">Country / size</dt><dd className="text-text">{active.country || "—"} · {active.teamSize || "—"}</dd>
              <dt className="text-muted-2">Plan</dt><dd className="text-text">{active.planName || active.planCode || "—"}</dd>
              <dt className="text-muted-2">Agents to start</dt><dd className="text-text">{active.agentsNeeded ?? "—"}</dd>
              <dt className="text-muted-2">Wants</dt><dd className="text-text">
                {[active.needsTollFree && "Toll-free / IVR", active.needsAutoDialer && "Auto dialer", active.needsNumbers && "Buy numbers"].filter(Boolean).join(", ") || "—"}
              </dd>
              <dt className="text-muted-2">Use case</dt><dd className="whitespace-pre-wrap text-text">{active.useCase || "—"}</dd>
              <dt className="text-muted-2">Notes</dt><dd className="whitespace-pre-wrap text-text">{active.extraNotes || "—"}</dd>
              {active.provisionedTenantId && (
                <>
                  <dt className="text-muted-2">Provisioned</dt><dd className="text-text">tenant {active.provisionedTenantId}</dd>
                </>
              )}
            </dl>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              <span>Super Admin remark</span>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                placeholder="Internal note against this request…"
              />
            </label>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" size="sm" loading={busy} onClick={() => patch({ remark }, "Remark saved")}>Save remark</Button>
              {active.status !== "REJECTED" && (
                <Button variant="danger" size="sm" icon={XCircle} loading={busy} onClick={() => patch({ status: "REJECTED", remark }, "Marked rejected")}>Reject</Button>
              )}
              {active.status === "PENDING" && (
                <Button variant="secondary" size="sm" icon={CheckCircle2} loading={busy} onClick={() => patch({ status: "APPROVED", remark }, "Marked approved")}>Approve</Button>
              )}
              {active.status !== "PROVISIONED" && (
                <Button size="sm" icon={Rocket} onClick={() => { setCreateFor(active); setActive(null); }}>Create setup</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ---- create setup from request ---- */}
      <CreateSetupModal
        open={Boolean(createFor)}
        onClose={() => setCreateFor(null)}
        plans={plans}
        tenants={tenants}
        prefill={createFor}
        onCreated={async (tenant) => {
          const reqId = createFor?.id;
          setCreateFor(null);
          if (reqId && tenant?.id) {
            try {
              await superApi(`/super-admin/onboarding/${reqId}`, {
                method: "PATCH",
                body: { status: "PROVISIONED", provisionedTenantId: tenant.id }
              });
            } catch (e) {
              notifyError(`Setup created, but couldn't mark the request provisioned: ${e.message}`);
            }
          }
          load();
          onReload?.();
        }}
      />
    </div>
  );
}
