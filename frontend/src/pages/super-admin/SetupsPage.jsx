import { useMemo, useState } from "react";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";

import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { STATUS_OPTIONS, statusTone } from "./shared";
import { CreateSetupModal } from "./modals";
import TenantDetailView from "./TenantDetailView";

export default function SetupsPage({ plans, tenants, loading, onReload }) {
  const [createOpen, setCreateOpen] = useState(false);
  // Holds just the id, not a snapshot of the tenant object — the detail
  // view below re-derives its `tenant` prop from the live `tenants` array
  // on every render, so a save (routing profile, status, etc.) that
  // triggers onReload() shows up immediately without navigating away and
  // without risking a stale object if the reload hasn't landed yet.
  const [viewingId, setViewingId] = useState(null);
  const viewingTenant = useMemo(() => tenants.find((t) => t.id === viewingId) || null, [tenants, viewingId]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Company",
        sortable: true,
        cellClassName: "text-text",
        cell: (t) => <span className="font-medium">{t.name}</span>
      },
      {
        key: "workspace",
        header: "Workspace",
        sortable: true,
        cell: (t) => <span className="font-mono text-xs">{t.workspace}</span>
      },
      {
        key: "seats",
        header: "Seats",
        align: "right",
        sortable: true,
        sortValue: (t) => Number(t.active_users || t.users || 0),
        cell: (t) => (
          <span className="tabular-nums">
            {t.active_users || t.users || 0}
            <span className="text-muted/70"> / {t.max_users ?? "∞"}</span>
          </span>
        )
      },
      {
        key: "plan_name",
        header: "Plan",
        sortable: true,
        cell: (t) => t.plan_name || "Custom"
      },
      {
        key: "routing",
        header: "Routing profile",
        cell: (t) =>
          t.commio_routing_profile_id ? (
            <StatusBadge tone="success">
              {t.commio_routing_profile_name || `#${t.commio_routing_profile_id}`}
            </StatusBadge>
          ) : (
            <StatusBadge tone="warning">Not assigned</StatusBadge>
          )
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        cell: (t) => <StatusBadge tone={statusTone(t.status)}>{t.status}</StatusBadge>
      },
      {
        key: "chevron",
        header: "",
        align: "right",
        cell: () => <ChevronRight size={16} className="text-muted" />
      }
    ],
    []
  );

  if (viewingTenant) {
    return <TenantDetailView tenant={viewingTenant} onBack={() => setViewingId(null)} onStatusChanged={onReload} />;
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

      <DataTable
        columns={columns}
        data={tenants}
        loading={loading}
        getRowKey={(t) => t.id}
        onRowClick={(t) => setViewingId(t.id)}
        searchKeys={["name", "workspace"]}
        searchPlaceholder="Filter by company or workspace…"
        filters={[
          {
            key: "status",
            label: "All statuses",
            getValue: (t) => t.status,
            options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
          }
        ]}
        initialSort={{ key: "name", dir: "asc" }}
        pageSize={12}
        emptyState={<EmptyState title="No setups match" description="Adjust the filter, or create a new workspace." />}
      />

      <CreateSetupModal open={createOpen} onClose={() => setCreateOpen(false)} plans={plans} tenants={tenants} onCreated={onReload} />
    </div>
  );
}
