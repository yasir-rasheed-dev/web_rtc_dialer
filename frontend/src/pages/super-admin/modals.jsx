import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import Button from "../../components/ui/Button";
import Input, { FIELD_CLASS } from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import Toggle from "../../components/ui/Toggle";
import { notifyError, notifySuccess } from "../../lib/toast";
import { superApi } from "../../lib/api";
import { fieldLabelClass } from "./shared";

const initialTenant = {
  name: "",
  workspace: "",
  ownerName: "",
  ownerEmail: "",
  ownerPassword: "",
  planId: "",
  pricePerUser: "45",
  maxUsers: "10",
  outboundMinutes: "10000",
  inboundMinutes: "10000",
  unlimitedUsers: false,
  unlimitedOutbound: false,
  unlimitedInbound: false,
  extensionStart: "1001",
  timezone: "UTC",
  country: "",
  didsText: "",
  routingProfileMode: "new",
  routingProfileId: "",
  routingProfileName: ""
};

export function CreateSetupModal({ open, onClose, plans, tenants = [], onCreated }) {
  const [form, setForm] = useState(initialTenant);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [routingProfiles, setRoutingProfiles] = useState([]);
  const [routingProfilesLoading, setRoutingProfilesLoading] = useState(true);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === form.planId), [plans, form.planId]);
  const planOptions = useMemo(
    () => [{ value: "", label: "Custom" }, ...plans.filter((plan) => plan.active).map((plan) => ({ value: plan.id, label: plan.name }))],
    [plans]
  );
  const routingProfileOptions = useMemo(
    () => routingProfiles.map((profile) => ({ value: String(profile.id), label: `${profile.name} (#${profile.id})` })),
    [routingProfiles]
  );

  // Suggests the next extension block (previous setup's +1000, e.g. 2001 ->
  // 3001) so Super Admin doesn't have to know the last one by heart — still
  // just a starting value, freely editable below.
  useEffect(() => {
    if (!open) return;
    const highest = Math.max(0, ...tenants.map((t) => Number(t.extension_start) || 0));
    setForm((current) => ({ ...current, extensionStart: String(highest ? highest + 1000 : 1001) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetched once up front (this modal component stays mounted even while
  // closed — see Modal.jsx — so this runs once for the page's lifetime)
  // instead of lazily when "Use existing profile" is clicked, so the
  // dropdown's options are already there the moment it's opened.
  useEffect(() => {
    superApi("/super-admin/commio/routing-profiles")
      .then((res) => setRoutingProfiles(res.profiles || []))
      .catch((e) => notifyError(e.message))
      .finally(() => setRoutingProfilesLoading(false));
  }, []);

  const choosePlan = (planId) => {
    const plan = plans.find((item) => item.id === planId);
    setForm((current) => ({
      ...current,
      planId,
      pricePerUser: plan ? String(plan.price_per_user ?? 0) : current.pricePerUser,
      maxUsers: plan?.max_users == null ? "" : String(plan.max_users),
      outboundMinutes: plan?.outbound_minutes == null ? "" : String(plan.outbound_minutes),
      inboundMinutes: plan?.inbound_minutes == null ? "" : String(plan.inbound_minutes),
      unlimitedUsers: plan ? plan.max_users == null : current.unlimitedUsers,
      unlimitedOutbound: plan ? plan.outbound_minutes == null : current.unlimitedOutbound,
      unlimitedInbound: plan ? plan.inbound_minutes == null : current.unlimitedInbound
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (form.routingProfileMode === "existing" && !String(form.routingProfileId).trim()) {
      setError("Pick an existing Commio routing profile, or switch to \"Create new\".");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await superApi("/super-admin/tenants", {
        method: "POST",
        body: {
          ...form,
          dids: form.didsText.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)
        }
      });
      notifySuccess(`Setup "${form.name}" created`);
      if (result?.commioRoutingProfileError) {
        notifyError(`Commio routing profile could not be created: ${result.commioRoutingProfileError}. Set it later from the tenant's detail page.`);
      }
      setForm(initialTenant);
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Setup" width="max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={fieldLabelClass()}>
            Company name
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className={fieldLabelClass()}>
            Workspace code
            <Input
              value={form.workspace}
              onChange={(e) => setForm({ ...form, workspace: e.target.value.toLowerCase() })}
              placeholder="abc-towing"
              required
            />
          </label>
          <label className={fieldLabelClass()}>
            Owner name
            <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required />
          </label>
          <label className={fieldLabelClass()}>
            Owner email
            <Input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} required />
          </label>
          <label className={fieldLabelClass()}>
            Initial owner password
            <Input
              type="password"
              value={form.ownerPassword}
              onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
              minLength={12}
              required
            />
          </label>
          <label className={fieldLabelClass()}>
            Pricing plan
            <Select options={planOptions} value={planOptions.find((o) => o.value === form.planId) || planOptions[0]} onChange={(o) => choosePlan(o.value)} />
          </label>
          <label className={fieldLabelClass()}>
            Price per user / month
            <Input type="number" min="0" step="0.01" value={form.pricePerUser} onChange={(e) => setForm({ ...form, pricePerUser: e.target.value })} />
          </label>
          <label className={fieldLabelClass()}>
            Extension start
            <Input type="number" min="100" value={form.extensionStart} onChange={(e) => setForm({ ...form, extensionStart: e.target.value })} required />
          </label>

          <div className="flex items-end gap-3">
            <label className={`${fieldLabelClass()} flex-1`}>
              Max users
              <Input type="number" min="0" disabled={form.unlimitedUsers} value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-muted">
              <Toggle checked={form.unlimitedUsers} onChange={(v) => setForm({ ...form, unlimitedUsers: v })} label="Unlimited users" />
              Unlimited
            </label>
          </div>
          <div />
          <div className="flex items-end gap-3">
            <label className={`${fieldLabelClass()} flex-1`}>
              Outbound minutes
              <Input type="number" min="0" disabled={form.unlimitedOutbound} value={form.outboundMinutes} onChange={(e) => setForm({ ...form, outboundMinutes: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-muted">
              <Toggle checked={form.unlimitedOutbound} onChange={(v) => setForm({ ...form, unlimitedOutbound: v })} label="Unlimited outbound" />
              Unlimited
            </label>
          </div>
          <div className="flex items-end gap-3">
            <label className={`${fieldLabelClass()} flex-1`}>
              Inbound minutes
              <Input type="number" min="0" disabled={form.unlimitedInbound} value={form.inboundMinutes} onChange={(e) => setForm({ ...form, inboundMinutes: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-muted">
              <Toggle checked={form.unlimitedInbound} onChange={(v) => setForm({ ...form, unlimitedInbound: v })} label="Unlimited inbound" />
              Unlimited
            </label>
          </div>

          <label className={fieldLabelClass()}>
            Timezone
            <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
          </label>
          <label className={fieldLabelClass()}>
            Country
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </label>
        </div>

        <label className={fieldLabelClass()}>
          DIDs (comma or new line separated)
          <textarea
            rows={3}
            value={form.didsText}
            onChange={(e) => setForm({ ...form, didsText: e.target.value })}
            placeholder={"17722304756\n17733622102"}
            className={FIELD_CLASS}
          />
        </label>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-text">Commio incoming (inbound routing) profile</p>
            <p className="text-xs text-muted">DIDs this setup buys get assigned to this profile — separate from every other setup's.</p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={form.routingProfileMode === "new" ? "primary" : "secondary"}
              onClick={() => setForm({ ...form, routingProfileMode: "new" })}
            >
              Create a new profile for this setup
            </Button>
            <Button
              type="button"
              size="sm"
              variant={form.routingProfileMode === "existing" ? "primary" : "secondary"}
              onClick={() => setForm({ ...form, routingProfileMode: "existing" })}
            >
              Use an existing profile id
            </Button>
          </div>
          {form.routingProfileMode === "existing" && (
            <label className={fieldLabelClass()}>
              Existing Commio routing profile
              <Select
                isLoading={routingProfilesLoading}
                options={routingProfileOptions}
                value={routingProfileOptions.find((o) => o.value === form.routingProfileId) || null}
                onChange={(o) => setForm({ ...form, routingProfileId: o?.value || "", routingProfileName: o?.label?.replace(/\s*\(#\d+\)$/, "") || "" })}
                placeholder="Select a profile…"
              />
            </label>
          )}
        </div>

        {selectedPlan && (
          <div className="flex items-center gap-2 rounded-xl bg-brand/5 px-3 py-2 text-xs text-brand">
            <CheckCircle2 size={14} /> Plan values are copied into this tenant and can be overridden without changing the original pricing card.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Create Setup
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const initialPlan = {
  name: "",
  code: "",
  pricePerUser: "45",
  maxUsers: "10",
  outboundMinutes: "10000",
  inboundMinutes: "10000",
  unlimitedUsers: false,
  unlimitedOutbound: false,
  unlimitedInbound: false
};

export function CreatePlanModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(initialPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await superApi("/super-admin/plans", { method: "POST", body: form });
      notifySuccess(`Plan "${form.name}" created`);
      setForm(initialPlan);
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add pricing plan" width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
        <label className={fieldLabelClass()}>
          Plan name
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className={fieldLabelClass()}>
          Code
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="starter" />
        </label>
        <label className={fieldLabelClass()}>
          Price per user / month
          <Input type="number" min="0" step="0.01" value={form.pricePerUser} onChange={(e) => setForm({ ...form, pricePerUser: e.target.value })} />
        </label>
        <div className="flex items-end gap-3">
          <label className={`${fieldLabelClass()} flex-1`}>
            Max users
            <Input type="number" min="0" disabled={form.unlimitedUsers} value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-muted">
            <Toggle checked={form.unlimitedUsers} onChange={(v) => setForm({ ...form, unlimitedUsers: v })} label="Unlimited users" />
            Unlimited
          </label>
        </div>
        <div className="flex items-end gap-3">
          <label className={`${fieldLabelClass()} flex-1`}>
            Outbound minutes
            <Input type="number" min="0" disabled={form.unlimitedOutbound} value={form.outboundMinutes} onChange={(e) => setForm({ ...form, outboundMinutes: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-muted">
            <Toggle checked={form.unlimitedOutbound} onChange={(v) => setForm({ ...form, unlimitedOutbound: v })} label="Unlimited outbound" />
            Unlimited
          </label>
        </div>
        <div className="flex items-end gap-3">
          <label className={`${fieldLabelClass()} flex-1`}>
            Inbound minutes
            <Input type="number" min="0" disabled={form.unlimitedInbound} value={form.inboundMinutes} onChange={(e) => setForm({ ...form, inboundMinutes: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-muted">
            <Toggle checked={form.unlimitedInbound} onChange={(v) => setForm({ ...form, unlimitedInbound: v })} label="Unlimited inbound" />
            Unlimited
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Add plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
