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

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import DatePicker from "../../components/ui/DatePicker";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import { SkeletonCards } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAgentOptions } from "../calls/shared";
import { api } from "../../lib/api";
import { formatInWorkspaceTz } from "../../lib/tz";

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

const formatDate = (value) => formatInWorkspaceTz(value);

function liveDuration(startedAt, now) {
  if (!startedAt) return "0:00";
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function SectionCaption({ eyebrow, title, note }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">{eyebrow}</span>
        <h2 className="mt-1 text-base font-bold tracking-tight text-text">{title}</h2>
      </div>
      {note && <span className="shrink-0 text-xs text-muted">{note}</span>}
    </div>
  );
}

export default function OwnerDashboard({ tenant, user, amiConnected, socketLiveCalls = [], liveAgentStatus = {} }) {
  const initialDate = todayValue();
  const [filters, setFilters] = useState({ from: initialDate, to: initialDate, agentId: "" });
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Unfiltered agent roster for the filter dropdown — deliberately NOT
  // derived from payload.agents, which the backend narrows to the selected
  // agent (that's what made the dropdown collapse to one option after a
  // pick, then repopulate on "All agents").
  const rosterAgents = useAgentOptions();
  const agentOptions = useMemo(
    () => [
      { value: "", label: "All agents" },
      ...rosterAgents.map((a) => ({ value: a.id, label: a.extension ? `${a.name} · ${a.extension}` : a.name }))
    ],
    [rosterAgents]
  );

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
    const interval = window.setInterval(() => load(), 15000);
    return () => window.clearInterval(interval);
  }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const baseLiveCalls = socketLiveCalls.length ? socketLiveCalls : payload?.liveCalls || [];
  const liveCalls = baseLiveCalls.filter((call) => !filters.agentId || call.agentUserId === filters.agentId);

  const agents = useMemo(() => {
    const list = payload?.agents || [];
    return list.map((agent) => {
      const onCall = baseLiveCalls.some(
        (call) => call.agentUserId === agent.id && ["RINGING", "ANSWERED", "HELD"].includes(call.status)
      );
      const status = onCall ? "ON_CALL" : liveAgentStatus[agent.id] || agent.status;
      return { ...agent, status };
    });
  }, [payload?.agents, baseLiveCalls, liveAgentStatus]);

  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const fallbackMap = useMemo(() => new Map(agents.map((agent) => [agent.sipUsername, agent])), [agents]);

  const status = useMemo(
    () => ({
      total: agents.length,
      ready: agents.filter((a) => a.active && a.status === "READY").length,
      active: agents.filter((a) => a.active && a.status !== "OFFLINE").length,
      inactive: agents.filter((a) => !a.active || a.status === "OFFLINE").length,
      onCall: agents.filter((a) => a.status === "ON_CALL").length,
      paused: agents.filter((a) => a.active && a.status === "PAUSED").length
    }),
    [agents]
  );
  const metrics = payload?.callMetrics || {};
  const num = (v) => Number(v || 0);

  return (
    <div className="flex flex-col gap-5">
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

      <Card animate={false} compact>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-[160px] flex-col gap-1.5 text-xs font-medium text-muted">
            From
            <DatePicker value={filters.from} onChange={(value) => setFilters((f) => ({ ...f, from: value }))} />
          </label>
          <label className="flex w-[160px] flex-col gap-1.5 text-xs font-medium text-muted">
            To
            <DatePicker value={filters.to} onChange={(value) => setFilters((f) => ({ ...f, to: value }))} />
          </label>
          <label className="flex w-[220px] flex-col gap-1.5 text-xs font-medium text-muted">
            Agent
            <Select
              options={agentOptions}
              value={agentOptions.find((o) => o.value === filters.agentId) || agentOptions[0]}
              onChange={(o) => setFilters((f) => ({ ...f, agentId: o?.value || "" }))}
            />
          </label>
          <span className="ml-auto inline-flex h-10 items-center gap-1.5 self-end rounded-lg border border-border bg-surface-2 px-3 text-xs font-medium text-muted">
            <Clock3 size={14} />
            {filters.from === filters.to ? filters.from : `${filters.from} → ${filters.to}`}
          </span>
        </div>
      </Card>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!payload && !error ? (
        <SkeletonCards count={5} />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <SectionCaption
              eyebrow="Agent availability"
              title="Current agent status"
              note={`${status.total || 0} tracked agents`}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard label="Ready" value={num(status.ready)} detail="Available for calls" icon={UserRoundCheck} tone="green" />
              <KpiCard label="Active" value={num(status.active)} detail="Working / signed in" icon={UserCheck} tone="blue" />
              <KpiCard label="Inactive" value={num(status.inactive)} detail="Offline or disabled" icon={UserRoundX} tone="neutral" />
              <KpiCard label="On call" value={num(status.onCall)} detail="Ringing or connected" icon={Headphones} tone="purple" />
              <KpiCard label="Paused" value={num(status.paused)} detail="Temporarily unavailable" icon={CirclePause} tone="orange" />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <SectionCaption eyebrow="Call activity" title="Call outcomes" note="Filtered by date and agent" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              <KpiCard label="Dialed" value={num(metrics.dialed)} detail="Outbound attempts" icon={PhoneOutgoing} tone="blue" />
              <KpiCard label="Connected" value={num(metrics.connected)} detail="Answered calls" icon={PhoneCall} tone="green" />
              <KpiCard label="Missed" value={num(metrics.missed)} detail="Unanswered inbound" icon={PhoneMissed} tone="orange" />
              <KpiCard label="Voicemails" value={num(metrics.voicemails)} detail="Marked voicemail" icon={Voicemail} tone="purple" />
              <KpiCard label="Not connected" value={num(metrics.not_connected)} detail="Unanswered outbound" icon={Activity} tone="neutral" />
              <KpiCard label="Inbound" value={num(metrics.inbound)} detail="Incoming calls" icon={PhoneIncoming} tone="blue" />
              <KpiCard label="Outbound" value={num(metrics.outbound)} detail="Outgoing calls" icon={PhoneOutgoing} tone="purple" />
            </div>
          </div>
        </>
      )}

      <Card
        title="Live calls"
        description="Real-time calls across this workspace. Monitoring actions are not shown here."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-0.5 text-[11px] font-semibold text-danger">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
            {liveCalls.length} live
          </span>
        }
      >
        {liveCalls.length ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="h-10 px-4 text-left font-semibold">Agent</th>
                    <th className="h-10 px-4 text-left font-semibold">Teams</th>
                    <th className="h-10 px-4 text-left font-semibold">Direction</th>
                    <th className="h-10 px-4 text-left font-semibold">From → To</th>
                    <th className="h-10 px-4 text-left font-semibold">Status</th>
                    <th className="h-10 px-4 text-left font-semibold">Duration</th>
                    <th className="h-10 px-4 text-left font-semibold">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {liveCalls.map((call) => {
                    const agent = agentMap.get(call.agentUserId) || fallbackMap.get(call.agent);
                    const teams = call.teamNames?.length ? call.teamNames : agent?.teamNames || [];
                    const agentName = call.agentName || agent?.name || call.agent || "Unassigned";
                    const outbound = call.direction === "OUTBOUND";
                    return (
                      <tr key={call.linkedid} className="border-t border-border transition-colors hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                              {agentName.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-text">{agentName}</span>
                              {(agent?.extension || call.agentExtension) && (
                                <span className="block text-[11px] text-muted">
                                  Ext {agent?.extension || call.agentExtension}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted">{teams.length ? teams.join(", ") : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={"inline-flex items-center gap-1.5 font-medium " + (outbound ? "text-brand" : "text-accent")}>
                            {outbound ? <PhoneOutgoing size={14} /> : <PhoneIncoming size={14} />}
                            {outbound ? "Outbound" : "Inbound"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted">
                          {call.from || "—"} <span className="text-muted/50">→</span> {call.to || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" /> {call.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-success">
                          {liveDuration(call.startedAt, now)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(call.startedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState title="No live calls right now" />
        )}
      </Card>
    </div>
  );
}
