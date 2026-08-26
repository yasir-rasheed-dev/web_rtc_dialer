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

function UsageBar({ label, used, limit }) {
  const hasLimit = limit !== null && limit !== undefined;
  const pct = hasLimit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = hasLimit && used > limit;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-text">
          {used.toLocaleString()} {hasLimit ? `/ ${Number(limit).toLocaleString()} min` : "min (unlimited)"}
        </span>
      </div>
      {hasLimit && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${over ? "bg-danger" : "bg-brand"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
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
              <p className="text-xs font-medium uppercase tracking-wide text-brand">Estimated bill</p>
              <p className="mt-1 text-2xl font-bold text-brand">${seatBill.toFixed(2)}</p>
              <p className="mt-1 text-xs text-muted">{payload?.activeUsers || 0} seats × ${Number(payload?.pricePerUser || 0).toFixed(2)}</p>
            </Card>
          </div>

          <Card title="Minutes usage" description="Included in your plan for this billing month">
            <div className="flex flex-col gap-4">
              <UsageBar label="Outbound minutes" used={usage.outboundMinutes || 0} limit={limits.outboundMinutes} />
              <UsageBar label="Inbound minutes" used={usage.inboundMinutes || 0} limit={limits.inboundMinutes} />
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

          <Card title="Carrier reconciliation" description="Commio CDR cost rows will populate this view once the account-specific CDR adapter is configured.">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Carrier billable minutes</p>
                <p className="mt-1 text-lg font-semibold text-text">{usage.carrierBillableMinutes || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Carrier cost</p>
                <p className="mt-1 text-lg font-semibold text-text">${Number(usage.carrierCost || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Calls</p>
                <p className="mt-1 text-lg font-semibold text-text">{usage.calls || 0}</p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
