import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleDollarSign } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";
import { superApi } from "../../lib/api";
import { STATUS_OPTIONS, DESTRUCTIVE_STATUSES } from "./shared";

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
