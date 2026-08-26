import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Download,
  Mail,
  Pencil,
  Phone,
  PhoneCall,
  PhoneForwarded,
  Play,
  Plus,
  RefreshCw,
  SkipForward,
  Trash2,
  Upload,
  UserCheck,
  Users,
  UsersRound
} from "lucide-react";

import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import Input from "./components/ui/Input";
import Modal from "./components/ui/Modal";
import PageHeader from "./components/ui/PageHeader";
import Select from "./components/ui/Select";
import { SkeletonTable } from "./components/ui/Skeleton";
import StatusBadge from "./components/ui/StatusBadge";
import { confirmModal } from "./lib/modal";
import { notifyError, notifySuccess } from "./lib/toast";
import { api } from "./lib/api";
import {
  DIALER_OUTCOMES,
  assignCampaignAgents,
  createCampaign,
  deleteCampaign,
  getCampaignContacts,
  getCampaignDetail,
  getCampaignReport,
  getNextContact,
  listCampaigns,
  saveDisposition,
  startContactCall,
  suggestOutcome,
  updateCampaign,
  uploadCampaignContacts
} from "./lib/campaignApi";

const CAMPAIGN_STATUS_OPTIONS = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"].map((value) => ({ value, label: value }));
const MODE_OPTIONS = [
  { value: "CLICK_TO_CALL", label: "Click to call" },
  { value: "PREVIEW", label: "Preview" }
];

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function fieldLabel() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

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

// ===============================
// AGENT DIALER
// ===============================

