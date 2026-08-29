import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import Button from "../../components/ui/Button";
import Input, { FIELD_CLASS } from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import Toggle from "../../components/ui/Toggle";
import { notifyError, notifySuccess } from "../../lib/toast";
import { createTollFreeCampaign, createTollFreeIvr, updateTollFreeCampaign } from "../../lib/api";

function fieldLabelClass() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

// "Create a new IVR" isn't an option here — that's a bigger form (greeting +
// a full menu) that lives in its own modal, opened from the IVRs section on
// TollFreePage. Attaching one to a campaign is always "pick an existing
// one" (create it there first, then come back and pick it) or "none".
const IVR_MODES = [
  { value: "none", label: "No IVR — straight to queue" },
  { value: "existing", label: "Use an existing IVR" }
];

// Handles both create (no `campaign` prop) and edit (campaign passed in) —
// the toll-free number itself can't be changed once a campaign exists on
// it (that's a delete-and-recreate), so the DID picker is only shown when
// creating.
export function CreateCampaignModal({ open, onClose, campaign = null, numbers, ivrs, users, onSaved }) {
  const isEdit = Boolean(campaign);
  const [name, setName] = useState("");
  const [didId, setDidId] = useState("");
  const [agentIds, setAgentIds] = useState([]);
  const [ivrMode, setIvrMode] = useState("none");
  const [ivrId, setIvrId] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(campaign?.name || "");
    setDidId(campaign?.did_id || "");
    setAgentIds([]);
    setIvrMode(campaign?.ivr_id ? "existing" : "none");
    setIvrId(campaign?.ivr_id || "");
    setActive(campaign?.status === "ACTIVE");
    setError("");
    // Agent multi-select starts empty on edit too — the campaign detail
    // page (not this modal) is what shows/edits the current roster; this
    // modal's agentIds only ever *adds* to it via PATCH's replace-all
    // semantics, so pre-filling would require fetching the full roster
    // just to re-submit it unchanged. Simplest correct behavior: leave
    // agent selection to the roster editor, not this quick campaign form.
  }, [open, campaign]);

  const availableNumbers = useMemo(
    () => numbers.filter((n) => !n.campaign_id || n.id === campaign?.did_id),
    [numbers, campaign]
  );
  const didOptions = useMemo(
    () => availableNumbers.map((n) => ({ value: n.id, label: n.number })),
    [availableNumbers]
  );
  const ivrOptions = useMemo(() => ivrs.map((i) => ({ value: i.id, label: i.name })), [ivrs]);
  const agentOptions = useMemo(
    () => users.filter((u) => u.active && u.sipUsername).map((u) => ({ value: u.id, label: `${u.name} · ${u.roleName || ""}` })),
    [users]
  );

  const submit = async () => {
    if (!name.trim()) return setError("Campaign name is required.");
    if (!isEdit && !didId) return setError("Pick a toll-free number.");
    if (ivrMode === "existing" && !ivrId) return setError("Choose an existing IVR, or switch modes.");

    setBusy(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        status: active ? "ACTIVE" : "INACTIVE",
        ivrId: ivrMode === "existing" ? ivrId : null,
        ...(agentIds.length ? { agentIds } : {})
      };
      let result;
      if (isEdit) {
        result = await updateTollFreeCampaign(campaign.id, body);
      } else {
        result = await createTollFreeCampaign({ ...body, didId, agentIds });
      }
      notifySuccess(`Campaign "${result.campaign.name}" saved.`);
      if (result.asteriskSync && !result.asteriskSync.ok) {
        notifyError(`Saved, but the Asterisk sync failed: ${result.asteriskSync.error}. It will retry on the next save.`);
      }
      onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit campaign" : "Create toll-free campaign"} width="max-w-lg">
      <div className="flex flex-col gap-4">
        {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

        <label className={fieldLabelClass()}>
          Campaign name
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales Line" required />
        </label>

        {!isEdit && (
          <label className={fieldLabelClass()}>
            Toll-free number
            <Select
              options={didOptions}
              value={didOptions.find((o) => o.value === didId) || null}
              onChange={(o) => setDidId(o?.value || "")}
              placeholder={didOptions.length ? "Select a number…" : "No unassigned toll-free numbers — buy one first"}
              isDisabled={!didOptions.length}
            />
          </label>
        )}

        <label className={fieldLabelClass()}>
          {isEdit ? "Add agents to the roster" : "Assign agents"}
          <Select
            isMulti
            isSearchable
            options={agentOptions}
            value={agentOptions.filter((o) => agentIds.includes(o.value))}
            onChange={(value) => setAgentIds((value || []).map((o) => o.value))}
            placeholder="Search agents…"
          />
        </label>

        <label className={fieldLabelClass()}>
          IVR
          <Select
            options={IVR_MODES}
            value={IVR_MODES.find((o) => o.value === ivrMode)}
            onChange={(o) => setIvrMode(o.value)}
            isSearchable={false}
          />
        </label>
        {ivrMode === "existing" && (
          <label className={fieldLabelClass()}>
            Existing IVR
            <Select
              options={ivrOptions}
              value={ivrOptions.find((o) => o.value === ivrId) || null}
              onChange={(o) => setIvrId(o?.value || "")}
              placeholder={ivrOptions.length ? "Select an IVR…" : "No IVRs yet — create one first"}
              isDisabled={!ivrOptions.length}
            />
          </label>
        )}

        <label className="flex items-center gap-2.5 text-xs font-medium text-muted">
          <Toggle checked={active} onChange={setActive} label="Campaign active" />
          {active ? "Active — this number rings the roster" : "Inactive — callers hear a busy tone"}
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            {isEdit ? "Save changes" : "Create campaign"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const ACTION_TYPES = [
  { value: "CAMPAIGN", label: "Route to a campaign" },
  { value: "HANGUP", label: "Say goodbye and hang up" }
];

function emptyOption() {
  return { key: crypto.randomUUID(), digit: "", promptText: "", actionType: "CAMPAIGN", targetCampaignId: "" };
}

export function CreateIvrModal({ open, onClose, campaigns, onSaved }) {
  const [name, setName] = useState("");
  const [greetingText, setGreetingText] = useState("");
  const [options, setOptions] = useState([emptyOption()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setGreetingText("");
    setOptions([emptyOption()]);
    setError("");
  }, [open]);

  const campaignOptions = useMemo(() => campaigns.map((c) => ({ value: c.id, label: `${c.name} (${c.did_number})` })), [campaigns]);

  const updateOption = (key, patch) => {
    setOptions((current) => current.map((option) => (option.key === key ? { ...option, ...patch } : option)));
  };
  const removeOption = (key) => setOptions((current) => (current.length > 1 ? current.filter((o) => o.key !== key) : current));

  const submit = async () => {
    if (!name.trim()) return setError("IVR name is required.");
    if (!greetingText.trim()) return setError("Greeting text is required — this is what the system will say (text-to-speech).");
    for (const option of options) {
      if (!option.digit.trim()) return setError("Every menu option needs a digit.");
      if (!option.promptText.trim()) return setError(`Digit ${option.digit} needs prompt text.`);
      if (option.actionType === "CAMPAIGN" && !option.targetCampaignId) return setError(`Digit ${option.digit} needs a campaign to route to.`);
    }

    setBusy(true);
    setError("");
    try {
      const result = await createTollFreeIvr({
        name: name.trim(),
        greetingText: greetingText.trim(),
        options: options.map((o) => ({
          digit: o.digit.trim(),
          promptText: o.promptText.trim(),
          actionType: o.actionType,
          targetCampaignId: o.actionType === "CAMPAIGN" ? o.targetCampaignId : null
        }))
      });
      notifySuccess(`IVR "${result.ivr.name}" created.`);
      if (result.asteriskSync && !result.asteriskSync.ok) {
        notifyError(`Saved, but the Asterisk sync failed: ${result.asteriskSync.error}. It will retry on the next save.`);
      }
      onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create IVR" width="max-w-xl">
      <div className="flex flex-col gap-4">
        {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

        <label className={fieldLabelClass()}>
          IVR name
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Menu" required />
        </label>

        <label className={fieldLabelClass()}>
          Greeting (spoken via text-to-speech)
          <textarea
            rows={2}
            value={greetingText}
            onChange={(e) => setGreetingText(e.target.value)}
            placeholder="Thanks for calling Ringnex. Press 1 for sales, 2 for support."
            className={FIELD_CLASS}
          />
        </label>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text">Menu options</p>
            <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setOptions((current) => [...current, emptyOption()])}>
              Add option
            </Button>
          </div>
          {options.map((option) => (
            <div key={option.key} className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-3">
              <div className="flex items-center gap-2">
                <div className="w-16 shrink-0">
                  <Input
                    value={option.digit}
                    onChange={(e) => updateOption(option.key, { digit: e.target.value.replace(/[^0-9*#]/g, "").slice(0, 1) })}
                    placeholder="1"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    value={option.promptText}
                    onChange={(e) => updateOption(option.key, { promptText: e.target.value })}
                    placeholder="Press 1 for sales"
                  />
                </div>
                {options.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOption(option.key)}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                    aria-label="Remove option"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-52">
                  <Select
                    isSearchable={false}
                    options={ACTION_TYPES}
                    value={ACTION_TYPES.find((a) => a.value === option.actionType)}
                    onChange={(o) => updateOption(option.key, { actionType: o.value, targetCampaignId: "" })}
                  />
                </div>
                {option.actionType === "CAMPAIGN" && (
                  <div className="flex-1">
                    <Select
                      options={campaignOptions}
                      value={campaignOptions.find((o) => o.value === option.targetCampaignId) || null}
                      onChange={(o) => updateOption(option.key, { targetCampaignId: o?.value || "" })}
                      placeholder={campaignOptions.length ? "Route to…" : "No campaigns yet"}
                      isDisabled={!campaignOptions.length}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Create IVR
          </Button>
        </div>
      </div>
    </Modal>
  );
}
