import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Plus, Users } from "lucide-react";

import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { PlanModal } from "./modals";

const fmtLimit = (n) => (n == null ? "Unlimited" : Number(n).toLocaleString());

function PlanCard({ plan, onEdit }) {
  const rows = [
    { icon: Users, label: "Users", value: fmtLimit(plan.max_users) },
    { icon: ArrowUpFromLine, label: "Outbound min / mo", value: fmtLimit(plan.outbound_minutes) },
    { icon: ArrowDownToLine, label: "Inbound min / mo", value: fmtLimit(plan.inbound_minutes) }
  ];

  return (
    <div
      className={
        "flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong " +
        (plan.active ? "" : "opacity-60")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{plan.name}</p>
          {plan.code && <p className="font-mono text-xs text-muted">{plan.code}</p>}
        </div>
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
            (plan.active ? "bg-success-soft text-success" : "bg-surface-2 text-muted")
          }
        >
          <span className={"h-1.5 w-1.5 rounded-full " + (plan.active ? "bg-success" : "bg-muted")} />
          {plan.active ? "Active" : "Inactive"}
        </span>
      </div>

      {plan.description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{plan.description}</p>}

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-text">${Number(plan.price_per_user || 0).toFixed(0)}</span>
        <span className="text-xs text-muted">/ user / mo</span>
      </div>

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-xs">
            <r.icon size={14} className="shrink-0 text-muted" />
            <span className="text-muted">{r.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-text">{r.value}</span>
          </div>
        ))}
      </div>

      <Button size="sm" variant="secondary" icon={Pencil} className="mt-4 w-full justify-center" onClick={() => onEdit(plan)}>
        Edit plan
      </Button>
    </div>
  );
}

export default function PlansPage({ plans, loading, onReload }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (plan) => {
    setEditing(plan);
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="PRICING"
        title="Plans"
        description="Reusable templates. Picking one on a setup copies its values — later plan edits don't retro-change existing setups."
        actions={
          <Button icon={Plus} onClick={openCreate}>
            Add Plan
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl border border-border bg-surface-2" />
          ))}
        </div>
      ) : plans.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onEdit={openEdit} />
          ))}
        </div>
      ) : (
        <EmptyState title="No plans yet" description="Add a pricing plan to reuse across setups." />
      )}

      <PlanModal open={modalOpen} plan={editing} onClose={() => setModalOpen(false)} onSaved={onReload} />
    </div>
  );
}
