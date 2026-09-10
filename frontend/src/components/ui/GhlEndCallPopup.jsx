import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, UserPlus } from "lucide-react";

import Button from "./Button";
import Input from "./Input";
import Modal from "./Modal";
import Select from "./Select";
import Toggle from "./Toggle";
import { notifyError, notifySuccess } from "../../lib/toast";
import { getGhlCallContext, postGhlCallOutcome, OPP_STATUSES } from "../../lib/ghlApi";

// Standalone call-end popup for tenants with GoHighLevel connected but NOT
// the Lead Management system. Always skippable.
export default function GhlEndCallPopup({ enabled = true, config }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [contact, setContact] = useState(null);
  const [opps, setOpps] = useState([]);
  const [createContact, setCreateContact] = useState(true);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [oppChoice, setOppChoice] = useState("none"); // none | create | <oppId>
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [status, setStatus] = useState("open");

  const pipelines = config?.pipelines || [];
  const hasExisting = opps.length > 0;

  useEffect(() => {
    if (!enabled || !config?.active) return undefined;
    const onEnded = (event) => {
      const p = event.detail;
      if (!p?.connected || !p?.number) return;
      setDetail(p);
      setContact(null);
      setOpps([]);
      setCreateContact(true);
      setName(p.contactName && p.contactName !== p.number ? p.contactName : "");
      setNote("");
      setOppChoice(config?.createOpportunityDefault ? "create" : "none");
      setPipelineId(config?.pipelineId || pipelines[0]?.id || "");
      setStageId(config?.pipelineStageId || pipelines[0]?.stages?.[0]?.id || "");
      setStatus("open");
      setLoading(true);
      getGhlCallContext(p.number)
        .then((ctx) => {
          if (ctx?.contact) {
            setContact(ctx.contact);
            setCreateContact(false);
            if (ctx.contact.name) setName(ctx.contact.name);
          }
          const existing = ctx?.opportunities || [];
          setOpps(existing);
          // A contact that already has an opportunity can only be updated —
          // never create a second one, never move its pipeline.
          if (existing.length) {
            const o = existing[0];
            setOppChoice(o.id);
            setPipelineId(o.pipelineId || "");
            setStageId(o.pipelineStageId || "");
            setStatus(o.status || "open");
          }
        })
        .finally(() => setLoading(false));
    };
    window.addEventListener("ringnex:call-ended", onEnded);
    return () => window.removeEventListener("ringnex:call-ended", onEnded);
  }, [enabled, config]); // eslint-disable-line react-hooks/exhaustive-deps

  const stages = useMemo(
    () => pipelines.find((p) => p.id === pipelineId)?.stages || [],
    [pipelines, pipelineId]
  );

  useEffect(() => {
    if (oppChoice === "none" || oppChoice === "create") return;
    const o = opps.find((x) => x.id === oppChoice);
    if (o) {
      setPipelineId(o.pipelineId || "");
      setStageId(o.pipelineStageId || "");
      setStatus(o.status || "open");
    }
  }, [oppChoice]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setDetail(null);

  const oppOptions = hasExisting
    ? [
        { value: "none", label: "Leave opportunity unchanged" },
        ...opps.map((o) => ({ value: o.id, label: `Update “${o.name || "opportunity"}”` }))
      ]
    : [
        { value: "none", label: "No opportunity" },
        { value: "create", label: "Create a new opportunity" }
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
        contactName: createContact || contact ? name || null : null,
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
  const oppOn = oppChoice !== "none";
  const pipelineLocked = hasExisting || oppChoice !== "create";

  return (
    <Modal open title="Call ended" onClose={close} width="max-w-lg">
      <p className="-mt-2 mb-4 text-xs text-muted">
        {detail.number}
        {loading ? " · checking GoHighLevel…" : ""}
      </p>

      {/* Contact */}
      <div className="mb-4 rounded-xl border border-border bg-surface-2 p-3.5">
        {contact ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Contact in GoHighLevel</p>
              <p className="truncate text-sm font-semibold text-text">{contact.name || detail.number}</p>
              {contact.email ? <p className="truncate text-xs text-muted">{contact.email}</p> : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserPlus size={16} className="text-muted" />
                <span className="text-sm font-medium text-text">Add to GoHighLevel</span>
              </div>
              <Toggle checked={createContact} onChange={setCreateContact} label="Create contact" />
            </div>
            {createContact ? (
              <Input placeholder="Contact name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            ) : (
              <p className="text-xs text-muted">This number won’t be added as a contact.</p>
            )}
          </div>
        )}
      </div>

      {/* Opportunity */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-muted">Opportunity</label>
        <Select
          options={oppOptions}
          value={oppOptions.find((o) => o.value === oppChoice) || oppOptions[0]}
          onChange={(o) => setOppChoice(o?.value || "none")}
        />

        {oppOn ? (
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted">Pipeline</label>
              <Select
                options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
                value={pipelines.map((p) => ({ value: p.id, label: p.name })).find((o) => o.value === pipelineId) || null}
                onChange={(o) => {
                  setPipelineId(o?.value || "");
                  setStageId(pipelines.find((p) => p.id === o?.value)?.stages?.[0]?.id || "");
                }}
                isDisabled={pipelineLocked}
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
      </div>

      {/* Note */}
      <div className="mb-5">
        <label className="mb-1.5 block text-xs font-medium text-muted">Note — saved on the contact</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="What happened on this call…"
          style={{ minHeight: 96 }}
          className="block w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm leading-relaxed text-text placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className="text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          Skip
        </button>
        <Button size="sm" loading={busy} onClick={save}>
          Save to GoHighLevel
        </Button>
      </div>
    </Modal>
  );
}
