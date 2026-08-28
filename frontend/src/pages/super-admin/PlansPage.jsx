import { useState } from "react";
import { Plus } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { CreatePlanModal } from "./modals";

export default function PlansPage({ plans, loading, onReload }) {
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
