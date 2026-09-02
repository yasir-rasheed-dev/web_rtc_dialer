import { useCallback, useEffect, useState } from "react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonCards } from "../../components/ui/Skeleton";
import { api } from "../../lib/api";

function shiftMonth(monthStr, delta) {
  const [year, month] = monthStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

// Just the total consumed — the plan's assigned/limit figure isn't shown
// here per feedback, so this is a plain used-minutes readout, not a
// progress-toward-limit bar.
function UsageBar({ label, used }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-text">{used.toLocaleString()} min</span>
    </div>
  );
}

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

  const usage = payload?.usage || {};
  const limits = payload?.limits || {};
  const seatBill = Number(payload?.estimatedSeatRevenue || 0);
  const isCurrentMonth = month === currentMonth;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="SUBSCRIPTION USAGE"
        title="Usage & Billing"
        description={payload?.planName ? `Plan: ${payload.planName}` : "Minutes, seats and monthly billing for this workspace."}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-2 py-1.5">
            <Button size="sm" variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              ←
            </Button>
            <span className="min-w-[130px] text-center text-sm font-semibold text-text">{formatMonthLabel(month)}</span>
            <Button size="sm" variant="ghost" disabled={isCurrentMonth} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              →
            </Button>
          </div>
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {loading ? (
        <SkeletonCards count={4} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Active seats</p>
              <p className="mt-1 text-2xl font-bold text-text">{payload?.activeUsers || 0}</p>
              <p className="mt-1 text-xs text-muted">Limit {limits.maxUsers ?? "Unlimited"} · owner excluded</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Price per user</p>
              <p className="mt-1 text-2xl font-bold text-text">${Number(payload?.pricePerUser || 0).toFixed(2)}</p>
              <p className="mt-1 text-xs text-muted">per month</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Calls this month</p>
              <p className="mt-1 text-2xl font-bold text-text">{usage.calls || 0}</p>
              <p className="mt-1 text-xs text-muted">{formatMonthLabel(month)}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-brand">Total bill</p>
              <p className="mt-1 text-2xl font-bold text-brand">${seatBill.toFixed(2)}</p>
              <p className="mt-1 text-xs text-muted">{payload?.activeUsers || 0} seats × ${Number(payload?.pricePerUser || 0).toFixed(2)}</p>
            </Card>
          </div>

          <Card title="Minutes usage" description="Included in your plan for this billing month">
            <div className="flex flex-col gap-4">
              <UsageBar label="Outbound minutes" used={usage.outboundMinutes || 0} />
              <UsageBar label="Inbound minutes" used={usage.inboundMinutes || 0} />
            </div>
          </Card>

          <Card title="Monthly bill breakdown" description={formatMonthLabel(month)}>
            <div className="flex flex-col divide-y divide-border text-sm">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted">Seats ({payload?.activeUsers || 0} × ${Number(payload?.pricePerUser || 0).toFixed(2)})</span>
                <span className="font-semibold text-text">${seatBill.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-base font-bold">
                <span className="text-text">Total</span>
                <span className="text-brand">${seatBill.toFixed(2)}</span>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
