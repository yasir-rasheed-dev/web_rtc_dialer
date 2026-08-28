import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, BarChart3, Clock3, PhoneCall, ShieldCheck, Signal } from "lucide-react";

import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonCards } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { api } from "../../lib/api";

function formatSeconds(value = 0) {
  const seconds = Number(value) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function Dashboard({ user, tenant, liveCalls, amiConnected }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/reports/kpis?days=7").then(setReport).catch((e) => setError(e.message));
  }, []);

  const summary = report?.summary || {};
  const maximum = Math.max(1, ...(report?.daily || []).map((row) => Number(row.calls)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={tenant?.name || "WORKSPACE"}
        title={`Good day, ${user.name.split(" ")[0]}`}
        description={`${tenant?.workspace || ""} · ${user.roleName}`}
        actions={
          <StatusBadge tone={amiConnected ? "success" : "danger"} icon={Signal}>
            AMI {amiConnected ? "connected" : "offline"}
          </StatusBadge>
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {!report && !error ? (
        <SkeletonCards />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total calls" value={summary.total_calls || 0} detail="Last 7 days" icon={PhoneCall} />
          <KpiCard
            label="Completed"
            value={summary.completed_calls || 0}
            detail={`${summary.answer_rate || 0}% answer rate`}
            icon={ShieldCheck}
            tone="green"
          />
          <KpiCard
            label="Average talk"
            value={formatSeconds(summary.avg_talk_sec)}
            detail="Connected calls"
            icon={Clock3}
            tone="purple"
          />
          <KpiCard label="Live now" value={liveCalls.length} detail="Visible to your role" icon={Activity} tone="orange" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Call volume" description="Daily activity for the last 7 days" icon={BarChart3}>
          {report?.daily?.length ? (
            <div className="flex h-[180px] items-end gap-3">
              {report.daily.map((row) => (
                <div key={row.day} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-muted">{row.calls}</span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: Math.max(8, (Number(row.calls) / maximum) * 140) }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full rounded-t-md bg-gradient-to-t from-brand to-brand/70"
                  />
                  <span className="text-[11px] text-muted">
                    {new Date(row.day).toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No call data yet" />
          )}
        </Card>

        <Card
          title="Live activity"
          description="Tenant-isolated Asterisk channels"
          actions={<StatusBadge tone="danger">LIVE</StatusBadge>}
        >
          <div className="flex flex-col gap-3">
            {liveCalls.slice(0, 6).map((call) => (
              <div key={call.linkedid} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-bold text-text">
                  {(call.agent || "?").slice(-2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{call.agent || "Unassigned"}</p>
                  <p className="truncate text-xs text-muted">
                    {call.from} → {call.to}
                  </p>
                </div>
                <StatusBadge tone="success">{call.status}</StatusBadge>
              </div>
            ))}
            {!liveCalls.length && <EmptyState title="No active calls" />}
          </div>
        </Card>
      </div>
    </div>
  );
}
