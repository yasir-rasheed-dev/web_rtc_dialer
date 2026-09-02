import { useCallback, useEffect, useMemo, useState } from "react";
import { DollarSign, PhoneCall, Users, Wallet } from "lucide-react";

import Card from "../../components/ui/Card";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import { CHART_COLORS, HBarList } from "../../components/ui/Charts";
import { SkeletonCards } from "../../components/ui/Skeleton";
import { api } from "../../lib/api";

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function UsagePage() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback((targetMonth) => {
    setLoading(true);
    setError("");
    return api(`/usage?month=${targetMonth}`)
      .then(setPayload)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  const monthOptions = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      out.push({ value, label: formatMonthLabel(value) });
    }
    return out;
  }, []);

  const usage = payload?.usage || {};
  const limits = payload?.limits || {};
  const seats = payload?.activeUsers || 0;
  const pricePerUser = Number(payload?.pricePerUser || 0);
  const seatBill = Number(payload?.estimatedSeatRevenue || 0);

  const outMin = Number(usage.outboundMinutes || 0);
  const inMin = Number(usage.inboundMinutes || 0);
  const usageBars = [
    { label: "Outbound minutes", value: outMin, color: CHART_COLORS.blue },
    { label: "Inbound minutes", value: inMin, color: CHART_COLORS.accent }
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="SUBSCRIPTION USAGE"
        title="Usage & Billing"
        description={
          payload?.planName ? `Plan: ${payload.planName}` : "Minutes, seats and monthly billing for this workspace."
        }
        actions={
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
                {o.value === currentMonth ? " (current)" : ""}
              </option>
            ))}
          </select>
        }
      />

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <SkeletonCards count={4} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Active seats"
              value={seats}
              detail={`Limit ${limits.maxUsers ?? "∞"} · owner excluded`}
              icon={Users}
              tone="blue"
            />
            <KpiCard label="Price per user" value={money(pricePerUser)} detail="per month" icon={DollarSign} tone="neutral" />
            <KpiCard
              label="Calls this month"
              value={(usage.calls || 0).toLocaleString()}
              detail={formatMonthLabel(month)}
              icon={PhoneCall}
              tone="purple"
            />
            <KpiCard
              label="Total bill"
              value={money(seatBill)}
              detail={`${seats} seat${seats === 1 ? "" : "s"} × ${money(pricePerUser)}`}
              icon={Wallet}
              tone="green"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card title="Usage this month" description={`What this workspace consumed — ${formatMonthLabel(month)}`}>
              <HBarList items={usageBars} unit="min" emptyLabel="No calls this month" />
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Total calls</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-text">{(usage.calls || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Total minutes</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-text">{(outMin + inMin).toLocaleString()} min</p>
                </div>
              </div>
            </Card>

            <Card title="Monthly bill" description={formatMonthLabel(month)}>
              <div className="flex flex-col divide-y divide-border text-sm">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-muted">
                    Seats ({seats} × {money(pricePerUser)})
                  </span>
                  <span className="font-semibold tabular-nums text-text">{money(seatBill)}</span>
                </div>
                <div className="flex items-center justify-between py-3 text-base font-bold">
                  <span className="text-text">Total</span>
                  <span className="tabular-nums text-brand">{money(seatBill)}</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Seat-based billing only — call minutes included in the plan are not metered here.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
