import { useMemo } from "react";
import { Building2, DollarSign, RefreshCw, Users, Wallet } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import { BarChart, CHART_COLORS, DonutChart, HBarList } from "../../components/ui/Charts";

const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const FEATURE_FLAGS = [
  { key: "can_use_auto_dialer", label: "Auto Dialer" },
  { key: "can_use_toll_free", label: "Toll-Free" },
  { key: "can_use_leads", label: "Leads" },
  { key: "can_purchase_numbers", label: "Buy Numbers" }
];

export default function OverviewPage({ summary = {}, tenants = [], loading, onReload }) {
  const derived = useMemo(() => {
    const rows = tenants.map((t) => {
      const seats = Number(t.active_users || t.users || 0);
      const mrr = Number(t.price_per_user || 0) * seats;
      return { ...t, seats, mrr };
    });
    const mrrTotal = rows.reduce((s, r) => s + r.mrr, 0);
    const seatTotal = rows.reduce((s, r) => s + r.seats, 0);

    const statusData = [
      { label: "Active", value: Number(summary.activeTenants || 0), color: CHART_COLORS.green },
      { label: "Trial", value: Number(summary.trialTenants || 0), color: CHART_COLORS.blue },
      { label: "Inactive", value: Number(summary.inactiveTenants || 0), color: CHART_COLORS.muted },
      { label: "Suspended", value: Number(summary.suspendedTenants || 0), color: CHART_COLORS.red }
    ].filter((d) => d.value > 0);

    const seatBars = [...rows]
      .filter((r) => (r.max_users ?? 0) > 0 || r.seats > 0)
      .sort((a, b) => b.seats - a.seats)
      .slice(0, 6)
      .map((r) => ({ label: r.name, value: r.seats, max: r.max_users ?? 0 }));

    const mrrBars = [...rows]
      .filter((r) => r.mrr > 0)
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 6)
      .map((r) => ({ label: r.name, value: Math.round(r.mrr) }));

    const featureBars = FEATURE_FLAGS.map((f) => ({
      label: f.label,
      value: rows.filter((r) => Number(r[f.key]) === 1).length,
      max: rows.length,
      color: CHART_COLORS.accent
    }));

    return { rows, mrrTotal, seatTotal, statusData, seatBars, mrrBars, featureBars };
  }, [tenants, summary]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="GLOBAL OPERATIONS"
        title="Overview"
        description="Every workspace at a glance — status mix, seat load, recurring revenue and feature spread."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={onReload}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Setups"
          value={summary.totalTenants || 0}
          detail={`${summary.activeTenants || 0} active · ${summary.trialTenants || 0} trial`}
          icon={Building2}
          tone="blue"
        />
        <KpiCard
          label="Active Seats"
          value={summary.activeUsers || 0}
          detail={`of ${summary.totalUsers || 0} provisioned`}
          icon={Users}
          tone="green"
        />
        <KpiCard
          label="Monthly Recurring"
          value={money(derived.mrrTotal)}
          detail="price/user × active seats"
          icon={DollarSign}
          tone="orange"
        />
        <KpiCard
          label="Carrier Cost (MTD)"
          value={`$${Number(summary.carrierCost || 0).toFixed(2)}`}
          detail="current calendar month"
          icon={Wallet}
          tone="neutral"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Workspace status" description="Distribution across all setups">
          {derived.statusData.length ? (
            <DonutChart data={derived.statusData} centerValue={summary.totalTenants || 0} centerLabel="setups" />
          ) : (
            <p className="py-8 text-center text-xs text-muted">No setups yet</p>
          )}
        </Card>

        <Card title="Feature adoption" description={`Enabled workspaces out of ${derived.rows.length || 0}`}>
          <HBarList items={derived.featureBars} emptyLabel="No setups yet" />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Seat load" description="Active users vs plan capacity — orange means over capacity">
          <HBarList items={derived.seatBars} unit="seats" emptyLabel="No seats provisioned" />
        </Card>

        <Card title="Recurring revenue by workspace" description="Top setups by monthly value">
          <BarChart data={derived.mrrBars} color={CHART_COLORS.blue} valueFormat={money} />
        </Card>
      </div>
    </div>
  );
}
