import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, UserCheck } from "lucide-react";

import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { notifySuccess } from "../../lib/toast";
import { assignCampaignAgents, createCampaign, updateCampaign } from "../../lib/campaignApi";

// Shared by CampaignsPanel and CampaignDetailView — both let the admin
// create/edit a campaign or assign agents to one.

const MODE_OPTIONS = [
  { value: "CLICK_TO_CALL", label: "Click to call" },
  { value: "PREVIEW", label: "Preview" }
];

const EMPTY_CAMPAIGN = {
  name: "",
  description: "",
  mode: "CLICK_TO_CALL",
  maxAttempts: 3,
  retryDelayMinutes: 30
};

function fieldLabel() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

export function CreateCampaignModal({ open, onClose, campaign, onSaved }) {
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

export function AssignAgentsModal({ open, onClose, campaign, users, onAssigned }) {
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
