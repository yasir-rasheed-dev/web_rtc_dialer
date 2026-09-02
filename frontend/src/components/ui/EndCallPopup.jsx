import { useEffect, useRef, useState } from "react";
import { Paperclip, Plus, Tag } from "lucide-react";

import Button from "./Button";
import DatePicker from "./DatePicker";
import Input from "./Input";
import Modal from "./Modal";
import Select from "./Select";
import TagInput from "./TagInput";
import Toggle from "./Toggle";
import { notifyError, notifySuccess } from "../../lib/toast";
import { lookupCallerIdentity } from "../../lib/api";
import { formatDuration } from "../../lib/phone";
import { getDispositions, saveLeadFromCall, uploadLeadAttachment } from "../../lib/leadsApi";

const fieldLabel = "flex flex-col gap-1.5 text-xs font-medium text-muted";

function dispositionOptions(dispositions) {
  return dispositions.map((item) => ({ value: item.id, label: item.name, color: item.color }));
}

// Colored dot next to each disposition's name — these are arbitrary
// tenant-chosen hex values, not Tailwind tokens, so an inline style is the
// only way to render them (same reasoning as the audio player's gradient).
function DispositionOption({ data }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: data.color }} />
      {data.label}
    </div>
  );
}

// Softphone.jsx defaults an unresolved call's displayName to one of these
// literal placeholder strings (not blank) — treated as "no real name yet"
// here so this popup's own fresh lookup (below) is never blocked from
// overriding them the way a truthy check alone would block it.
const GENERIC_NAMES = new Set(["outbound call", "incoming call", "calling", "unknown", "unknown caller"]);
function isRealName(value) {
  const trimmed = String(value || "").trim();
  return Boolean(trimmed) && !GENERIC_NAMES.has(trimmed.toLowerCase());
}

const EMPTY_FORM = {
  name: "",
  phone: "",
  address: "",
  saveToContact: false,
  dispositionId: "",
  followUpDate: "",
  followUpTime: "",
  remarks: "",
  tags: []
};

/**
 * Auto-opens right after a CONNECTED call ends, for agents whose role has
 * SHOW_END_CALL_POPUP (App.jsx only mounts this component when that
 * permission is present). Listens for the same "ringnex:call-ended"
 * CustomEvent the Auto Dialer's own post-call disposition panel already
 * uses (Softphone.jsx's finishCall()) — `enabled` (passed as
 * `page !== "dialer"`) is what stops the two from double-firing on the
 * same call.
 */
