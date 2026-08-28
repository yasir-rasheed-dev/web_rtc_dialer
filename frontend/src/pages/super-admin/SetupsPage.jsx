import { useMemo, useState } from "react";
import { Eye, Plus, RefreshCw } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { statusTone } from "./shared";
import { CreateSetupModal } from "./modals";
import TenantDetailView from "./TenantDetailView";

export default function SetupsPage({ plans, tenants, summary, loading, onReload }) {
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
