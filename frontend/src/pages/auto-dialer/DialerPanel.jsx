import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Mail, PhoneCall, PhoneForwarded, RefreshCw, SkipForward, UserCheck } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import StatusBadge from "../../components/ui/StatusBadge";
import { notifySuccess } from "../../lib/toast";
import { formatInWorkspaceTz } from "../../lib/tz";
import { DIALER_OUTCOMES, getNextContact, listCampaigns, saveDisposition, startContactCall, suggestOutcome } from "../../lib/campaignApi";

const formatDate = (value) => formatInWorkspaceTz(value);

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function fieldLabel() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

export default function DialerPanel({ permissions, sipReady }) {
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
