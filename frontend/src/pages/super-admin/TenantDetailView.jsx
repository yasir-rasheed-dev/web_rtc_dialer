import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  KeyRound,
  Plus,
  Route,
  Search,
  Settings2
} from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { SkeletonTable } from "../../components/ui/Skeleton";
import Toggle from "../../components/ui/Toggle";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";
import {
  completeCommioOrderForTenant,
  reserveCommioNumberForTenant,
  searchCommioNumbersAsSuperAdmin,
  superApi
} from "../../lib/api";
import { EditSetupModal, ResetOwnerPasswordModal } from "./modals";
import { STATUS_OPTIONS, DESTRUCTIVE_STATUSES } from "./shared";

function formatDidDisplay(number) {
  const digits = String(number || "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return number;
  return `+1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

const DID_SEARCH_TYPES = [
  { value: "domestic", label: "Local number" },
  { value: "tollfree", label: "Toll-free" }
];

// Same search -> reserve -> confirm flow as the tenant-side BuyNumberModal
// (DidsPage.jsx), just pointed at the Super Admin routes and an explicit
// tenantId instead of the caller's own — this is how a tenant with
// canPurchaseNumbers off still ends up with numbers: Super Admin buys and
// hands them over directly, same as an already-assigned DID would show up
// for that tenant to then give to an agent.
function BuyForTenantModal({ open, onClose, tenantId, onPurchased }) {
  const [searchType, setSearchType] = useState("domestic");
  const [npa, setNpa] = useState("");
  const [state, setState] = useState("");
  const [rateCenter, setRateCenter] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState("");

  const [selected, setSelected] = useState(null);
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState("");
  const [reservation, setReservation] = useState(null);

  const [confirming, setConfirming] = useState(false);

  const reset = () => {
    setSearchType("domestic");
    setNpa("");
    setState("");
    setRateCenter("");
    setResults(null);
    setSearchError("");
    setSelected(null);
    setReserveError("");
    setReservation(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const search = async (event) => {
    event.preventDefault();
    setSearching(true);
    setSearchError("");
    setResults(null);
    try {
      const params = { searchType, quantity: 10 };
      if (searchType === "domestic") {
        if (npa.trim()) params.npa = npa.trim();
        if (state.trim()) params.state = state.trim();
        if (rateCenter.trim()) params.rateCenter = rateCenter.trim();
      } else if (npa.trim()) {
        params.npa = npa.trim();
      }
      setResults(await searchCommioNumbersAsSuperAdmin(params));
    } catch (requestError) {
      setSearchError(requestError.message);
    } finally {
      setSearching(false);
    }
  };

  const reserve = async (number) => {
    setSelected(number);
    setReserving(true);
    setReserveError("");
    setReservation(null);
    try {
      const payload = await reserveCommioNumberForTenant(tenantId, number.did, searchType === "tollfree" ? "TOLLFREE" : "LOCAL");
      if (!payload.price) {
        setReserveError("Number reserved, but the price could not be confirmed. Please try again rather than purchase blind.");
        return;
      }
      setReservation(payload);
    } catch (requestError) {
      setReserveError(requestError.message);
    } finally {
      setReserving(false);
    }
  };

  const confirmPurchase = async () => {
    if (!reservation) return;
    setConfirming(true);
    try {
      const result = await completeCommioOrderForTenant(tenantId, reservation.orderId);
      notifySuccess(`Purchased ${formatDidDisplay(reservation.did)} for this workspace`);
      if (result.routingAssigned === false) {
        notifyError(`Number purchased, but inbound routing could not be assigned automatically: ${result.routingError || "unknown error"}.`);
      }
      onPurchased();
      close();
    } catch (requestError) {
      notifyError(requestError.message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Buy a number for this workspace" width="max-w-2xl">
      {!reservation ? (
        <div className="flex flex-col gap-5">
          <form onSubmit={search} className="flex flex-wrap items-end gap-3">
            <label className="flex w-[170px] flex-col gap-1.5 text-xs font-medium text-muted">
              Type
              <Select
                options={DID_SEARCH_TYPES}
                value={DID_SEARCH_TYPES.find((option) => option.value === searchType)}
                onChange={(option) => setSearchType(option.value)}
              />
            </label>
            <label className="flex w-[120px] flex-col gap-1.5 text-xs font-medium text-muted">
              Area code
              <Input value={npa} onChange={(e) => setNpa(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="919" />
            </label>
            {searchType === "domestic" && (
              <>
                <label className="flex w-[90px] flex-col gap-1.5 text-xs font-medium text-muted">
                  State
                  <Input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="NC" />
                </label>
                <label className="flex min-w-[160px] flex-1 flex-col gap-1.5 text-xs font-medium text-muted">
                  Rate center
                  <Input value={rateCenter} onChange={(e) => setRateCenter(e.target.value)} placeholder="RALEIGH" />
                </label>
              </>
            )}
            <Button type="submit" icon={Search} loading={searching}>
              Search
            </Button>
          </form>

          {searchError && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{searchError}</div>}
          {reserveError && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{reserveError}</div>}

          {results && (
            <div className="flex flex-col gap-2">
              {results.length === 0 ? (
                <EmptyState title="No numbers found" description="Try a different area code, state, or rate center." />
              ) : (
                results.map((number) => (
                  <div
                    key={number.did}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-text">{formatDidDisplay(number.did)}</p>
                      <p className="text-xs text-muted">
                        {[number.rateCenter, number.state].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={reserving && selected?.did === number.did}
                      disabled={reserving}
                      onClick={() => reserve(number)}
                    >
                      Select
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Number</p>
            <p className="mt-1 text-lg font-bold text-text">{formatDidDisplay(reservation.did)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Price</p>
            <div className="mt-2 flex flex-col gap-1 text-sm text-text">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>${Number(reservation.price.subtotal ?? 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Taxes</span><span>${Number(reservation.price.taxes ?? 0).toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span>${Number(reservation.price.total ?? 0).toFixed(2)}</span></div>
            </div>
          </div>
          <p className="text-xs text-muted">
            Confirming charges the Commio account and hands this number straight to the workspace — it'll show up on
            their Phone Numbers page, ready to assign to an agent.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReservation(null)} disabled={confirming}>
              Back
            </Button>
            <Button onClick={confirmPurchase} loading={confirming}>
              Confirm & Buy
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function shiftMonth(monthStr, delta) {
  const [year, month] = monthStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

const STATUS_DOT = {
  ACTIVE: "bg-success",
  TRIAL: "bg-brand",
  INACTIVE: "bg-muted",
  SUSPENDED: "bg-danger",
  CANCELLED: "bg-danger"
};

/** A single flat card holding several inline stats separated by hairlines. */
function MetricStrip({ items }) {
  return (
    <Card compact className="grid grid-cols-2 divide-y divide-border sm:flex sm:divide-x sm:divide-y-0">
      {items.map((it, i) => (
        <div key={i} className="flex-1 px-4 py-3 sm:py-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{it.label}</p>
          <p className={"mt-1 text-lg font-bold tracking-tight " + (it.accent ? "text-brand" : "text-text")}>{it.value}</p>
          {it.hint && <p className="mt-0.5 text-[11px] text-muted">{it.hint}</p>}
        </div>
      ))}
    </Card>
  );
}

/** Label + helper text on the left, a control on the right, hairline-divided. */
function SettingRow({ title, description, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

/** Small pill segmented control. */
function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-semibold">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              "rounded-md px-3 py-1.5 transition-colors " +
              (active ? "bg-surface text-text ring-1 ring-border" : "text-muted hover:text-text")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function TenantDetailView({ tenant, onBack, onStatusChanged }) {
  const [statusBusy, setStatusBusy] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [purchaseFlagBusy, setPurchaseFlagBusy] = useState(false);

  const togglePurchaseFlag = async (value) => {
    setPurchaseFlagBusy(true);
    try {
      await superApi(`/super-admin/tenants/${tenant.id}`, { method: "PATCH", body: { canPurchaseNumbers: value } });
      notifySuccess(value ? "This workspace can now buy its own numbers." : "This workspace can no longer buy its own numbers.");
      onStatusChanged();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setPurchaseFlagBusy(false);
    }
  };

  const [featureFlagBusy, setFeatureFlagBusy] = useState(null); // "autoDialer" | "tollFree" | null
  const toggleFeatureFlag = async (key, bodyKey, value, onLabel, offLabel) => {
    setFeatureFlagBusy(key);
    try {
      await superApi(`/super-admin/tenants/${tenant.id}`, { method: "PATCH", body: { [bodyKey]: value } });
      notifySuccess(value ? onLabel : offLabel);
      onStatusChanged();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setFeatureFlagBusy(null);
    }
  };
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

  const mrr = Number(tenant.price_per_user || 0) * Number(tenant.active_users || 0);
  const featureRows = [
    {
      key: "autoDialer",
      bodyKey: "canUseAutoDialer",
      title: "Auto Dialer",
      description: "Outbound campaigns, contact upload, assignment and locking.",
      checked: Boolean(tenant.can_use_auto_dialer),
      on: "Auto Dialer is now enabled for this workspace.",
      off: "Auto Dialer is now disabled for this workspace."
    },
    {
      key: "tollFree",
      bodyKey: "canUseTollFree",
      title: "Toll-Free",
      description: "Inbound toll-free numbers, queue campaigns and the data-driven IVR.",
      checked: Boolean(tenant.can_use_toll_free),
      on: "Toll-Free is now enabled for this workspace.",
      off: "Toll-Free is now disabled for this workspace."
    },
    {
      key: "leads",
      bodyKey: "canUseLeads",
      title: "Lead Management",
      description: "Persistent leads, follow-ups dashboard and the end-call capture popup.",
      checked: Boolean(tenant.can_use_leads),
      on: "Lead Management is now enabled for this workspace.",
      off: "Lead Management is now disabled for this workspace."
    }
  ];
  const routingAssigned = Boolean(tenant.commio_routing_profile_id);

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ArrowLeft size={15} /> Back to setups
      </button>

      {/* Identity + primary controls */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Setup detail</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">{tenant.name}</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-medium text-text">{tenant.workspace}</span> · {tenant.plan_name || "Custom plan"} ·
            extensions from {tenant.extension_start}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" icon={Settings2} onClick={() => setEditOpen(true)}>
            Edit limits
          </Button>
          <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setResetPasswordOpen(true)}>
            Reset password
          </Button>
          <div className="flex items-center gap-2">
            <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + (STATUS_DOT[tenant.status] || "bg-muted")} />
            <div className="w-40">
              <Select
                options={STATUS_OPTIONS}
                value={STATUS_OPTIONS.find((o) => o.value === tenant.status)}
                onChange={(o) => changeStatus(o.value)}
                isDisabled={statusBusy}
              />
            </div>
          </div>
        </div>
      </div>

      <MetricStrip
        items={[
          {
            label: "Seats",
            value: `${tenant.active_users || 0} / ${tenant.max_users ?? "∞"}`,
            hint: tenant.max_users ? `${Math.max(0, tenant.max_users - (tenant.active_users || 0))} free` : "unlimited"
          },
          { label: "Price / user", value: `$${Number(tenant.price_per_user || 0).toFixed(2)}` },
          { label: "Monthly recurring", value: `$${mrr.toFixed(2)}`, hint: "price × active seats" },
          {
            label: "Commio cost",
            value: `$${Number(cost?.totalCost || 0).toFixed(2)}`,
            hint: formatMonthLabel(month),
            accent: true
          }
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Setup limits"
          description="Seat and monthly-minute ceilings for this workspace — independent of the pricing-plan template."
          actions={
            <Button size="sm" variant="secondary" icon={Settings2} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          }
        >
          <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border">
            {[
              ["Max users", tenant.max_users ?? "∞"],
              ["Outbound min / mo", tenant.outbound_minutes ?? "∞"],
              ["Inbound min / mo", tenant.inbound_minutes ?? "∞"]
            ].map(([label, val]) => (
              <div key={label} className="px-4 py-3">
                <p className="text-[11px] text-muted">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-text">{val}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Feature access"
          description="Whole features on or off for this workspace, on top of what its own roles allow."
        >
          <div className="divide-y divide-border">
            {featureRows.map((f) => (
              <SettingRow key={f.key} title={f.title} description={f.description}>
                <Toggle
                  checked={f.checked}
                  onChange={(v) => toggleFeatureFlag(f.key, f.bodyKey, v, f.on, f.off)}
                  disabled={featureFlagBusy === f.key}
                  label={`${f.title} ${f.checked ? "enabled" : "disabled"}`}
                />
              </SettingRow>
            ))}
          </div>
        </Card>

        <Card
          title="Phone numbers"
          description="Whether this workspace buys its own numbers — and a way to hand it one regardless."
        >
          <div className="divide-y divide-border">
            <SettingRow
              title="Self-service purchasing"
              description="Let this workspace search and buy Commio numbers on its own."
            >
              <Toggle
                checked={Boolean(tenant.can_purchase_numbers)}
                onChange={togglePurchaseFlag}
                disabled={purchaseFlagBusy}
                label="Workspace can buy its own phone numbers"
              />
            </SettingRow>
            <SettingRow
              title="Hand over a number"
              description="Buy one on the Commio account and assign it straight to this workspace."
            >
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => setBuyOpen(true)}>
                Buy number
              </Button>
            </SettingRow>
          </div>
        </Card>

        <Card
          title="Commio incoming routing profile"
          description="DIDs this setup buys land on this profile. Each setup gets its own — routing changes never cross tenants."
        >
          <div className="flex flex-col gap-4">
            <div
              className={
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium " +
                (routingAssigned
                  ? "border-success/25 bg-success-soft text-success"
                  : "border-warning/25 bg-warning-soft text-warning")
              }
            >
              <Route size={14} className="shrink-0" />
              {routingAssigned
                ? `Assigned — ${tenant.commio_routing_profile_name || "Unnamed"} (#${tenant.commio_routing_profile_id})`
                : "No routing profile assigned yet"}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={routingMode}
                onChange={setRoutingMode}
                options={[
                  { value: "new", label: "Create new" },
                  { value: "existing", label: "Use existing" }
                ]}
              />
              {routingMode === "existing" && (
                <div className="w-56">
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
                {routingAssigned ? "Replace" : "Assign"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Actual Commio cost"
        description="Real per-number outbound call cost from Commio's CDR API, plus each number's known purchase cost."
        icon={CircleDollarSign}
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-1 py-1">
            <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => setMonth((m) => shiftMonth(m, -1))} />
            <span className="min-w-[110px] text-center text-xs font-semibold text-text">{formatMonthLabel(month)}</span>
            <Button
              size="sm"
              variant="ghost"
              icon={ChevronRight}
              disabled={month === currentMonth}
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
            />
          </div>
        }
      >
        {costError && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{costError}</div>
        )}
        {costLoading ? (
          <SkeletonTable rows={3} cols={4} />
        ) : (
          <>
            <div className="mb-5 grid grid-cols-3 divide-x divide-border rounded-lg border border-border">
              {[
                ["Outbound calls", Number(cost?.outboundCost || 0), false],
                ["Number purchases", Number(cost?.flatDidCost || 0), false],
                ["Total", Number(cost?.totalCost || 0), true]
              ].map(([label, val, accent]) => (
                <div key={label} className="px-4 py-3">
                  <p className="text-[11px] text-muted">{label}</p>
                  <p className={"mt-1 text-lg font-bold tabular-nums " + (accent ? "text-brand" : "text-text")}>
                    ${val.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            {(cost?.byNumber || []).length ? (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <th className="px-2 pb-2.5">Number</th>
                      <th className="px-2 pb-2.5">Calls</th>
                      <th className="px-2 pb-2.5">Outbound cost</th>
                      <th className="px-2 pb-2.5">Purchase cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cost.byNumber.map((row) => (
                      <tr key={row.number} className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2">
                        <td className="px-2 py-2.5 font-medium text-text">{row.number}</td>
                        <td className="px-2 py-2.5 tabular-nums text-muted">{row.calls ?? "—"}</td>
                        <td className="px-2 py-2.5 tabular-nums text-muted">
                          {row.outboundCost !== null ? `$${Number(row.outboundCost).toFixed(2)}` : row.error || "—"}
                        </td>
                        <td className="px-2 py-2.5 tabular-nums text-muted">${Number(row.purchaseCost || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted">
                No numbers on this setup for {formatMonthLabel(month)}.
              </p>
            )}
          </>
        )}
      </Card>

      <BuyForTenantModal
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        tenantId={tenant.id}
        onPurchased={onStatusChanged}
      />

      <EditSetupModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        tenant={tenant}
        onUpdated={onStatusChanged}
      />

      <ResetOwnerPasswordModal
        open={resetPasswordOpen}
        onClose={() => setResetPasswordOpen(false)}
        tenant={tenant}
      />
    </div>
  );
}
