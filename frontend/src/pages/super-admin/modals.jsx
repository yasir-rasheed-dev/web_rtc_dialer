import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CheckCircle2 } from "lucide-react";

import Button from "../../components/ui/Button";
import Input, { FIELD_CLASS } from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Segmented from "../../components/ui/Segmented";
import Select from "../../components/ui/Select";
import Toggle from "../../components/ui/Toggle";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";
import { superApi } from "../../lib/api";
import { fieldLabelClass } from "./shared";

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const CREATE_STEPS = [
  { id: "workspace", label: "Workspace" },
  { id: "plan", label: "Plan & limits" },
  { id: "telephony", label: "Telephony" }
];

function Stepper({ step }) {
  return (
    <div className="mb-6 flex items-center">
      {CREATE_STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={s.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold " +
                  (active
                    ? "border-brand bg-brand text-white"
                    : done
                      ? "border-brand/40 bg-brand/10 text-brand"
                      : "border-border bg-surface-2 text-muted")
                }
              >
                {done ? <Check size={14} /> : i + 1}
              </span>
              <span className={"hidden text-xs font-semibold sm:inline " + (active || done ? "text-text" : "text-muted")}>
                {s.label}
              </span>
            </div>
            {i < CREATE_STEPS.length - 1 && (
              <span className={"mx-3 h-px flex-1 " + (done ? "bg-brand/40" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Number field with an "Unlimited" switch below — stacks cleanly in narrow columns. */
function LimitField({ label, value, unlimited, onValue, onUnlimited, min = "0", hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <Input
        type="number"
        min={min}
        disabled={unlimited}
        value={unlimited ? "" : value}
        placeholder={unlimited ? "Unlimited" : undefined}
        onChange={(e) => onValue(e.target.value)}
      />
      <label className="mt-0.5 flex cursor-pointer select-none items-center gap-2 text-[11px] font-medium text-muted">
        <Toggle checked={unlimited} onChange={onUnlimited} label={`${label}: unlimited`} />
        Unlimited
      </label>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Horizontal allowance row: label · number input · Unlimited switch. */
function AllowanceRow({ label, value, unlimited, onValue, onUnlimited, min = "0" }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs font-medium text-text">{label}</span>
      <Input
        type="number"
        min={min}
        className="flex-1"
        disabled={unlimited}
        value={unlimited ? "" : value}
        placeholder={unlimited ? "Unlimited" : undefined}
        onChange={(e) => onValue(e.target.value)}
      />
      <label className="flex shrink-0 cursor-pointer select-none items-center gap-1.5 text-[11px] font-medium text-muted">
        <Toggle checked={unlimited} onChange={onUnlimited} label={`${label}: unlimited`} />
        <span className="hidden sm:inline">Unlimited</span>
      </label>
    </div>
  );
}

/** Live pricing-card preview shown beside the plan form. */
function PlanPreview({ form, editing }) {
  const fmt = (v, unl) => (unl ? "Unlimited" : v === "" || v == null ? "—" : Number(v).toLocaleString());
  const rows = [
    ["Users", fmt(form.maxUsers, form.unlimitedUsers)],
    ["Outbound min", fmt(form.outboundMinutes, form.unlimitedOutbound)],
    ["Inbound min", fmt(form.inboundMinutes, form.unlimitedInbound)]
  ];
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{form.name || "Plan name"}</p>
          {form.code ? <p className="font-mono text-[11px] text-muted">{form.code}</p> : null}
        </div>
        {editing && (
          <span
            className={
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
              (form.active ? "bg-success-soft text-success" : "bg-surface-2 text-muted")
            }
          >
            {form.active ? "Active" : "Inactive"}
          </span>
        )}
      </div>
      {form.description ? (
        <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-muted">{form.description}</p>
      ) : null}
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-bold tracking-tight text-text">
          ${Number(form.pricePerUser || 0).toFixed(0)}
        </span>
        <span className="text-[11px] text-muted">/ user / mo</span>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-[11px]">
        {rows.map(([l, v]) => (
          <div key={l} className="flex items-center justify-between gap-2">
            <span className="text-muted">{l}</span>
            <span className="font-semibold tabular-nums text-text">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Label + helper on the left, control on the right — hairline divided list. */
function ToggleRow({ title, description, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

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
  canPurchaseNumbers: true,
  canUseAutoDialer: true,
  canUseTollFree: true,
  // Opt-in, unlike the two above — brand new feature, nothing should
  // switch on for a new tenant unless explicitly checked here.
  canUseLeads: false,
  routingProfileMode: "new",
  routingProfileId: "",
  routingProfileName: ""
};

export function CreateSetupModal({ open, onClose, plans, tenants = [], onCreated, prefill = null }) {
  const [form, setForm] = useState(initialTenant);
  const [step, setStep] = useState(0);
  const [wsTouched, setWsTouched] = useState(false);
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
    setStep(0);
    setError("");
    const highest = Math.max(0, ...tenants.map((t) => Number(t.extension_start) || 0));
    // Start from a clean form, then apply an onboarding-request prefill if
    // one was passed (Super Admin → Onboarding → "Create setup").
    const base = { ...initialTenant, extensionStart: String(highest ? highest + 1000 : 1001) };
    if (prefill) {
      const planByCode = prefill.planCode
        ? plans.find((p) => p.code === prefill.planCode || p.id === prefill.planId)
        : null;
      Object.assign(base, {
        name: prefill.companyName || "",
        workspace: prefill.workspaceSlug || "",
        ownerName: prefill.contactName || "",
        ownerEmail: prefill.contactEmail || "",
        country: prefill.country || "",
        planId: planByCode ? planByCode.id : "",
        canUseTollFree: !!prefill.needsTollFree,
        canUseAutoDialer: !!prefill.needsAutoDialer,
        canPurchaseNumbers: !!prefill.needsNumbers
      });
      if (planByCode) {
        base.pricePerUser = String(planByCode.price_per_user ?? base.pricePerUser);
        base.unlimitedUsers = planByCode.max_users == null;
        base.maxUsers = planByCode.max_users == null ? base.maxUsers : String(planByCode.max_users);
        base.unlimitedOutbound = planByCode.outbound_minutes == null;
        base.outboundMinutes = planByCode.outbound_minutes == null ? base.outboundMinutes : String(planByCode.outbound_minutes);
        base.unlimitedInbound = planByCode.inbound_minutes == null;
        base.inboundMinutes = planByCode.inbound_minutes == null ? base.inboundMinutes : String(planByCode.inbound_minutes);
        if (planByCode.features?.ALL) {
          base.canUseTollFree = base.canUseAutoDialer = base.canPurchaseNumbers = true;
        }
      }
    }
    setForm(base);
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

  const stepError = () => {
    if (step === 0) {
      if (!form.name.trim()) return "Company name is required.";
      if (!form.workspace.trim()) return "Workspace code is required.";
      if (!form.ownerName.trim()) return "Owner name is required.";
      if (!/^\S+@\S+\.\S+$/.test(form.ownerEmail)) return "Enter a valid owner email.";
      if (form.ownerPassword.length < 12) return "Owner password must be at least 12 characters.";
    }
    if (step === 1) {
      if (form.pricePerUser === "" || Number(form.pricePerUser) < 0) return "Set a price per user (0 or more).";
      if (!form.unlimitedUsers && (form.maxUsers === "" || Number(form.maxUsers) < 1)) return "Set max users, or mark it unlimited.";
      if (Number(form.extensionStart) < 100) return "Extension start must be 100 or higher.";
    }
    return "";
  };

  const next = () => {
    const e = stepError();
    if (e) {
      setError(e);
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, CREATE_STEPS.length - 1));
  };
  const back = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (step < CREATE_STEPS.length - 1) {
      next();
      return;
    }
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
      setStep(0);
      setWsTouched(false);
      onCreated(result || null);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Setup" width="max-w-2xl">
      <Stepper step={step} />

      <form onSubmit={submit} className="flex flex-col">
        {error && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>
        )}

        <div className="min-h-[340px]">
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={fieldLabelClass()}>
                  Company name
                  <Input
                    autoFocus
                    value={form.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setForm((f) => ({ ...f, name, workspace: wsTouched ? f.workspace : slugify(name) }));
                    }}
                  />
                </label>
                <label className={fieldLabelClass()}>
                  Workspace code
                  <Input
                    value={form.workspace}
                    onChange={(e) => {
                      setWsTouched(true);
                      setForm((f) => ({ ...f, workspace: slugify(e.target.value) }));
                    }}
                    placeholder="abc-towing"
                  />
                  <span className="font-normal normal-case text-[11px] text-muted">
                    Used at sign-in. Lowercase &amp; dashes{form.workspace ? ` — “${form.workspace}”` : ""}.
                  </span>
                </label>
              </div>

              <div className="rounded-lg border border-border">
                <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Owner account
                </p>
                <div className="grid gap-4 p-4 sm:grid-cols-2">
                  <label className={fieldLabelClass()}>
                    Owner name
                    <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
                  </label>
                  <label className={fieldLabelClass()}>
                    Owner email
                    <Input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
                  </label>
                  <label className={`${fieldLabelClass()} sm:col-span-2`}>
                    Initial password
                    <Input
                      type="password"
                      value={form.ownerPassword}
                      onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                    />
                    <span className="font-normal normal-case text-[11px] text-muted">
                      At least 12 characters — the owner can change it after first sign-in.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={fieldLabelClass()}>
                  Pricing plan
                  <Select
                    options={planOptions}
                    value={planOptions.find((o) => o.value === form.planId) || planOptions[0]}
                    onChange={(o) => choosePlan(o.value)}
                  />
                </label>
                <label className={fieldLabelClass()}>
                  Price per user / month
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.pricePerUser}
                    onChange={(e) => setForm({ ...form, pricePerUser: e.target.value })}
                  />
                </label>
              </div>

              {selectedPlan && (
                <div className="flex items-start gap-2 rounded-lg border border-brand/25 bg-brand/5 px-3 py-2 text-xs text-brand">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                  Values from “{selectedPlan.name}” are copied in below — override any of them without touching the plan.
                </div>
              )}

              <div className="rounded-lg border border-border p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Monthly limits</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <LimitField
                    label="Max users"
                    value={form.maxUsers}
                    unlimited={form.unlimitedUsers}
                    onValue={(v) => setForm({ ...form, maxUsers: v })}
                    onUnlimited={(v) => setForm({ ...form, unlimitedUsers: v })}
                    min="1"
                  />
                  <LimitField
                    label="Outbound minutes"
                    value={form.outboundMinutes}
                    unlimited={form.unlimitedOutbound}
                    onValue={(v) => setForm({ ...form, outboundMinutes: v })}
                    onUnlimited={(v) => setForm({ ...form, unlimitedOutbound: v })}
                  />
                  <LimitField
                    label="Inbound minutes"
                    value={form.inboundMinutes}
                    unlimited={form.unlimitedInbound}
                    onValue={(v) => setForm({ ...form, inboundMinutes: v })}
                    onUnlimited={(v) => setForm({ ...form, unlimitedInbound: v })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className={fieldLabelClass()}>
                  Extension start
                  <Input
                    type="number"
                    min="100"
                    value={form.extensionStart}
                    onChange={(e) => setForm({ ...form, extensionStart: e.target.value })}
                  />
                  <span className="font-normal normal-case text-[11px] text-muted">Suggested next block — editable.</span>
                </label>
                <label className={fieldLabelClass()}>
                  Timezone
                  <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
                </label>
                <label className={fieldLabelClass()}>
                  Country
                  <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <label className={fieldLabelClass()}>
                Phone numbers (DIDs) — optional
                <textarea
                  rows={2}
                  value={form.didsText}
                  onChange={(e) => setForm({ ...form, didsText: e.target.value })}
                  placeholder="17722304756, 17733622102"
                  className={FIELD_CLASS}
                />
                <span className="font-normal normal-case text-[11px] text-muted">
                  Comma or newline separated — numbers you already own for this client.
                </span>
              </label>

              <div className="rounded-lg border border-border p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Feature access</p>
                <div className="divide-y divide-border">
                  <ToggleRow
                    title="Buy phone numbers"
                    description={
                      form.canPurchaseNumbers
                        ? "Workspace can search and buy Commio numbers itself."
                        : "You'll buy numbers for them from the setup's detail page; they can still assign what they have."
                    }
                  >
                    <Toggle
                      checked={form.canPurchaseNumbers}
                      onChange={(v) => setForm({ ...form, canPurchaseNumbers: v })}
                      label="Let this workspace buy its own phone numbers"
                    />
                  </ToggleRow>
                  <ToggleRow title="Auto Dialer" description="Outbound campaigns, contact upload and assignment.">
                    <Toggle
                      checked={form.canUseAutoDialer}
                      onChange={(v) => setForm({ ...form, canUseAutoDialer: v })}
                      label="Enable Auto Dialer"
                    />
                  </ToggleRow>
                  <ToggleRow title="Toll-Free" description="Inbound toll-free numbers, queues and the IVR.">
                    <Toggle
                      checked={form.canUseTollFree}
                      onChange={(v) => setForm({ ...form, canUseTollFree: v })}
                      label="Enable Toll-Free"
                    />
                  </ToggleRow>
                  <ToggleRow title="Lead Management" description="Persistent leads, follow-ups and end-call capture.">
                    <Toggle
                      checked={form.canUseLeads}
                      onChange={(v) => setForm({ ...form, canUseLeads: v })}
                      label="Enable Lead Management"
                    />
                  </ToggleRow>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Commio inbound routing profile</p>
                <p className="mt-0.5 text-xs text-muted">DIDs this setup buys land here — isolated from every other setup.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Segmented
                    value={form.routingProfileMode}
                    onChange={(v) => setForm({ ...form, routingProfileMode: v })}
                    options={[
                      { value: "new", label: "Create new" },
                      { value: "existing", label: "Use existing" }
                    ]}
                  />
                  {form.routingProfileMode === "existing" && (
                    <div className="w-56">
                      <Select
                        isLoading={routingProfilesLoading}
                        options={routingProfileOptions}
                        value={routingProfileOptions.find((o) => o.value === form.routingProfileId) || null}
                        onChange={(o) =>
                          setForm({
                            ...form,
                            routingProfileId: o?.value || "",
                            routingProfileName: o?.label?.replace(/\s*\(#\d+\)$/, "") || ""
                          })
                        }
                        placeholder="Select a profile…"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="secondary" icon={ArrowLeft} onClick={back} disabled={busy}>
                Back
              </Button>
            )}
            {step < CREATE_STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                Next
              </Button>
            ) : (
              <Button type="submit" loading={busy}>
                Create Setup
              </Button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

const emptyPlanForm = {
  name: "",
  code: "",
  description: "",
  pricePerUser: "45",
  maxUsers: "10",
  outboundMinutes: "10000",
  inboundMinutes: "10000",
  unlimitedUsers: false,
  unlimitedOutbound: false,
  unlimitedInbound: false,
  active: true
};

function planToForm(plan) {
  return {
    name: plan.name || "",
    code: plan.code || "",
    description: plan.description || "",
    pricePerUser: String(plan.price_per_user ?? 0),
    maxUsers: plan.max_users == null ? "" : String(plan.max_users),
    outboundMinutes: plan.outbound_minutes == null ? "" : String(plan.outbound_minutes),
    inboundMinutes: plan.inbound_minutes == null ? "" : String(plan.inbound_minutes),
    unlimitedUsers: plan.max_users == null,
    unlimitedOutbound: plan.outbound_minutes == null,
    unlimitedInbound: plan.inbound_minutes == null,
    active: Boolean(plan.active)
  };
}

/**
 * Create OR edit a pricing plan. Pass `plan` to edit (POST /super-admin/plans
 * vs PATCH /super-admin/plans/:id). `code` is immutable once created.
 */
export function PlanModal({ open, onClose, onSaved, plan = null }) {
  const editing = Boolean(plan);
  const [form, setForm] = useState(emptyPlanForm);
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(plan ? planToForm(plan) : emptyPlanForm);
    setCodeTouched(false);
    setError("");
  }, [open, plan]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Plan name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await superApi(`/super-admin/plans/${plan.id}`, { method: "PATCH", body: form });
        notifySuccess(`Plan "${form.name}" updated`);
      } else {
        await superApi("/super-admin/plans", { method: "POST", body: form });
        notifySuccess(`Plan "${form.name}" created`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setName = (name) =>
    setForm((f) => ({ ...f, name, code: !editing && !codeTouched ? slugify(name) : f.code }));

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit pricing plan" : "Add pricing plan"} width="max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-5">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_236px]">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={fieldLabelClass()}>
                Plan name
                <Input autoFocus value={form.name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className={fieldLabelClass()}>
                Code
                {editing ? (
                  <span className={`${FIELD_CLASS} flex items-center font-mono text-muted`}>{form.code || "—"}</span>
                ) : (
                  <Input
                    value={form.code}
                    onChange={(e) => {
                      setCodeTouched(true);
                      setForm({ ...form, code: slugify(e.target.value) });
                    }}
                    placeholder="starter"
                  />
                )}
              </label>
            </div>

            <label className={fieldLabelClass()}>
              Description
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Who this plan is for"
              />
            </label>

            <label className={`${fieldLabelClass()} max-w-[220px]`}>
              Price per user / month
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7"
                  value={form.pricePerUser}
                  onChange={(e) => setForm({ ...form, pricePerUser: e.target.value })}
                />
              </div>
            </label>

            <div className="rounded-lg border border-border p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Allowances / month</p>
              <div className="flex flex-col gap-3">
                <AllowanceRow
                  label="Max users"
                  value={form.maxUsers}
                  unlimited={form.unlimitedUsers}
                  onValue={(v) => setForm({ ...form, maxUsers: v })}
                  onUnlimited={(v) => setForm({ ...form, unlimitedUsers: v })}
                  min="1"
                />
                <AllowanceRow
                  label="Outbound minutes"
                  value={form.outboundMinutes}
                  unlimited={form.unlimitedOutbound}
                  onValue={(v) => setForm({ ...form, outboundMinutes: v })}
                  onUnlimited={(v) => setForm({ ...form, unlimitedOutbound: v })}
                />
                <AllowanceRow
                  label="Inbound minutes"
                  value={form.inboundMinutes}
                  unlimited={form.unlimitedInbound}
                  onValue={(v) => setForm({ ...form, inboundMinutes: v })}
                  onUnlimited={(v) => setForm({ ...form, unlimitedInbound: v })}
                />
              </div>
            </div>

            {editing && (
              <ToggleRow
                title="Active"
                description="Inactive plans stay attached to their setups but are hidden when creating new ones."
              >
                <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Plan active" />
              </ToggleRow>
            )}
          </div>

          <aside className="hidden lg:block">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Live preview</p>
            <PlanPreview form={form} editing={editing} />
          </aside>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {editing ? "Save changes" : "Add plan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Edits an EXISTING tenant's limits (PATCH /super-admin/tenants/:id, same
// endpoint CreateSetupModal's counterpart hits on creation) — mirrors that
// modal's Max users / Outbound minutes / Inbound minutes block exactly,
// just pre-filled from the tenant's current values instead of a plan.
export function EditSetupModal({ open, onClose, tenant, onUpdated }) {
  const [form, setForm] = useState({ maxUsers: "", outboundMinutes: "", inboundMinutes: "", unlimitedUsers: false, unlimitedOutbound: false, unlimitedInbound: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !tenant) return;
    setForm({
      maxUsers: tenant.max_users == null ? "" : String(tenant.max_users),
      outboundMinutes: tenant.outbound_minutes == null ? "" : String(tenant.outbound_minutes),
      inboundMinutes: tenant.inbound_minutes == null ? "" : String(tenant.inbound_minutes),
      unlimitedUsers: tenant.max_users == null,
      unlimitedOutbound: tenant.outbound_minutes == null,
      unlimitedInbound: tenant.inbound_minutes == null
    });
    setError("");
  }, [open, tenant]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await superApi(`/super-admin/tenants/${tenant.id}`, { method: "PATCH", body: form });
      notifySuccess("Setup limits updated");
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit setup limits" width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
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
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Lets Super Admin set a brand new password for a tenant's Owner account —
// e.g. the Owner is locked out and no one else in that workspace can reset
// it for them. Hits its own dedicated route (Super Admin has no session
// inside the tenant, so it can't use the regular PATCH /users/:id flow).
export function ResetOwnerPasswordModal({ open, onClose, tenant }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirmPassword("");
    setError("");
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const confirmed = await confirmModal({
      title: "Reset Owner password?",
      message: `${tenant.name}'s Owner will be signed out everywhere immediately and must use this new password to log back in.`,
      danger: true
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await superApi(`/super-admin/tenants/${tenant.id}/owner-password`, { method: "POST", body: { password } });
      notifySuccess("Owner password reset");
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Reset Owner password" width="max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
        <label className={fieldLabelClass()}>
          New password
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </label>
        <label className={fieldLabelClass()}>
          Confirm password
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
