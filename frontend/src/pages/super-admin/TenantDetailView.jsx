import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleDollarSign, Phone, Plus, Search } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Toggle from "../../components/ui/Toggle";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";
import {
  completeCommioOrderForTenant,
  reserveCommioNumberForTenant,
  searchCommioNumbersAsSuperAdmin,
  superApi
} from "../../lib/api";
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

export default function TenantDetailView({ tenant, onBack, onStatusChanged }) {
  const [statusBusy, setStatusBusy] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
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

      <Card
        title="Phone numbers"
        description="Whether this workspace can search and buy its own numbers, and a way to hand them one directly regardless."
        icon={Phone}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-text">
            <Toggle
              checked={Boolean(tenant.can_purchase_numbers)}
              onChange={togglePurchaseFlag}
              disabled={purchaseFlagBusy}
              label="Workspace can buy its own phone numbers"
            />
            Workspace can buy its own phone numbers
          </label>
          <Button icon={Plus} onClick={() => setBuyOpen(true)}>
            Buy number for this tenant
          </Button>
        </div>
      </Card>

      <Card title="Feature access" description="Turn whole features on or off for this workspace, on top of whatever roles inside it are permitted.">
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-text">
            <Toggle
              checked={Boolean(tenant.can_use_auto_dialer)}
              onChange={(v) =>
                toggleFeatureFlag(
                  "autoDialer",
                  "canUseAutoDialer",
                  v,
                  "Auto Dialer is now enabled for this workspace.",
                  "Auto Dialer is now disabled for this workspace."
                )
              }
              disabled={featureFlagBusy === "autoDialer"}
              label="Auto Dialer enabled"
            />
            Auto Dialer
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-text">
            <Toggle
              checked={Boolean(tenant.can_use_toll_free)}
              onChange={(v) =>
                toggleFeatureFlag(
                  "tollFree",
                  "canUseTollFree",
                  v,
                  "Toll-Free is now enabled for this workspace.",
                  "Toll-Free is now disabled for this workspace."
                )
              }
              disabled={featureFlagBusy === "tollFree"}
              label="Toll-Free enabled"
            />
            Toll-Free
          </label>
        </div>
      </Card>

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

      <BuyForTenantModal
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        tenantId={tenant.id}
        onPurchased={onStatusChanged}
      />
    </div>
  );
}
