import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"];

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
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
      setNotice(chosenOutcome === "SKIPPED" ? "Contact skipped." : "Disposition saved.");
      await fetchNext();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const selectedCampaign = campaigns.find((row) => row.id === campaignId);
  const callActive = softphone.callStatus !== "idle";
  const dialBlocked = !sipReady || !softphone.registered;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <span className="overline">CAMPAIGN CALLING</span>
          <h1>Auto dialer</h1>
          <p>Contacts are handed out one at a time and held for you until you disposition them.</p>
        </div>
        <button className="secondary-action" onClick={fetchNext} disabled={!campaignId || busy}>
          <RefreshCw size={16} />Refresh
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && !error && <div className="alert">{notice}</div>}
      {dialBlocked && (
        <div className="alert error">
          Your SIP account is not registered. Open <strong>Agent dialer</strong> and connect the softphone before calling.
        </div>
      )}

      <section className="console-card">
        <div className="card-title">
          <div>
            <h2>Campaign</h2>
            <p>Only campaigns you are assigned to will hand out contacts.</p>
          </div>
          <PhoneForwarded size={20} />
        </div>
        <div className="dialer-campaign-bar">
          <select
            className="select-control"
            value={campaignId}
            onChange={(e) => { setCampaignId(e.target.value); setContact(null); setStage("idle"); }}
            disabled={stage !== "idle"}
          >
            <option value="">Select an active campaign</option>
            {campaigns.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
          {selectedCampaign && (
            <span className="system-pill ok">
              {selectedCampaign.mode === "PREVIEW" ? "Preview" : "Click to call"} · max {selectedCampaign.max_attempts} attempts
            </span>
          )}
          <span className="dialer-pending">{pending} contact{pending === 1 ? "" : "s"} left for you</span>
        </div>
        {!campaigns.length && <div className="empty-block">No active campaign is assigned to you yet.</div>}
      </section>

      {stage === "idle" && (
        <section className="console-card">
          <div className="empty-block">
            <p>{notice || "Fetch a contact to start dialling."}</p>
            <button className="primary-action" onClick={fetchNext} disabled={!campaignId || busy}>
              <PhoneForwarded size={17} />{busy ? "Loading…" : "Get next contact"}
            </button>
          </div>
        </section>
      )}

      {contact && stage !== "idle" && (
        <div className="dialer-workspace">
          <section className="console-card contact-card">
            <div className="card-title">
              <div>
                <h2>{contact.name || "Unnamed contact"}</h2>
                <p>Attempt {contact.attempt_count + (stage === "ready" ? 1 : 0)} of {selectedCampaign?.max_attempts || 3}</p>
              </div>
              <span className={`status-tag ${stage === "calling" ? "active" : "neutral"}`}>{stage.toUpperCase()}</span>
            </div>
            <div className="contact-facts">
              <div><PhoneCall size={16} /><strong>{contact.phone}</strong></div>
              {contact.company && <div><Building2 size={16} /><span>{contact.company}</span></div>}
              {contact.email && <div><Mail size={16} /><span>{contact.email}</span></div>}
              {contact.last_called_at && <div><RefreshCw size={16} /><span>Last called {formatDate(contact.last_called_at)}</span></div>}
              {contact.disposition && <div><UserCheck size={16} /><span>Previous: {contact.disposition}</span></div>}
            </div>
            {contact.notes && <p className="contact-notes">{contact.notes}</p>}

            <div className="inline-actions dialer-actions">
              {stage === "ready" && (
                <button className="primary-action" onClick={callNow} disabled={busy || dialBlocked || callActive}>
                  <PhoneCall size={17} />Call now
                </button>
              )}
              {stage === "calling" && (
                <span className="system-pill ok"><PhoneCall size={15} />Call in progress — hang up in the softphone to disposition</span>
              )}
              {stage === "ready" && canSkip && (
                <button className="secondary-action" onClick={() => submit("SKIPPED")} disabled={busy}>
                  <SkipForward size={16} />Skip
                </button>
              )}
              {stage === "calling" && (
                <button className="secondary-action" onClick={() => setStage("wrapup")} disabled={busy}>
                  Disposition now
                </button>
              )}
            </div>
          </section>

          {stage === "wrapup" && (
            <section className="console-card">
              <div className="card-title">
                <div>
                  <h2>Wrap up</h2>
                  <p>Talk time {formatDuration(duration)}</p>
                </div>
                <UserCheck size={20} />
              </div>
              <div className="admin-form">
                <label>Outcome
                  <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    {DIALER_OUTCOMES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>Disposition
                  {dispositions.length ? (
                    <select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                      <option value="">None</option>
                      {dispositions.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  ) : (
                    <input value={disposition} onChange={(e) => setDisposition(e.target.value)} placeholder="e.g. Interested" />
                  )}
                </label>
                <label className="full-span">Notes
                  <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened on this call?" />
                </label>
                <button className="primary-action" onClick={() => submit(outcome)} disabled={busy}>
                  {busy ? "Saving…" : "Save & next contact"}
                </button>
              </div>
            </section>
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

function CampaignsPanel({ permissions }) {
  const can = (key) => permissions.includes(key);
  const canCreate = can("CREATE_CAMPAIGNS") || can("MANAGE_CAMPAIGNS");
  const canManage = can("MANAGE_CAMPAIGNS");
  const canUpload = can("UPLOAD_CONTACTS");
  const canAssign = can("ASSIGN_CONTACTS");
  const canReport = can("VIEW_CAMPAIGN_REPORTS");

  const [campaigns, setCampaigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_CAMPAIGN);
  const [openId, setOpenId] = useState(null);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
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
    }
  }, [canAssign]);

  useEffect(() => { load(); }, [load]);

  const openCampaign = async (id) => {
    setReport(null);
    setSelectedAgents([]);
    setNotice("");
    setOpenId((current) => (current === id ? null : id));
  };

  const submitNew = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createCampaign(form);
      setForm(EMPTY_CAMPAIGN);
      setNotice("Campaign created as DRAFT. Upload contacts, assign agents, then set it ACTIVE.");
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const changeStatus = async (campaign, status) => {
    setError("");
    try {
      await updateCampaign({ ...campaign, status });
      await load();
    } catch (e) { setError(e.message); }
  };

  const removeCampaign = async (campaign) => {
    if (!window.confirm(`Delete "${campaign.name}"? Its contacts and call history stay in the database but the campaign disappears from this list.`)) return;
    setError("");
    try {
      await deleteCampaign(campaign.id);
      setOpenId(null);
      await load();
    } catch (e) { setError(e.message); }
  };

  const upload = async (campaign, file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await uploadCampaignContacts(campaign.id, file);
      setNotice(`${result.inserted} contacts imported, ${result.skipped} skipped (of ${result.total} rows).`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const assign = async (campaign) => {
    if (!selectedAgents.length) { setError("Select at least one agent."); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await assignCampaignAgents(campaign.id, selectedAgents);
      setNotice(`${result.assigned} contacts distributed across ${selectedAgents.length} agent(s).`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const showReport = async (campaign) => {
    setError("");
    try { setReport(await getCampaignReport(campaign.id)); } catch (e) { setError(e.message); }
  };

  const openCampaignRow = useMemo(() => campaigns.find((row) => row.id === openId), [campaigns, openId]);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <span className="overline">OUTBOUND CAMPAIGNS</span>
          <h1>Campaigns</h1>
          <p>Create a campaign, import contacts from Excel, distribute them to agents, then activate it.</p>
        </div>
        <button className="secondary-action" onClick={load}><RefreshCw size={16} />Refresh</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && !error && <div className="alert">{notice}</div>}

      <div className={canCreate ? "admin-grid" : "page-stack"}>
        {canCreate && (
          <section className="console-card">
            <div className="card-title">
              <div><h2>New campaign</h2><p>Created as DRAFT — agents only receive contacts once it is ACTIVE.</p></div>
              <Plus size={20} />
            </div>
            <form className="admin-form" onSubmit={submitNew}>
              <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label>Mode
                <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                  <option value="CLICK_TO_CALL">Click to call</option>
                  <option value="PREVIEW">Preview</option>
                </select>
              </label>
              <label>Max attempts<input type="number" min={1} max={10} value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })} /></label>
              <label>Retry delay (minutes)<input type="number" min={1} max={1440} value={form.retryDelayMinutes} onChange={(e) => setForm({ ...form, retryDelayMinutes: Number(e.target.value) })} /></label>
              <label className="full-span">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <button className="primary-action" disabled={busy}>{busy ? "Working…" : "Create campaign"}</button>
            </form>
          </section>
        )}

        <section className="console-card table-card">
          <div className="card-title">
            <div><h2>All campaigns</h2><p>{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</p></div>
            <BarChart3 size={20} />
          </div>
          <div className="data-table-wrap">
            <table>
              <thead>
                <tr><th>Campaign</th><th>Mode</th><th>Contacts</th><th>Connected</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {campaigns.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.name}</strong><small className="cell-subtitle">{row.description || formatDate(row.created_at)}</small></td>
                    <td>{row.mode === "PREVIEW" ? "Preview" : "Click to call"}</td>
                    <td>{row.total_contacts || 0}</td>
                    <td>{row.connected_contacts || 0}</td>
                    <td>
                      {canManage ? (
                        <select className="select-control compact" value={row.status} onChange={(e) => changeStatus(row, e.target.value)}>
                          {CAMPAIGN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      ) : (
                        <span className={`status-tag ${row.status === "ACTIVE" ? "active" : "neutral"}`}>{row.status}</span>
                      )}
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button onClick={() => openCampaign(row.id)}>{openId === row.id ? "Close" : "Manage"}</button>
                        {canManage && <button className="danger" onClick={() => removeCampaign(row)}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!campaigns.length && <div className="empty-block">No campaigns yet</div>}
          </div>
        </section>
      </div>

      {openCampaignRow && (
        <section className="console-card">
          <div className="card-title">
            <div><h2>{openCampaignRow.name}</h2><p>Contacts, agent assignment and results</p></div>
            <Users size={20} />
          </div>

          <div className="campaign-detail-grid">
            {canUpload && (
              <div className="campaign-detail-block">
                <h3><Upload size={16} />Import contacts</h3>
                <p>Excel or CSV with a <code>Phone</code> column. <code>Name</code>, <code>Email</code> and <code>Company</code> are optional.</p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={busy}
                  onChange={(e) => { upload(openCampaignRow, e.target.files?.[0]); e.target.value = ""; }}
                />
              </div>
            )}

            {canAssign && (
              <div className="campaign-detail-block">
                <h3><Users size={16} />Assign agents</h3>
                <p>Unassigned contacts are split round-robin across the agents you pick.</p>
                <div className="member-check-grid">
                  {users.map((user) => (
                    <label key={user.id} className="permission-option">
                      <input
                        type="checkbox"
                        checked={selectedAgents.includes(user.id)}
                        onChange={(e) => setSelectedAgents((current) =>
                          e.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id)
                        )}
                      />
                      <span>{user.name}<small>{user.roleName}</small></span>
                    </label>
                  ))}
                </div>
                {!users.length && <div className="empty-block">No SIP-enabled agents found</div>}
                <button className="secondary-action" onClick={() => assign(openCampaignRow)} disabled={busy || !selectedAgents.length}>
                  <UserCheck size={16} />Distribute contacts
                </button>
              </div>
            )}

            {canReport && (
              <div className="campaign-detail-block">
                <h3><BarChart3 size={16} />Results</h3>
                <button className="secondary-action" onClick={() => showReport(openCampaignRow)}>
                  <RefreshCw size={16} />Load report
                </button>
                {report && (
                  <>
                    <div className="campaign-report-summary">
                      <span>Total <strong>{report.summary?.total || 0}</strong></span>
                      <span>Connected <strong>{report.summary?.connected || 0}</strong></span>
                      <span>No answer <strong>{report.summary?.no_answer || 0}</strong></span>
                      <span>Busy <strong>{report.summary?.busy || 0}</strong></span>
                      <span>Completed <strong>{report.summary?.completed || 0}</strong></span>
                    </div>
                    <div className="data-table-wrap">
                      <table>
                        <thead><tr><th>Agent</th><th>Calls</th><th>Connected</th></tr></thead>
                        <tbody>
                          {(report.agents || []).map((row, index) => (
                            <tr key={row.name || index}>
                              <td>{row.name || "Unassigned"}</td>
                              <td>{row.total_calls}</td>
                              <td>{row.connected || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!report.agents?.length && <div className="empty-block">No agent activity yet</div>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}
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
    return <div className="page-stack"><div className="empty-block">Auto dialer is not enabled for your role.</div></div>;
  }

  return (
    <div className="page-stack">
      {canDial && canManage && (
        <div className="dialer-tabs">
          <button className={tab === "dialer" ? "active" : ""} onClick={() => setTab("dialer")}>
            <PhoneForwarded size={16} />Dialer
          </button>
          <button className={tab === "campaigns" ? "active" : ""} onClick={() => setTab("campaigns")}>
            <BarChart3 size={16} />Campaigns
          </button>
        </div>
      )}
      {canDial && (!canManage || tab === "dialer")
        ? <DialerPanel permissions={permissions} sipReady={sipReady} />
        : <CampaignsPanel permissions={permissions} />}
    </div>
  );
}
