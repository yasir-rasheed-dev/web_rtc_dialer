import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Building2,
  Mail,
  PhoneCall,
  PhoneForwarded,
  Plus,
  RefreshCw,
  SkipForward,
  Trash2,
  Upload,
  UserCheck,
  Users
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

function CreateCampaignModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_CAMPAIGN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(EMPTY_CAMPAIGN);
      setError("");
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Campaign name is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createCampaign(form);
      notifySuccess("Campaign created as DRAFT. Upload contacts, assign agents, then set it ACTIVE.");
      onCreated();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New campaign">
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
        <label className={fieldLabel()}>
          Description
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        {error && <div className="col-span-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
        <div className="col-span-2 mt-1 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" icon={Plus} loading={busy}>
            Create campaign
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CampaignsPanel({ permissions }) {
  const can = (key) => permissions.includes(key);
  const canCreate = can("CREATE_CAMPAIGNS") || can("MANAGE_CAMPAIGNS");
  const canManage = can("MANAGE_CAMPAIGNS");
  const canUpload = can("UPLOAD_CONTACTS");
  const canAssign = can("ASSIGN_CONTACTS");
  const canReport = can("VIEW_CAMPAIGN_REPORTS");

  const [campaigns, setCampaigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, userPayload] = await Promise.all([
        listCampaigns(),
        canAssign ? api("/users").catch(() => ({ users: [] })) : Promise.resolve({ users: [] })
      ]);
      setCampaigns(rows);
      setUsers((userPayload.users || []).filter((user) => user.active && user.sipUsername));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [canAssign]);

  useEffect(() => {
    load();
  }, [load]);

  const openCampaign = (id) => {
    setReport(null);
    setSelectedAgents([]);
    setOpenId((current) => (current === id ? null : id));
  };

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
      setOpenId(null);
      await load();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const upload = async (campaign, file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = await uploadCampaignContacts(campaign.id, file);
      notifySuccess(`${result.inserted} contacts imported, ${result.skipped} skipped (of ${result.total} rows).`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const assign = async (campaign) => {
    if (!selectedAgents.length) {
      setError("Select at least one agent.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await assignCampaignAgents(campaign.id, selectedAgents);
      notifySuccess(`${result.assigned} contacts distributed across ${selectedAgents.length} agent(s).`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const showReport = async (campaign) => {
    setError("");
    try {
      setReport(await getCampaignReport(campaign.id));
    } catch (e) {
      setError(e.message);
    }
  };

  const openCampaignRow = useMemo(() => campaigns.find((row) => row.id === openId), [campaigns, openId]);

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
                        <Button size="sm" variant="secondary" onClick={() => openCampaign(row.id)}>
                          {openId === row.id ? "Close" : "Manage"}
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

      <AnimatePresence>
        {openCampaignRow && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card animate={false} title={openCampaignRow.name} description="Contacts, agent assignment and results" icon={Users}>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {canUpload && (
                  <div className="flex flex-col gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
                      <Upload size={15} />
                      Import contacts
                    </h3>
                    <p className="text-xs text-muted">
                      Excel or CSV with a <code>Phone</code> column. <code>Name</code>, <code>Email</code> and <code>Company</code> are optional.
                    </p>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      disabled={busy}
                      onChange={(e) => {
                        upload(openCampaignRow, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      className="rounded-xl border border-dashed border-border p-3 text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                    />
                  </div>
                )}

                {canAssign && (
                  <div className="flex flex-col gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
                      <Users size={15} />
                      Assign agents
                    </h3>
                    <p className="text-xs text-muted">Unassigned contacts are split round-robin across the agents you pick.</p>
                    <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-border p-3 sm:grid-cols-2">
                      {users.map((user) => (
                        <label key={user.id} className="flex items-center gap-2 text-sm text-text">
                          <input
                            type="checkbox"
                            checked={selectedAgents.includes(user.id)}
                            onChange={(e) =>
                              setSelectedAgents((current) =>
                                e.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id)
                              )
                            }
                            className="h-4 w-4 shrink-0 rounded border-border-strong accent-[rgb(var(--rn-blue))]"
                          />
                          <span className="truncate">
                            {user.name}
                            <span className="block text-xs text-muted">{user.roleName}</span>
                          </span>
                        </label>
                      ))}
                      {!users.length && <p className="col-span-2 text-xs text-muted">No SIP-enabled agents found</p>}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={UserCheck}
                      loading={busy}
                      disabled={!selectedAgents.length}
                      onClick={() => assign(openCampaignRow)}
                    >
                      Distribute contacts
                    </Button>
                  </div>
                )}

                {canReport && (
                  <div className="flex flex-col gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
                      <BarChart3 size={15} />
                      Results
                    </h3>
                    <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => showReport(openCampaignRow)}>
                      Load report
                    </Button>
                    {report && (
                      <>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                          <span>
                            Total <strong className="text-text">{report.summary?.total || 0}</strong>
                          </span>
                          <span>
                            Connected <strong className="text-text">{report.summary?.connected || 0}</strong>
                          </span>
                          <span>
                            No answer <strong className="text-text">{report.summary?.no_answer || 0}</strong>
                          </span>
                          <span>
                            Busy <strong className="text-text">{report.summary?.busy || 0}</strong>
                          </span>
                          <span>
                            Completed <strong className="text-text">{report.summary?.completed || 0}</strong>
                          </span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-border font-semibold uppercase tracking-wide text-muted">
                                <th className="px-3 py-2">Agent</th>
                                <th className="px-3 py-2">Calls</th>
                                <th className="px-3 py-2">Connected</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(report.agents || []).map((row, index) => (
                                <tr key={row.name || index} className="border-b border-border/60 last:border-0">
                                  <td className="px-3 py-2 text-text">{row.name || "Unassigned"}</td>
                                  <td className="px-3 py-2 text-muted">{row.total_calls}</td>
                                  <td className="px-3 py-2 text-muted">{row.connected || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!report.agents?.length && <p className="p-3 text-center text-xs text-muted">No agent activity yet</p>}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <CreateCampaignModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
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
