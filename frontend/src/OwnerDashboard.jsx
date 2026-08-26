import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CirclePause,
  Clock3,
  Headphones,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RefreshCw,
  Signal,
  UserCheck,
  UserRoundCheck,
  UserRoundX,
  Voicemail
} from "lucide-react";

import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import DatePicker from "./components/ui/DatePicker";
import EmptyState from "./components/ui/EmptyState";
import PageHeader from "./components/ui/PageHeader";
import Select from "./components/ui/Select";
import { SkeletonCards } from "./components/ui/Skeleton";
import StatusBadge from "./components/ui/StatusBadge";
import { api } from "./lib/api";

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function liveDuration(startedAt, now) {
  if (!startedAt) return "0:00";
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

const STAT_TONES = {
  blue: "bg-brand/10 text-brand",
  green: "bg-success-soft text-success",
  purple: "bg-violet-500/10 text-violet-500",
  orange: "bg-warning-soft text-warning",
  slate: "bg-surface-3 text-muted"
};

function StatCard({ label, value, detail, icon: Icon, tone = "blue" }) {
  return (
    <Card animate={false} className="group flex items-start gap-3.5 !p-4 transition-colors hover:border-border-strong">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${
          STAT_TONES[tone] || STAT_TONES.blue
        }`}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-text">{Number(value || 0)}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>
      </div>
    </Card>
  );
}

function SectionCaption({ eyebrow, title, note }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <span className="text-[11px] font-extrabold tracking-[0.16em] text-brand">{eyebrow}</span>
        <h2 className="mt-1 text-lg font-bold text-text">{title}</h2>
      </div>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

export default function OwnerDashboard({ tenant, user, amiConnected, socketLiveCalls = [] }) {
  const initialDate = todayValue();
  const [filters, setFilters] = useState({ from: initialDate, to: initialDate, agentId: "" });
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: filters.from, to: filters.to });
      if (filters.agentId) query.set("agentId", filters.agentId);
      setPayload(await api(`/dashboard/owner?${query.toString()}`));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to, filters.agentId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      load();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const agentMap = useMemo(() => new Map((payload?.agents || []).map((agent) => [agent.id, agent])), [payload?.agents]);
  const fallbackMap = useMemo(
    () => new Map((payload?.agents || []).map((agent) => [agent.sipUsername, agent])),
    [payload?.agents]
  );
  const baseLiveCalls = socketLiveCalls.length ? socketLiveCalls : payload?.liveCalls || [];
  const liveCalls = baseLiveCalls.filter((call) => !filters.agentId || call.agentUserId === filters.agentId);
  const status = payload?.agentStatus || {};
  const metrics = payload?.callMetrics || {};

  const agentOptions = [
    { value: "", label: "All agents" },
    ...(payload?.agents || []).map((agent) => ({
      value: agent.id,
      label: agent.extension ? `${agent.name} · ${agent.extension}` : agent.name
    }))
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="TENANT OWNER CONTROL CENTER"
        title={`${tenant?.name || "Workspace"} overview`}
        description={`${user?.name} · management view without a SIP seat`}
        actions={
          <>
            <StatusBadge tone={amiConnected ? "success" : "danger"} icon={Signal}>
              AMI {amiConnected ? "connected" : "offline"}
            </StatusBadge>
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>
              Refresh
            </Button>
          </>
        }
      />

      <Card animate={false}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end lg:grid-cols-[repeat(3,minmax(0,220px))_1fr]">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            From
            <DatePicker value={filters.from} onChange={(value) => setFilters({ ...filters, from: value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            To
            <DatePicker value={filters.to} onChange={(value) => setFilters({ ...filters, to: value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Agent
            <Select
              options={agentOptions}
              value={agentOptions.find((option) => option.value === filters.agentId) || agentOptions[0]}
              onChange={(option) => setFilters({ ...filters, agentId: option.value })}
            />
          </label>
          <div className="flex items-center gap-2 sm:justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1.5 text-xs font-medium text-muted">
              <Clock3 size={14} />
              {filters.from === filters.to ? filters.from : `${filters.from} → ${filters.to}`}
            </span>
          </div>
        </div>
      </Card>

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {!payload && !error ? (
        <SkeletonCards count={5} />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <SectionCaption eyebrow="AGENT AVAILABILITY" title="Current agent status" note={`${status.total || 0} tracked agents`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Ready" value={status.ready} detail="Available for calls" icon={UserRoundCheck} tone="green" />
              <StatCard label="Active" value={status.active} detail="Working / signed in" icon={UserCheck} />
              <StatCard label="Inactive" value={status.inactive} detail="Offline or disabled" icon={UserRoundX} tone="slate" />
              <StatCard label="On call" value={status.onCall} detail="Ringing or connected" icon={Headphones} tone="purple" />
              <StatCard label="Paused" value={status.paused} detail="Temporarily unavailable" icon={CirclePause} tone="orange" />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionCaption eyebrow="CALL ACTIVITY" title="Call outcomes" note="Filtered by date and agent" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              <StatCard label="Dialed" value={metrics.dialed} detail="Outbound attempts" icon={PhoneOutgoing} />
              <StatCard label="Missed" value={metrics.missed} detail="Unanswered inbound" icon={PhoneMissed} tone="orange" />
              <StatCard label="Voicemails" value={metrics.voicemails} detail="Marked voicemail" icon={Voicemail} tone="purple" />
              <StatCard label="Connected" value={metrics.connected} detail="Answered calls" icon={PhoneCall} tone="green" />
              <StatCard label="Not connected" value={metrics.not_connected} detail="Unanswered outbound" icon={Activity} tone="slate" />
              <StatCard label="Inbound" value={metrics.inbound} detail="Incoming calls" icon={PhoneIncoming} />
              <StatCard label="Outbound" value={metrics.outbound} detail="Outgoing calls" icon={PhoneOutgoing} tone="purple" />
            </div>
          </div>
        </>
      )}

      <Card
        title="Live calls"
        description="Real-time calls across this workspace. Monitoring actions are not shown here."
        actions={<StatusBadge tone="danger">{liveCalls.length} LIVE</StatusBadge>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Agent</th>
                <th className="pb-2 pr-4">Teams</th>
                <th className="pb-2 pr-4">Direction</th>
                <th className="pb-2 pr-4">From</th>
                <th className="pb-2 pr-4">To</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Duration</th>
                <th className="pb-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {liveCalls.map((call) => {
                const agent = agentMap.get(call.agentUserId) || fallbackMap.get(call.agent);
                const teams = call.teamNames?.length ? call.teamNames : agent?.teamNames || [];
                return (
                  <tr key={call.linkedid} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text">{call.agentName || agent?.name || call.agent || "Unassigned"}</p>
                      <p className="text-xs text-muted">{agent?.extension || call.agentExtension || ""}</p>
                    </td>
                    <td className="py-3 pr-4 text-muted">{teams.length ? teams.join(", ") : "—"}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone="brand">{call.direction}</StatusBadge>
                    </td>
                    <td className="py-3 pr-4 text-muted">{call.from || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{call.to || "—"}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone="success">{call.status}</StatusBadge>
                    </td>
                    <td className="py-3 pr-4 text-muted">{liveDuration(call.startedAt, now)}</td>
                    <td className="py-3 text-muted">{formatDate(call.startedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!liveCalls.length && <EmptyState title="No live calls right now" />}
        </div>
      </Card>
    </div>
  );
}
