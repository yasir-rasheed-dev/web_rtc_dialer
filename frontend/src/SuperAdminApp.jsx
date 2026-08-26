import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck
} from "lucide-react";

import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import Input, { FIELD_CLASS } from "./components/ui/Input";
import Modal from "./components/ui/Modal";
import PageHeader from "./components/ui/PageHeader";
import Select from "./components/ui/Select";
import { SkeletonTable } from "./components/ui/Skeleton";
import StatusBadge from "./components/ui/StatusBadge";
import ThemeToggle from "./components/ui/ThemeToggle";
import Toggle from "./components/ui/Toggle";
import { confirmModal } from "./lib/modal";
import { notifyError, notifySuccess } from "./lib/toast";
import { getSuperAdminToken, setSuperAdminToken, superApi } from "./lib/api";

function shiftMonth(monthStr, delta) {
  const [year, month] = monthStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function fieldLabelClass() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

function SuperAdminLogin({ onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await superApi("/super-admin/auth/login", { method: "POST", body: { email, password } });
      setSuperAdminToken(payload.token);
      onAuthenticated(payload);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-[480px_1fr]">
      <ThemeToggle className="absolute right-6 top-6 z-10" />

      <section className="flex flex-col justify-center border-b border-border bg-surface px-8 py-12 sm:px-14 lg:border-b-0 lg:border-r lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mx-auto w-full max-w-sm"
        >
          <div className="mb-9 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-blue-700 text-sm font-extrabold text-white shadow-[0_12px_30px_-8px_rgb(var(--rn-blue)/0.45)]">
              RN
            </span>
            <div>
              <p className="text-base font-bold text-text">Ringnex</p>
              <p className="text-xs text-muted">Product Owner Portal</p>
            </div>
          </div>

          <span className="text-[11px] font-extrabold tracking-[0.16em] text-brand">SUPER ADMIN</span>
          <h1 className="mt-2 text-[38px] font-bold leading-tight tracking-tight text-text">Manage every setup</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Create tenants, control plans, extension ranges, limits and workspace status.
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
            <label className={fieldLabelClass()}>
              Email
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <label className={fieldLabelClass()}>
              Password
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
            <Button type="submit" loading={busy} icon={ShieldCheck} className="mt-1 w-full justify-center">
              {busy ? "Signing in…" : "Super Admin Sign in"}
            </Button>
          </form>
        </motion.div>
      </section>

      <aside className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-surface-2 to-bg lg:flex">
        <div className="max-w-sm px-10 text-center">
          <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full bg-brand/25"
            />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-surface shadow-card">
              <Building2 size={28} className="text-brand" />
            </span>
          </div>
          <h2 className="text-2xl font-bold leading-snug text-text">
            One platform.
            <br />
            Many isolated workspaces.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Product-level control without exposing one client's data to another.
          </p>
        </div>
      </aside>
    </main>
  );
}

const STATUS_OPTIONS = [
  { value: "TRIAL", label: "Trial" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CANCELLED", label: "Cancelled" }
];
const DESTRUCTIVE_STATUSES = new Set(["SUSPENDED", "CANCELLED", "INACTIVE"]);

function statusTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "TRIAL") return "brand";
  if (DESTRUCTIVE_STATUSES.has(status)) return "danger";
  return "neutral";
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
  routingProfileMode: "new",
  routingProfileId: "",
  routingProfileName: ""
};

