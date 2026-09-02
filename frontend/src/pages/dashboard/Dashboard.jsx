import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Clock3, PhoneCall, PhoneIncoming, Signal, Users } from "lucide-react";

import Card from "../../components/ui/Card";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonCards } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { api } from "../../lib/api";

function formatSeconds(value = 0) {
  const seconds = Math.round(Number(value) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

// Backend only returns days that actually had calls — pad to a full trailing
// week so the chart always shows 7 columns instead of one lonely bar.
function lastSevenDays(daily = []) {
  const byDay = new Map(daily.map((d) => [String(d.day).slice(0, 10), d]));
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() - i);
    const key = dt.toISOString().slice(0, 10);
    const row = byDay.get(key) || { day: key, calls: 0, completed: 0, talk_sec: 0 };
    out.push({
      key,
      calls: Number(row.calls) || 0,
      completed: Number(row.completed) || 0,
      weekday: dt.toLocaleDateString(undefined, { weekday: "short" })
    });
  }
  return out;
}

const BLUE = "rgb(var(--rn-blue))";
const MISS = "rgb(var(--rn-muted) / 0.35)";

function WeekChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.calls));
  return (
    <div>
      <div className="flex items-stretch gap-2" style={{ height: 172 }}>
        {data.map((d) => {
          const missed = Math.max(0, d.calls - d.completed);
          const barPct = Math.max(d.calls ? 4 : 0, (d.calls / max) * 100);
          return (
            <div key={d.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold tabular-nums text-text">{d.calls || ""}</span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="mx-auto flex w-full max-w-[40px] flex-col overflow-hidden rounded-t-md"
                  style={{ height: `${barPct}%` }}
                >
                  {missed > 0 && <div style={{ flexBasis: `${(missed / d.calls) * 100}%`, background: MISS }} />}
                  <div style={{ flex: 1, background: BLUE }} />
                </div>
              </div>
              <span className="text-[10px] text-muted">{d.weekday}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[3px]" style={{ background: BLUE }} /> Answered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[3px]" style={{ background: MISS }} /> Missed
        </span>
      </div>
    </div>
  );
}

function StatLine({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums text-text">{value}</span>
    </div>
  );
}

export default function Dashboard({ user, tenant, liveCalls, amiConnected }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/reports/kpis?days=7")
      .then(setReport)
      .catch((e) => setError(e.message));
  }, []);

  const summary = report?.summary || {};
  const week = useMemo(() => lastSevenDays(report?.daily), [report]);
  const otherAgents = (report?.agents || []).filter((a) => a.agent && a.agent !== "Unassigned");
  const showLeaderboard = otherAgents.length > 1;
  const answerRate = Number(summary.answer_rate || 0);

  return (
    <div className="flex flex-col gap-5">
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

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!report && !error ? (
        <SkeletonCards />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total calls" value={summary.total_calls || 0} detail="Last 7 days" icon={PhoneCall} />
          <KpiCard
            label="Answered"
            value={summary.completed_calls || 0}
            detail={`${answerRate}% answer rate`}
            icon={PhoneIncoming}
            tone="green"
          />
          <KpiCard
            label="Avg talk time"
            value={formatSeconds(summary.avg_talk_sec)}
            detail={`${formatSeconds(summary.total_talk_sec)} total`}
            icon={Clock3}
            tone="purple"
          />
          <KpiCard
            label="Live now"
            value={liveCalls.length}
            detail={liveCalls.length ? "calls in progress" : "nothing active"}
            icon={Activity}
            tone="orange"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Call volume" description="Answered vs missed, last 7 days" icon={BarChart3}>
          <WeekChart data={week} />
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Live activity" actions={<StatusBadge tone="danger">LIVE</StatusBadge>}>
            {liveCalls.length ? (
              <div className="flex flex-col gap-2.5">
                {liveCalls.slice(0, 6).map((call) => (
                  <div key={call.linkedid} className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-text">
                      {(call.agent || "?").slice(-2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-text">{call.agent || "Unassigned"}</p>
                      <p className="truncate text-[11px] text-muted">
                        {call.from} → {call.to}
                      </p>
                    </div>
                    <StatusBadge tone="success">{call.status}</StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-5 text-center text-xs text-muted">All quiet — no active calls right now.</p>
            )}
          </Card>

          <Card title="This week">
            <div className="flex flex-col gap-3.5">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted">Answer rate</span>
                  <span className="font-semibold tabular-nums text-text">{answerRate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, answerRate)}%` }} />
                </div>
              </div>
              <StatLine label="Missed calls" value={summary.failed_calls || 0} />
              <StatLine label="Talk time" value={formatSeconds(summary.total_talk_sec)} />
              <StatLine label="Avg / call" value={formatSeconds(summary.avg_talk_sec)} />
            </div>
          </Card>

          {showLeaderboard && (
            <Card title="Top agents" description="By call volume" icon={Users}>
              <div className="flex flex-col divide-y divide-border">
                {otherAgents.slice(0, 5).map((a, i) => (
                  <div key={a.agent} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="w-4 text-center text-[11px] font-bold text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{a.agent}</span>
                    <span className="shrink-0 text-[11px] text-muted">{formatSeconds(a.avg_talk_sec)} avg</span>
                    <span className="w-8 shrink-0 text-right text-[13px] font-semibold tabular-nums text-text">
                      {a.calls}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