export default function EndCallPopup({ enabled = true }) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [dispositions, setDispositions] = useState([]);
  const [showTags, setShowTags] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const onCallEnded = (event) => {
      const payload = event.detail;
      if (!payload?.connected) return;
      setDetail(payload);
      setForm({
        ...EMPTY_FORM,
        name: isRealName(payload.contactName) ? payload.contactName : "",
        phone: payload.number || ""
      });
      setShowTags(false);
      setFile(null);
      setError("");

      // Confirms whether this number is *already* a saved Contact (vs.
      // just an internal agent's extension or nothing at all) so the
      // "Save to contacts" toggle defaults correctly — the event's own
      // contactName may already be populated from the earlier
      // enrichment in onCallReceived, but only a fresh lookup here tells
      // us the match `type`, which is what the toggle actually needs.
      if (payload.number) {
        lookupCallerIdentity(payload.number)
          .then((result) => {
            setForm((current) => ({
              ...current,
              name: isRealName(current.name) ? current.name : result?.name || "",
              saveToContact: result?.type === "contact"
            }));
          })
          .catch(() => undefined);
      }
    };
    window.addEventListener("ringnex:call-ended", onCallEnded);
    return () => window.removeEventListener("ringnex:call-ended", onCallEnded);
  }, [enabled]);

  useEffect(() => {
    if (!detail) return;
    getDispositions().then(setDispositions).catch(() => undefined);
  }, [detail]);

  const close = () => {
    setDetail(null);
    setForm(EMPTY_FORM);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.remarks.trim()) {
      setError("Remarks are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const followUpAt =
        form.followUpDate && form.followUpTime ? `${form.followUpDate} ${form.followUpTime}:00` : null;
      const { interactionId } = await saveLeadFromCall({
        callLinkedid: null,
        name: form.name.trim() || null,
        phone: form.phone,
        address: form.address.trim() || null,
        saveToContact: form.saveToContact,
        dispositionId: form.dispositionId || null,
        followUpAt,
        remarks: form.remarks.trim(),
        tags: form.tags
      });
      if (file) {
        await uploadLeadAttachment(interactionId, file).catch((uploadError) =>
          notifyError(`Saved, but the attachment failed to upload: ${uploadError.message}`)
        );
      }
      notifySuccess("Lead saved");
      close();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return null;

  return (
    <Modal open title="End Call" onClose={close} width="max-w-lg">
      <p className="-mt-2 mb-4 text-xs text-muted">Save lead details, follow-up and remarks from this call.</p>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Contact</p>
          {/* form.name reflects this popup's own fresh lookup (fired on
              open, below) — more reliable than detail.contactName, which
              depends on Softphone.jsx's enrichment having already resolved
              by the moment the call ended. */}
          <p className="mt-1 truncate text-sm font-semibold text-text">
            {form.name || (isRealName(detail.contactName) ? detail.contactName : null) || "Unknown"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Number</p>
          <p className="mt-1 truncate text-sm font-semibold text-text">{detail.number}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Duration</p>
          <p className="mt-1 text-sm font-semibold text-text">{formatDuration(detail.duration)}</p>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Client Details</p>
          <div className="grid grid-cols-2 gap-3">
            <label className={fieldLabel}>
              Client name
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className={fieldLabel}>
              Phone number
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className={`${fieldLabel} col-span-2`}>
              Address
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Lahore, Pakistan" />
            </label>
          </div>
          <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
            <span>
              <span className="block text-sm font-medium text-text">Save number to contacts</span>
              <span className="block text-xs text-muted">Keep this contact available for future calls</span>
            </span>
            <Toggle checked={form.saveToContact} onChange={(v) => setForm({ ...form, saveToContact: v })} label="Save number to contacts" />
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Call Outcome</p>
          <div className="grid grid-cols-2 gap-3">
            <label className={fieldLabel}>
              Disposition
              <Select
                options={dispositionOptions(dispositions)}
                value={dispositionOptions(dispositions).find((o) => o.value === form.dispositionId) || null}
                onChange={(o) => setForm({ ...form, dispositionId: o?.value || "" })}
                placeholder="Select disposition…"
                components={{ Option: DispositionOption }}
                isClearable
              />
            </label>
            <label className={fieldLabel}>
              Next follow-up
              <div className="flex gap-2">
                <DatePicker value={form.followUpDate} onChange={(v) => setForm({ ...form, followUpDate: v })} className="flex-1" />
                <input
                  type="time"
                  value={form.followUpTime}
                  onChange={(e) => setForm({ ...form, followUpTime: e.target.value })}
                  className="h-[42px] w-28 rounded-xl border border-border bg-surface-2 px-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>
            </label>
          </div>
        </div>

        <label className={fieldLabel}>
          Remark / Notes <span className="text-danger">*</span>
          <textarea
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            rows={3}
            placeholder="What was discussed? Any commitments? Next steps?…"
            className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            required
          />
        </label>

        {showTags ? (
          <label className={fieldLabel}>
            Tags
            <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setShowTags(true)}
            className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
          >
            <Tag size={13} /> Add tags
          </button>
        )}

        <div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
          >
            <Paperclip size={13} /> {file ? file.name : "Add attachment"}
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} icon={Plus}>
            End &amp; Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
