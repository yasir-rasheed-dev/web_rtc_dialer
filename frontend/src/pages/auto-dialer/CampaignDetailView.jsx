import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Pencil, PhoneCall, Play, RefreshCw, Trash2, Upload, Users, UsersRound } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";
import { api } from "../../lib/api";
import { deleteCampaign, getCampaignContacts, getCampaignDetail, updateCampaign, uploadCampaignContacts } from "../../lib/campaignApi";
import { AssignAgentsModal, CreateCampaignModal } from "./modals";

// Client-side only — matches the columns uploadCampaignContacts (backend)
// actually reads (Phone required; Name/Email/Company optional), so a file
// built from this template is guaranteed to import cleanly.
function downloadSampleTemplate() {
  const csv = [
    "Phone,Name,Email,Company",
    "+15550123456,Jane Doe,jane@example.com,Acme Inc",
    "+15550789012,John Smith,john@example.com,Globex Corp"
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "campaign-contacts-template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const CONTACT_STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "connected", label: "Connected" },
  { id: "failed", label: "Failed" },
  { id: "retry", label: "Retry" }
];

const CONTACT_STATUS_TONE = {
  NEW: "neutral",
  ASSIGNED: "neutral",
  READY: "brand",
  CALLING: "brand",
  CONNECTED: "success",
  COMPLETED: "success",
  NO_ANSWER: "warning",
  BUSY: "warning",
  CALLBACK: "warning",
  FAILED: "danger",
  DNC: "danger"
};

const STAT_TONE_CLASS = {
  default: "bg-surface-2 text-text",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  brand: "bg-brand/10 text-brand"
};

function CampaignStat({ label, value, tone = "default" }) {
  return (
    <div className={`rounded-2xl border border-border p-4 ${STAT_TONE_CLASS[tone] || STAT_TONE_CLASS.default}`}>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

const EMPTY_CONTACTS_RESULT = { contacts: [], total: 0, page: 1, pageSize: 25, counts: { total: 0, pending: 0, connected: 0, failed: 0, retry: 0 } };

export default function CampaignDetailView({ campaignId, permissions, onBack, onDeleted }) {
  const can = (key) => permissions.includes(key);
  const canManage = can("MANAGE_CAMPAIGNS");
  const canUpload = can("UPLOAD_CONTACTS");
  const canAssign = can("ASSIGN_CONTACTS");

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState(EMPTY_CONTACTS_RESULT);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getCampaignDetail(campaignId));
    } catch (e) {
      notifyError(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      setContacts(await getCampaignContacts(campaignId, { status: statusFilter, page, pageSize: 25 }));
    } catch (e) {
      notifyError(e.message);
    } finally {
      setContactsLoading(false);
    }
  }, [campaignId, statusFilter, page]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);
  useEffect(() => {
    if (!canAssign) return;
    api("/users")
      .then((payload) => setUsers((payload.users || []).filter((user) => user.active && user.sipUsername)))
      .catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAssign]);
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const campaign = detail?.campaign;

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      await updateCampaign({ ...campaign, status });
      notifySuccess(`Campaign set to ${status}.`);
      await loadDetail();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeCampaign = async () => {
    const confirmed = await confirmModal({
      title: "Delete campaign",
      message: `Delete "${campaign.name}"? Its contacts and call history stay in the database, but the campaign disappears from this list.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteCampaign(campaign.id);
      notifySuccess("Campaign deleted.");
      onDeleted();
    } catch (e) {
      notifyError(e.message);
      setDeleting(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadCampaignContacts(campaign.id, file);
      notifySuccess(`${result.inserted} contacts imported, ${result.skipped} skipped (of ${result.total} rows).`);
      await Promise.all([loadDetail(), loadContacts()]);
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !campaign) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>
          Back to campaigns
        </Button>
        <SkeletonTable rows={4} cols={5} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(contacts.total / contacts.pageSize));
  const roundRobinAgent = detail.agents.length && detail.agents[0].assignment_type === "ROUND_ROBIN";

  return (
    <div className="flex flex-col gap-6">
      <Card animate={false}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <PhoneCall size={19} />
            </span>
            <div>
              <h1 className="text-lg font-bold text-text">{campaign.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge tone={campaign.status === "ACTIVE" ? "success" : "neutral"}>{campaign.status}</StatusBadge>
                <StatusBadge tone="brand">{campaign.mode === "PREVIEW" ? "Preview" : "Click to call"}</StatusBadge>
                {roundRobinAgent && <span className="text-xs text-muted">Round Robin</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canUpload && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={downloadSampleTemplate}
                  title="Download a sample CSV with the expected columns"
                  className="hidden items-center gap-1.5 text-xs font-medium text-brand hover:underline sm:inline-flex"
                >
                  <Download size={13} />
                  Sample template
                </button>
                <Button variant="secondary" size="sm" icon={Upload} loading={busy} onClick={() => fileInputRef.current?.click()}>
                  Upload
                </Button>
              </>
            )}
            {canManage && (
              <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
            {canManage && campaign.status !== "ACTIVE" && (
              <Button size="sm" icon={Play} loading={busy} onClick={() => changeStatus("ACTIVE")}>
                Start
              </Button>
            )}
            {canManage && campaign.status === "ACTIVE" && (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => changeStatus("PAUSED")}>
                Pause
              </Button>
            )}
            {canManage && (
              <Button variant="danger" size="icon" icon={Trash2} loading={deleting} onClick={removeCampaign} aria-label="Delete campaign" />
            )}
            <Button variant="icon" size="icon" icon={ArrowLeft} onClick={onBack} aria-label="Back to campaigns" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <CampaignStat label="Total" value={contacts.counts.total} />
        <CampaignStat label="Pending" value={contacts.counts.pending} tone="warning" />
        <CampaignStat label="Connected" value={contacts.counts.connected} tone="success" />
        <CampaignStat label="Failed" value={contacts.counts.failed} tone="danger" />
        <CampaignStat label="Retry" value={contacts.counts.retry} tone="brand" />
      </div>

      <Card animate={false}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Max retries</p>
            <p className="mt-1 text-sm font-semibold text-text">{campaign.max_attempts}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Retry delay</p>
            <p className="mt-1 text-sm font-semibold text-text">{campaign.retry_delay_minutes}m</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Caller ID</p>
            <p className="mt-1 text-sm font-semibold text-text">—</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total queued</p>
            <p className="mt-1 text-sm font-semibold text-text">{contacts.counts.total}</p>
          </div>
        </div>
      </Card>

      <Card
        animate={false}
        title={`${detail.agents.length} Agent${detail.agents.length === 1 ? "" : "s"}${roundRobinAgent ? " · Round Robin" : ""}`}
        actions={
          canAssign && (
            <Button variant="secondary" size="sm" icon={Users} onClick={() => setAssignOpen(true)}>
              Assign agents
            </Button>
          )
        }
      >
        {detail.agents.length ? (
          <div className="flex flex-wrap gap-2">
            {detail.agents.map((agent) => (
              <span key={agent.user_id} className="flex items-center gap-2 rounded-full bg-surface-2 py-1.5 pl-1.5 pr-3 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning-soft text-[10px] font-bold text-warning">
                  {agent.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="font-medium text-text">{agent.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <EmptyState icon={UsersRound} title="No agents assigned yet" />
        )}
      </Card>

      <Card animate={false}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text">Contact Queue ({contacts.total})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
              {CONTACT_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStatusFilter(filter.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === filter.id ? "bg-brand text-white" : "text-muted hover:text-text"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={contactsLoading} onClick={loadContacts}>
              Refresh
            </Button>
          </div>
        </div>

        {contactsLoading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : contacts.contacts.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4">Contact</th>
                    <th className="pb-2 pr-4">Phone</th>
                    <th className="pb-2 pr-4">Agent</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.contacts.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4 font-medium text-text">{row.name || "—"}</td>
                      <td className="py-3 pr-4 text-muted">{row.phone}</td>
                      <td className="py-3 pr-4 text-muted">{row.agent_name || "Unassigned"}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge tone={CONTACT_STATUS_TONE[row.status] || "neutral"}>{row.status}</StatusBadge>
                      </td>
                      <td className="py-3 text-muted">{row.attempt_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4 text-xs text-muted">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            icon={Upload}
            title="No contacts yet"
            action={
              canUpload ? (
                <Button icon={Upload} onClick={() => fileInputRef.current?.click()}>
                  Upload Contacts
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      <CreateCampaignModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        campaign={campaign}
        onSaved={() => {
          setEditOpen(false);
          loadDetail();
        }}
      />
      <AssignAgentsModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        campaign={campaign}
        users={users}
        onAssigned={() => {
          setAssignOpen(false);
          loadDetail();
          loadContacts();
        }}
      />
    </div>
  );
}