function CreateSetupModal({ open, onClose, plans, tenants = [], onCreated }) {
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

function CreatePlanModal({ open, onClose, onCreated }) {
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

function TenantDetailView({ tenant, onBack, onStatusChanged }) {
  const [statusBusy, setStatusBusy] = useState(false);
  const [routingMode, setRoutingMode] = useState("new");
  const [routingSelectedId, setRoutingSelectedId] = useState("");
  const [routingSelectedName, setRoutingSelectedName] = useState("");
  const [routingBusy, setRoutingBusy] = useState(false);
  const [routingProfiles, setRoutingProfiles] = useState([]);
  const [routingProfilesLoading, setRoutingProfilesLoading] = useState(true);
  const routingProfileOptions = useMemo(
    () => routingProfiles.map((profile) => ({ value: String(profile.id), label: `${profile.name} (#${profile.id})` })),
    [routingProfiles]
  );

  // Fetched once up front (not lazily when "Use existing profile" is
  // clicked) so the dropdown already has its options — and can show the
  // current selection immediately — the moment the admin opens it.
  useEffect(() => {
    superApi("/super-admin/commio/routing-profiles")
      .then((res) => {
        const profiles = res.profiles || [];
        setRoutingProfiles(profiles);
        if (tenant.commio_routing_profile_id && profiles.some((p) => p.id === tenant.commio_routing_profile_id)) {
          setRoutingSelectedId(String(tenant.commio_routing_profile_id));
          setRoutingSelectedName(tenant.commio_routing_profile_name || "");
        }
      })
      .catch((e) => notifyError(e.message))
      .finally(() => setRoutingProfilesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [cost, setCost] = useState(null);
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState("");

  const loadCost = useCallback(
    (targetMonth) => {
      setCostLoading(true);
      setCostError("");
      return superApi(`/super-admin/tenants/${tenant.id}/commio-cost?month=${targetMonth}`)
        .then(setCost)
        .catch((e) => setCostError(e.message))
        .finally(() => setCostLoading(false));
    },
    [tenant.id]
  );

  useEffect(() => {
    loadCost(month);
  }, [month, loadCost]);

  const saveRoutingProfile = async () => {
    if (routingMode === "existing" && !routingSelectedId) {
      notifyError("Pick an existing Commio routing profile.");
      return;
    }
    setRoutingBusy(true);
    try {
      const result = await superApi(`/super-admin/tenants/${tenant.id}/commio-routing-profile`, {
        method: "POST",
        body: routingMode === "existing"
          ? { routingProfileMode: "existing", routingProfileId: routingSelectedId, routingProfileName: routingSelectedName }
          : { routingProfileMode: "new" }
      });
      notifySuccess(`Routing profile set to ${result.commioRoutingProfileName || result.commioRoutingProfileId}`);
      setRoutingSelectedId("");
      setRoutingSelectedName("");
      onStatusChanged();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setRoutingBusy(false);
    }
  };

  const changeStatus = async (status) => {
    if (status === tenant.status) return;
    if (DESTRUCTIVE_STATUSES.has(status)) {
      const confirmed = await confirmModal({
        title: `Set status to ${status}?`,
        message: `${tenant.name} will immediately lose the ability to sign in and place calls.`,
        danger: true
      });
      if (!confirmed) return;
    }
    setStatusBusy(true);
    try {
      await superApi(`/super-admin/tenants/${tenant.id}`, { method: "PATCH", body: { status } });
      notifySuccess(`${tenant.name} is now ${status}`);
      onStatusChanged();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <button onClick={onBack} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text">
        <ArrowLeft size={15} /> Back to setups
      </button>

      <PageHeader
        eyebrow="SETUP DETAIL"
        title={tenant.name}
        description={`${tenant.workspace} · ${tenant.plan_name || "Custom plan"}`}
        actions={
          <div className="w-44">
            <Select
              options={STATUS_OPTIONS}
              value={STATUS_OPTIONS.find((o) => o.value === tenant.status)}
              onChange={(o) => changeStatus(o.value)}
              isDisabled={statusBusy}
            />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Users</p>
          <p className="mt-1 text-2xl font-bold text-text">
            {tenant.active_users || 0}/{tenant.max_users ?? "∞"}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Price / user</p>
          <p className="mt-1 text-2xl font-bold text-text">${Number(tenant.price_per_user || 0).toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Extension start</p>
          <p className="mt-1 text-2xl font-bold text-text">{tenant.extension_start}</p>
        </Card>
      </div>

      <Card title="Commio incoming routing profile" description="DIDs this setup buys are assigned to this profile. Each setup gets its own, so routing changes for one tenant never affect another.">
        <div className="flex flex-col gap-3">
          <StatusBadge tone={tenant.commio_routing_profile_id ? "success" : "warning"}>
            {tenant.commio_routing_profile_id
              ? `Assigned: ${tenant.commio_routing_profile_name || "Unnamed"} (#${tenant.commio_routing_profile_id})`
              : "No routing profile assigned yet"}
          </StatusBadge>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={routingMode === "new" ? "primary" : "secondary"} onClick={() => setRoutingMode("new")}>
                Create new
              </Button>
              <Button type="button" size="sm" variant={routingMode === "existing" ? "primary" : "secondary"} onClick={() => setRoutingMode("existing")}>
                Use existing profile
              </Button>
            </div>
            {routingMode === "existing" && (
              <div className="w-64">
                <Select
                  isLoading={routingProfilesLoading}
                  options={routingProfileOptions}
                  value={routingProfileOptions.find((o) => o.value === routingSelectedId) || null}
                  onChange={(o) => {
                    setRoutingSelectedId(o?.value || "");
                    setRoutingSelectedName(o?.label?.replace(/\s*\(#\d+\)$/, "") || "");
                  }}
                  placeholder="Select a profile…"
                />
              </div>
            )}
            <Button size="sm" loading={routingBusy} onClick={saveRoutingProfile}>
              {tenant.commio_routing_profile_id ? "Replace" : "Assign"}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Actual Commio cost"
        description="Real per-number outbound call cost from Commio's CDR API, plus each number's known purchase cost."
        icon={CircleDollarSign}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-2 py-1.5">
            <Button size="sm" variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              ←
            </Button>
            <span className="min-w-[110px] text-center text-xs font-semibold text-text">{formatMonthLabel(month)}</span>
            <Button size="sm" variant="ghost" disabled={month === currentMonth} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              →
            </Button>
          </div>
        }
      >
        {costError && <div className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{costError}</div>}
        {costLoading ? (
          <SkeletonTable rows={3} cols={4} />
        ) : (
          <>
            <div className="mb-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Outbound call cost</p>
                <p className="mt-1 text-lg font-semibold text-text">${Number(cost?.outboundCost || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Number purchase cost</p>
                <p className="mt-1 text-lg font-semibold text-text">${Number(cost?.flatDidCost || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Total</p>
                <p className="mt-1 text-lg font-bold text-brand">${Number(cost?.totalCost || 0).toFixed(2)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4">Number</th>
                    <th className="pb-2 pr-4">Calls</th>
                    <th className="pb-2 pr-4">Outbound cost</th>
                    <th className="pb-2">Purchase cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(cost?.byNumber || []).map((row) => (
                    <tr key={row.number} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-text">{row.number}</td>
                      <td className="py-2.5 pr-4 text-muted">{row.calls ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-muted">
                        {row.outboundCost !== null ? `$${Number(row.outboundCost).toFixed(2)}` : row.error || "—"}
                      </td>
                      <td className="py-2.5 text-muted">${Number(row.purchaseCost || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(cost?.byNumber || []).length && <EmptyState title="No numbers on this setup" />}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function SetupsPage({ plans, tenants, summary, loading, onReload }) {
  const [createOpen, setCreateOpen] = useState(false);
  // Holds just the id, not a snapshot of the tenant object — the detail
  // view below re-derives its `tenant` prop from the live `tenants` array
  // on every render, so a save (routing profile, status, etc.) that
  // triggers onReload() shows up immediately without navigating away and
  // without risking a stale object if the reload hasn't landed yet.
  const [viewingId, setViewingId] = useState(null);
  const viewingTenant = useMemo(() => tenants.find((t) => t.id === viewingId) || null, [tenants, viewingId]);

  if (viewingTenant) {
    return (
      <TenantDetailView
        tenant={viewingTenant}
        onBack={() => setViewingId(null)}
        onStatusChanged={onReload}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="GLOBAL OPERATIONS"
        title="Client Setups"
        description="Create, price, activate and inspect every isolated Ringnex workspace."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={onReload}>
              Refresh
            </Button>
            <Button icon={Plus} onClick={() => setCreateOpen(true)}>
              Create Setup
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Setups</p>
          <p className="mt-1 text-2xl font-bold text-text">{summary.totalTenants || 0}</p>
          <p className="mt-1 text-xs text-muted">{summary.activeTenants || 0} active</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Users</p>
          <p className="mt-1 text-2xl font-bold text-text">{summary.totalUsers || 0}</p>
          <p className="mt-1 text-xs text-muted">{summary.activeUsers || 0} active</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Carrier cost</p>
          <p className="mt-1 text-2xl font-bold text-text">${Number(summary.carrierCost || 0).toFixed(2)}</p>
          <p className="mt-1 text-xs text-muted">Current month</p>
        </Card>
      </div>

      <Card title="Setups" description={`${tenants.length} workspaces`}>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} cols={7} />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Company</th>
                  <th className="pb-2 pr-4">Workspace</th>
                  <th className="pb-2 pr-4">Users</th>
                  <th className="pb-2 pr-4">Plan</th>
                  <th className="pb-2 pr-4">Routing profile</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-text">{tenant.name}</td>
                    <td className="py-3 pr-4 text-muted">{tenant.workspace}</td>
                    <td className="py-3 pr-4 text-muted">
                      {tenant.active_users || tenant.users || 0}/{tenant.max_users ?? "∞"}
                    </td>
                    <td className="py-3 pr-4 text-muted">{tenant.plan_name || "Custom"}</td>
                    <td className="py-3 pr-4">
                      {tenant.commio_routing_profile_id ? (
                        <StatusBadge tone="success">{tenant.commio_routing_profile_name || `#${tenant.commio_routing_profile_id}`}</StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">Not assigned</StatusBadge>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={statusTone(tenant.status)}>{tenant.status}</StatusBadge>
                    </td>
                    <td className="py-3">
                      <Button size="sm" variant="ghost" icon={Eye} onClick={() => setViewingId(tenant.id)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !tenants.length && <EmptyState title="No setups yet" description="Create your first client workspace." />}
        </div>
      </Card>

      <CreateSetupModal open={createOpen} onClose={() => setCreateOpen(false)} plans={plans} tenants={tenants} onCreated={onReload} />
    </div>
  );
}

function PlansPage({ plans, loading, onReload }) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="PRICING"
        title="Plans"
        description="Reusable SaaS plans; tenant-level overrides remain independent."
        actions={
          <Button icon={Plus} onClick={() => setCreateOpen(true)}>
            Add Plan
          </Button>
        }
      />

      <Card title="Pricing cards" description={`${plans.length} plans`}>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={4} cols={6} />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Plan</th>
                  <th className="pb-2 pr-4">$/user</th>
                  <th className="pb-2 pr-4">Users</th>
                  <th className="pb-2 pr-4">Outbound</th>
                  <th className="pb-2 pr-4">Inbound</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-text">{plan.name}</p>
                      {plan.code && <p className="text-xs text-muted">{plan.code}</p>}
                    </td>
                    <td className="py-3 pr-4 text-muted">${Number(plan.price_per_user || 0).toFixed(2)}</td>
                    <td className="py-3 pr-4 text-muted">{plan.max_users ?? "Unlimited"}</td>
                    <td className="py-3 pr-4 text-muted">{plan.outbound_minutes ?? "Unlimited"}</td>
                    <td className="py-3 pr-4 text-muted">{plan.inbound_minutes ?? "Unlimited"}</td>
                    <td className="py-3">
                      <StatusBadge tone={plan.active ? "success" : "neutral"}>{plan.active ? "Active" : "Inactive"}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !plans.length && <EmptyState title="No plans yet" description="Add a pricing plan to reuse across setups." />}
        </div>
      </Card>

      <CreatePlanModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onReload} />
    </div>
  );
}

const NAV_ITEMS = [
  { id: "setups", label: "Setups", icon: Building2 },
  { id: "plans", label: "Plans", icon: CircleDollarSign }
];

export default function SuperAdminApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(getSuperAdminToken()));
  const [tab, setTab] = useState("setups");
  const [overview, setOverview] = useState({ summary: {}, tenants: [] });
  const [plans, setPlans] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setDataLoading(true);
    setError("");
    try {
      const [overviewPayload, plansPayload] = await Promise.all([superApi("/super-admin/overview"), superApi("/super-admin/plans")]);
      setOverview(overviewPayload);
      setPlans(plansPayload.plans || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getSuperAdminToken()) {
      setLoading(false);
      return;
    }
    superApi("/super-admin/auth/session")
      .then(setSession)
      .catch(() => setSuperAdminToken(""))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-content-center gap-3 justify-items-center bg-bg text-muted">
        <RefreshCw className="animate-spin text-brand" size={26} />
        <span className="text-sm">Loading Product Owner portal…</span>
      </div>
    );
  }
  if (!session) return <SuperAdminLogin onAuthenticated={setSession} />;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-blue-700 text-xs font-extrabold text-white">
              RN
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-text">Ringnex SaaS</p>
              <p className="text-[11px] text-muted">Product Owner</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-text">{session.admin?.name || session.name}</p>
              <p className="text-[11px] text-muted">SUPER ADMIN</p>
            </div>
            <Button
              variant="icon"
              size="icon"
              icon={LogOut}
              onClick={() => {
                setSuperAdminToken("");
                setSession(null);
              }}
            />
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 px-6">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`relative flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "border-brand text-brand" : "border-transparent text-muted hover:text-text"
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && <div className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
        {tab === "setups" && (
          <SetupsPage plans={plans} tenants={overview.tenants || []} summary={overview.summary || {}} loading={dataLoading} onReload={load} />
        )}
        {tab === "plans" && <PlansPage plans={plans} loading={dataLoading} onReload={load} />}
      </main>
    </div>
  );
}