function DialerPanel({ permissions, sipReady }) {
  const canSkip = permissions.includes("SKIP_CONTACT");

  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState("");
  const [contact, setContact] = useState(null);
  const [dispositions, setDispositions] = useState([]);
  const [pending, setPending] = useState(0);
  const [stage, setStage] = useState("idle"); // idle | ready | calling | wrapup
  const [callLogId, setCallLogId] = useState(null);
  const [outcome, setOutcome] = useState("CONNECTED");
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [softphone, setSoftphone] = useState(
    () => window.ringnexSoftphoneState || { registered: false, callStatus: "idle" }
  );

  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    listCampaigns()
      .then((rows) => {
        const active = rows.filter((row) => row.status === "ACTIVE");
        setCampaigns(active);
        setCampaignId((current) => current || active[0]?.id || "");
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const onState = (event) => setSoftphone(event.detail);
    window.addEventListener("ringnex:softphone-state", onState);
    return () => window.removeEventListener("ringnex:softphone-state", onState);
  }, []);

  useEffect(() => {
    const onEnded = (event) => {
      if (stageRef.current !== "calling") return;
      const detail = event.detail || {};
      setDuration(detail.duration || 0);
      setOutcome(suggestOutcome(detail.outcome, detail.connected));
      setStage("wrapup");
    };
    window.addEventListener("ringnex:call-ended", onEnded);
    return () => window.removeEventListener("ringnex:call-ended", onEnded);
  }, []);

  const resetWrapUp = () => {
    setCallLogId(null);
    setOutcome("CONNECTED");
    setDisposition("");
    setNotes("");
    setDuration(0);
  };

  const fetchNext = useCallback(async () => {
    if (!campaignId) return;
    setBusy(true);
    setError("");
    setNotice("");
    resetWrapUp();
    try {
      const payload = await getNextContact(campaignId);
      setDispositions(payload.dispositions || []);
      setPending(payload.pending || 0);
      if (payload.contact) {
        setContact(payload.contact);
        setStage("ready");
      } else {
        setContact(null);
        setStage("idle");
        setNotice(payload.message || "No contact available.");
      }
    } catch (e) {
      setError(e.message);
      setContact(null);
      setStage("idle");
    } finally {
      setBusy(false);
    }
  }, [campaignId]);

  const callNow = async () => {
    if (!contact) return;
    setError("");
    if (typeof window.ringnexDial !== "function") {
      setError("The softphone is not loaded. Open the Agent dialer page once, then try again.");
      return;
    }
    setBusy(true);
    try {
      // Record the attempt first so a contact is never dialled without a call log.
      const started = await startContactCall(contact.id);
      setCallLogId(started.callLogId);
      setStage("calling");
      await window.ringnexDial(started.phone, { displayName: contact.name || "Campaign contact" });
    } catch (e) {
      setError(e.message);
      // The SIP leg never started — go straight to wrap-up so the attempt is
      // dispositioned instead of silently leaving the contact locked.
      setOutcome("FAILED");
      setStage("wrapup");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (chosenOutcome) => {
    if (!contact) return;
    setBusy(true);
    setError("");
    try {
      await saveDisposition({
        contactId: contact.id,
        callLogId,
        outcome: chosenOutcome,
        disposition: disposition || null,
        notes: notes || null,
        duration
      });
      notifySuccess(chosenOutcome === "SKIPPED" ? "Contact skipped." : "Disposition saved.");
      await fetchNext();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const selectedCampaign = campaigns.find((row) => row.id === campaignId);
  const campaignOptions = campaigns.map((row) => ({ value: row.id, label: row.name }));
  const dispositionOptions = dispositions.map((name) => ({ value: name, label: name }));
  const callActive = softphone.callStatus !== "idle";
  const dialBlocked = !sipReady || !softphone.registered;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="CAMPAIGN CALLING"
        title="Auto dialer"
        description="Contacts are handed out one at a time and held for you until you disposition them."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={busy} disabled={!campaignId} onClick={fetchNext}>
            Refresh
          </Button>
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
      {dialBlocked && (
        <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          Your SIP account is not registered. Open <strong>Agent dialer</strong> and connect the softphone before calling.
        </div>
      )}

      <Card animate={false}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1">
            <Select
              options={campaignOptions}
              value={campaignOptions.find((option) => option.value === campaignId) || null}
              onChange={(option) => {
                setCampaignId(option?.value || "");
                setContact(null);
                setStage("idle");
              }}
              isDisabled={stage !== "idle"}
              placeholder="Select an active campaign"
            />
          </div>
          {selectedCampaign && (
            <StatusBadge tone="brand">
              {selectedCampaign.mode === "PREVIEW" ? "Preview" : "Click to call"} · max {selectedCampaign.max_attempts} attempts
            </StatusBadge>
          )}
          <span className="text-xs text-muted">
            {pending} contact{pending === 1 ? "" : "s"} left for you
          </span>
        </div>
        {!campaigns.length && (
          <EmptyState className="mt-4" icon={PhoneForwarded} title="No active campaign is assigned to you yet." />
        )}
      </Card>

      {stage === "idle" && (
        <Card animate={false}>
          <EmptyState
            icon={PhoneForwarded}
            title={notice || "Fetch a contact to start dialling."}
            action={
              <Button icon={PhoneForwarded} loading={busy} disabled={!campaignId} onClick={fetchNext}>
                Get next contact
              </Button>
            }
          />
        </Card>
      )}

      {contact && stage !== "idle" && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <Card animate={false} className="flex-1">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text">{contact.name || "Unnamed contact"}</h2>
                <p className="mt-1 text-xs text-muted">
                  Attempt {contact.attempt_count + (stage === "ready" ? 1 : 0)} of {selectedCampaign?.max_attempts || 3}
                </p>
              </div>
              <StatusBadge tone={stage === "calling" ? "success" : "neutral"}>{stage.toUpperCase()}</StatusBadge>
            </div>

            <div className="flex flex-col gap-2 text-sm text-muted">
              <div className="flex items-center gap-2 font-semibold text-text">
                <PhoneCall size={15} />
                {contact.phone}
              </div>
              {contact.company && (
                <div className="flex items-center gap-2">
                  <Building2 size={15} />
                  {contact.company}
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2">
                  <Mail size={15} />
                  {contact.email}
                </div>
              )}
              {contact.last_called_at && (
                <div className="flex items-center gap-2">
                  <RefreshCw size={15} />
                  Last called {formatDate(contact.last_called_at)}
                </div>
              )}
              {contact.disposition && (
                <div className="flex items-center gap-2">
                  <UserCheck size={15} />
                  Previous: {contact.disposition}
                </div>
              )}
            </div>
            {contact.notes && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">{contact.notes}</p>}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {stage === "ready" && (
                <Button icon={PhoneCall} loading={busy} disabled={dialBlocked || callActive} onClick={callNow}>
                  Call now
                </Button>
              )}
              {stage === "calling" && (
                <StatusBadge tone="success" icon={PhoneCall}>
                  Call in progress — hang up in the softphone to disposition
                </StatusBadge>
              )}
              {stage === "ready" && canSkip && (
                <Button variant="secondary" icon={SkipForward} loading={busy} onClick={() => submit("SKIPPED")}>
                  Skip
                </Button>
              )}
              {stage === "calling" && (
                <Button variant="secondary" loading={busy} onClick={() => setStage("wrapup")}>
                  Disposition now
                </Button>
              )}
            </div>
          </Card>

          {stage === "wrapup" && (
            <Card animate={false} className="w-full lg:w-[380px]" title="Wrap up" description={`Talk time ${formatDuration(duration)}`} icon={UserCheck}>
              <div className="flex flex-col gap-3">
                <label className={fieldLabel()}>
                  Outcome
                  <Select
                    options={DIALER_OUTCOMES}
                    value={DIALER_OUTCOMES.find((item) => item.value === outcome) || null}
                    onChange={(option) => setOutcome(option?.value || "CONNECTED")}
                  />
                </label>
                <label className={fieldLabel()}>
                  Disposition
                  {dispositionOptions.length ? (
                    <Select
                      options={dispositionOptions}
                      value={dispositionOptions.find((option) => option.value === disposition) || null}
                      onChange={(option) => setDisposition(option?.value || "")}
                      placeholder="None"
                      isClearable
                    />
                  ) : (
                    <Input value={disposition} onChange={(e) => setDisposition(e.target.value)} placeholder="e.g. Interested" />
                  )}
                </label>
                <label className={fieldLabel()}>
                  Notes
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What happened on this call?"
                    className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <Button loading={busy} onClick={() => submit(outcome)} className="w-full justify-center">
                  Save & next contact
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ===============================
// CAMPAIGN MANAGEMENT
// ===============================

const EMPTY_CAMPAIGN = {
  name: "",
  description: "",
  mode: "CLICK_TO_CALL",
  maxAttempts: 3,
  retryDelayMinutes: 30
};

function CreateCampaignModal({ open, onClose, campaign, onSaved }) {
  const [form, setForm] = useState(EMPTY_CAMPAIGN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      campaign
        ? {
            name: campaign.name || "",
            description: campaign.description || "",
            mode: campaign.mode || "CLICK_TO_CALL",
            maxAttempts: campaign.max_attempts || 3,
            retryDelayMinutes: campaign.retry_delay_minutes || 30
          }
        : EMPTY_CAMPAIGN
    );
  }, [open, campaign]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Campaign name is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (campaign) {
        // updateCampaign writes every column, so merge onto the full record
        // rather than sending just the fields this form edits.
        await updateCampaign({ ...campaign, ...form });
        notifySuccess("Campaign updated.");
      } else {
        await createCampaign(form);
        notifySuccess("Campaign created as DRAFT. Upload contacts, assign agents, then set it ACTIVE.");
      }
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={campaign ? "Edit campaign" : "New campaign"}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <label className={`${fieldLabel()} col-span-2`}>
          Name<span className="text-danger">*</span>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
        </label>
        <label className={fieldLabel()}>
          Mode
          <Select
            options={MODE_OPTIONS}
            value={MODE_OPTIONS.find((option) => option.value === form.mode) || null}
            onChange={(option) => setForm({ ...form, mode: option?.value || "CLICK_TO_CALL" })}
          />
        </label>
        <label className={fieldLabel()}>
          Max attempts
          <Input
            type="number"
            min={1}
            max={10}
            value={form.maxAttempts}
            onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })}
          />
        </label>
        <label className={fieldLabel()}>
          Retry delay (minutes)
          <Input
            type="number"
            min={1}
            max={1440}
            value={form.retryDelayMinutes}
            onChange={(e) => setForm({ ...form, retryDelayMinutes: Number(e.target.value) })}
          />
        </label>
        <label className={`${fieldLabel()} col-span-2`}>
          Description
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        {error && <div className="col-span-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
        <div className="col-span-2 mt-1 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" icon={campaign ? Pencil : Plus} loading={busy}>
            {campaign ? "Save changes" : "Create campaign"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignAgentsModal({ open, onClose, campaign, users, onAssigned }) {
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setSelected([]);
      setError("");
    }
  }, [open]);

  const options = useMemo(() => users.map((user) => ({ value: user.id, label: `${user.name} · ${user.roleName}` })), [users]);

  const submit = async () => {
    if (!selected.length) {
      setError("Select at least one agent.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await assignCampaignAgents(
        campaign.id,
        selected.map((option) => option.value)
      );
      notifySuccess(`${result.assigned} contacts distributed across ${selected.length} agent(s).`);
      onAssigned();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Assign agents">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          Search and pick one or more agents. Unassigned contacts are split round-robin across everyone you select.
        </p>
        <Select isMulti isSearchable options={options} value={selected} onChange={(value) => setSelected(value || [])} placeholder="Search agents…" />
        {!users.length && <p className="text-xs text-muted">No SIP-enabled agents found.</p>}
        {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
        <div className="mt-1 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" icon={UserCheck} loading={busy} disabled={!selected.length} onClick={submit}>
            Distribute contacts
          </Button>
        </div>
      </div>
    </Modal>
  );
}

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

function CampaignDetailView({ campaignId, permissions, onBack, onDeleted }) {
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

function CampaignsPanel({ permissions }) {
  const can = (key) => permissions.includes(key);
  const canCreate = can("CREATE_CAMPAIGNS") || can("MANAGE_CAMPAIGNS");
  const canManage = can("MANAGE_CAMPAIGNS");

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCampaigns(await listCampaigns());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (campaign, status) => {
    try {
      await updateCampaign({ ...campaign, status });
      notifySuccess(`Campaign set to ${status}.`);
      await load();
    } catch (e) {
      notifyError(e.message);
    }
  };

  const removeCampaign = async (campaign) => {
    const confirmed = await confirmModal({
      title: "Delete campaign",
      message: `Delete "${campaign.name}"? Its contacts and call history stay in the database, but the campaign disappears from this list.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    setDeletingId(campaign.id);
    try {
      await deleteCampaign(campaign.id);
      notifySuccess("Campaign deleted.");
      await load();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (openId) {
    return (
      <CampaignDetailView
        campaignId={openId}
        permissions={permissions}
        onBack={() => setOpenId(null)}
        onDeleted={() => {
          setOpenId(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="OUTBOUND CAMPAIGNS"
        title="Campaigns"
        description="Create a campaign, import contacts from Excel, distribute them to agents, then activate it."
        actions={
          <>
            {canCreate && (
              <Button icon={Plus} onClick={() => setCreateOpen(true)}>
                New campaign
              </Button>
            )}
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>
              Refresh
            </Button>
          </>
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card animate={false} title="All campaigns" description={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`} icon={BarChart3}>
        {loading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : campaigns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Campaign</th>
                  <th className="pb-2 pr-4">Mode</th>
                  <th className="pb-2 pr-4">Contacts</th>
                  <th className="pb-2 pr-4">Connected</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text">{row.name}</p>
                      <p className="max-w-[220px] truncate text-xs text-muted">{row.description || formatDate(row.created_at)}</p>
                    </td>
                    <td className="py-3 pr-4 text-muted">{row.mode === "PREVIEW" ? "Preview" : "Click to call"}</td>
                    <td className="py-3 pr-4 text-muted">{row.total_contacts || 0}</td>
                    <td className="py-3 pr-4 text-muted">{row.connected_contacts || 0}</td>
                    <td className="py-3 pr-4">
                      {canManage ? (
                        <div className="w-36">
                          <Select
                            className="text-xs"
                            isSearchable={false}
                            options={CAMPAIGN_STATUS_OPTIONS}
                            value={CAMPAIGN_STATUS_OPTIONS.find((option) => option.value === row.status) || null}
                            onChange={(option) => changeStatus(row, option.value)}
                          />
                        </div>
                      ) : (
                        <StatusBadge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status}</StatusBadge>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setOpenId(row.id)}>
                          Manage
                        </Button>
                        {canManage && (
                          <button
                            onClick={() => removeCampaign(row)}
                            disabled={deletingId === row.id}
                            className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                            aria-label={`Delete ${row.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No campaigns yet"
            action={
              canCreate ? (
                <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
                  New campaign
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      <CreateCampaignModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        campaign={null}
        onSaved={() => {
          setCreateOpen(false);
          load();
        }}
      />
    </div>
  );
}

// ===============================
export default function AutoDialer({ permissions = [], sipReady = false }) {
  const canDial = permissions.includes("USE_AUTO_DIALER");
  const canManage = ["VIEW_CAMPAIGNS", "CREATE_CAMPAIGNS", "MANAGE_CAMPAIGNS", "UPLOAD_CONTACTS", "ASSIGN_CONTACTS", "VIEW_CAMPAIGN_REPORTS"]
    .some((key) => permissions.includes(key));

  const [tab, setTab] = useState(canDial ? "dialer" : "campaigns");

  if (!canDial && !canManage) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState icon={PhoneForwarded} title="Auto dialer is not enabled for your role." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {canDial && canManage && (
        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("dialer")}
            className={`flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
              tab === "dialer" ? "border-brand text-brand" : "border-transparent text-muted hover:text-text"
            }`}
          >
            <PhoneForwarded size={14} />
            Dialer
          </button>
          <button
            type="button"
            onClick={() => setTab("campaigns")}
            className={`flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
              tab === "campaigns" ? "border-brand text-brand" : "border-transparent text-muted hover:text-text"
            }`}
          >
            <BarChart3 size={14} />
            Campaigns
          </button>
        </div>
      )}
      {canDial && (!canManage || tab === "dialer") ? (
        <DialerPanel permissions={permissions} sipReady={sipReady} />
      ) : (
        <CampaignsPanel permissions={permissions} />
      )}
    </div>
  );
}
