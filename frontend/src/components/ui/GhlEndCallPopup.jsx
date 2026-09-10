import { useEffect, useMemo, useState } from "react";

import Button from "./Button";
import Input from "./Input";
import Modal from "./Modal";
import Select from "./Select";
import Toggle from "./Toggle";
import { notifyError, notifySuccess } from "../../lib/toast";
import { getGhlCallContext, postGhlCallOutcome, OPP_STATUSES } from "../../lib/ghlApi";

// Standalone call-end popup for tenants that have GoHighLevel connected but
// NOT the Lead Management system. App.jsx only mounts this when
// ghlConfig.active && !leadsPopup. The agent can always Skip.
export default function GhlEndCallPopup({ enabled = true, config }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [ctxContact, setCtxContact] = useState(null); // GHL contact if found
  const [existingOpps, setExistingOpps] = useState([]);
  const [createContact, setCreateContact] = useState(true);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [oppChoice, setOppChoice] = useState("none"); // none | create | <oppId>
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [status, setStatus] = useState("open");

  const pipelines = config?.pipelines || [];

  const reset = (payload) => {
    setCtxContact(null);
    setExistingOpps([]);
    setCreateContact(true);
    setName(payload?.contactName && payload.contactName !== payload.number ? payload.contactName : "");
    setNote("");
    setOppChoice(config?.createOpportunityDefault ? "create" : "none");
    setPipelineId(config?.pipelineId || (pipelines[0]?.id ?? ""));
    setStageId(config?.pipelineStageId || (pipelines[0]?.stages?.[0]?.id ?? ""));
    setStatus("open");
  };

  useEffect(() => {
    if (!enabled || !config?.active) return undefined;
    const onEnded = (event) => {
      const payload = event.detail;
      if (!payload?.connected || !payload?.number) return;
      setDetail(payload);
      reset(payload);
      setLoading(true);
      getGhlCallContext(payload.number)
        .then((ctx) => {
          if (ctx?.contact) {
            setCtxContact(ctx.contact);
            setCreateContact(false);
            if (ctx.contact.name) setName(ctx.contact.name);
          }
          setExistingOpps(ctx?.opportunities || []);
        })
        .finally(() => setLoading(false));
    };
    window.addEventListener("ringnex:call-ended", onEnded);
    return () => window.removeEventListener("ringnex:call-ended", onEnded);
  }, [enabled, config]);

  const stages = useMemo(
    () => pipelines.find((p) => p.id === pipelineId)?.stages || [],
    [pipelines, pipelineId]
  );

  // When the agent picks an existing opportunity, mirror its pipeline/stage/status.
  useEffect(() => {
    if (oppChoice === "none" || oppChoice === "create") return;
    const opp = existingOpps.find((o) => o.id === oppChoice);
    if (opp) {
      if (opp.pipelineId) setPipelineId(opp.pipelineId);
      if (opp.pipelineStageId) setStageId(opp.pipelineStageId);
      if (opp.status) setStatus(opp.status);
    }
  }, [oppChoice]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setDetail(null);

  const oppOptions = [
    { value: "none", label: "Don't touch opportunities" },
    { value: "create", label: "Create a new opportunity" },
    ...existingOpps.map((o) => ({ value: o.id, label: `Update: ${o.name || "opportunity"}` }))
  ];

  const save = async () => {
    setBusy(true);
    try {
      const opportunity =
        oppChoice === "none"
          ? { mode: "none" }
          : oppChoice === "create"
            ? { mode: "create", pipelineId, pipelineStageId: stageId, status }
            : { mode: "update", opportunityId: oppChoice, pipelineStageId: stageId, status };

      await postGhlCallOutcome({
        phone: detail.number,
        contactName: createContact || ctxContact ? name || null : null,
        note: note.trim() || null,
        opportunity
      });
      notifySuccess("Saved to GoHighLevel.");
      close();
    } catch (e) {
      notifyError(e.message || "Could not save to GoHighLevel.");
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return null;
  const oppActive = oppChoice !== "none";

  return (
    <Modal open title="Call ended — GoHighLevel" onClose={close} width="max-w-lg">
      <p className="-mt-2 mb-4 text-xs text-muted">
        {detail.number}
        {loading ? " · checking…" : ""}
      </p>

      {/* Contact */}
      <div className="mb-4 rounded-xl border border-border bg-surface-2 p-3">
        {ctxContact ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Saved contact</p>
              <p className="truncate text-sm font-semibold text-text">{ctxContact.name || detail.number}</p>
              {ctxContact.email ? <p className="truncate text-xs text-muted">{ctxContact.email}</p> : null}
            </div>
            <Toggle checked disabled label="Contact exists" onChange={() => {}} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">New contact</p>
                <p className="text-xs text-muted">No GoHighLevel contact for this number.</p>
              </div>
              <Toggle checked={createContact} onChange={setCreateContact} label="Create contact" />
            </div>
            {createContact ? (
              <Input placeholder="Contact name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            ) : null}
          </div>
        )}
      </div>

      {/* Opportunity */}
      <label className="mb-1 block text-[12px] font-medium text-muted">Opportunity</label>
      <Select
        options={oppOptions}
        value={oppOptions.find((o) => o.value === oppChoice) || oppOptions[0]}
        onChange={(o) => setOppChoice(o?.value || "none")}
        className="mb-3"
      />

      {oppActive ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className={oppChoice === "create" ? "" : "opacity-50 pointer-events-none"}>
            <label className="mb-1 block text-[11px] font-medium text-muted">Pipeline</label>
            <Select
              options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
              value={pipelines.map((p) => ({ value: p.id, label: p.name })).find((o) => o.value === pipelineId) || null}
              onChange={(o) => {
                setPipelineId(o?.value || "");
                const first = pipelines.find((p) => p.id === o?.value)?.stages?.[0]?.id || "";
                setStageId(first);
              }}
              placeholder={pipelines.length ? "Pipeline" : "No pipelines"}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">Stage</label>
            <Select
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              value={stages.map((s) => ({ value: s.id, label: s.name })).find((o) => o.value === stageId) || null}
              onChange={(o) => setStageId(o?.value || "")}
              placeholder="Stage"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">Status</label>
            <Select
              options={OPP_STATUSES}
              value={OPP_STATUSES.find((o) => o.value === status) || OPP_STATUSES[0]}
              onChange={(o) => setStatus(o?.value || "open")}
            />
          </div>
        </div>
      ) : null}

      {/* Note */}
      <label className="mb-1 block text-[12px] font-medium text-muted">Note (saved on the contact)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="What happened on this call…"
        className="mb-4 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
          Skip
        </Button>
        <Button size="sm" loading={busy} onClick={save}>
          Save to GoHighLevel
        </Button>
      </div>
    </Modal>
  );
}
