import { useState } from "react";
import { Clock3, PhoneCall, Radio, Users } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { notifyError, notifySuccess } from "../../lib/toast";
import { api } from "../../lib/api";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const AGENT_STATUS_TONE = {
  READY: "success",
  ON_CALL: "brand",
  PAUSED: "warning",
  WRAP_UP: "brand",
  OFFLINE: "neutral"
};

export default function Supervisor({ liveCalls, presence, agents = [], liveAgentStatus = {}, amiConnected, permissions }) {
  const [busyAction, setBusyAction] = useState(null);
  const can = (key) => permissions.includes(key);

  // Real-time roster: on-call beats the explicit "agent:status" push
  // (READY/PAUSED/WRAP_UP/OFFLINE), which beats the value from the last
  // /supervisor/live fetch — same precedence OwnerDashboard uses.
  const roster = agents.map((agent) => {
    const onCall = liveCalls.some(
      (call) => call.agentUserId === agent.id && ["RINGING", "ANSWERED", "HELD"].includes(call.status)
    );
    const status = onCall ? "ON_CALL" : liveAgentStatus[agent.id] || agent.status || "OFFLINE";
    return { ...agent, status };
  });

  const monitor = async (linkedid, mode) => {
    setBusyAction(`${linkedid}:${mode}`);
    try {
      await api("/supervisor/monitor", { method: "POST", body: { linkedid, mode } });
      notifySuccess(`${mode[0].toUpperCase()}${mode.slice(1)} request sent to your SIP phone.`);
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="REAL-TIME FLOOR"
        title="Supervisor dashboard"
        description="Only agents and calls inside this tenant are eligible for monitoring."
        actions={
          <StatusBadge tone={amiConnected ? "success" : "danger"} icon={Radio}>
            {amiConnected ? "Live" : "AMI offline"}
          </StatusBadge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Agents online"
          value={presence.filter((p) => p.status === "ONLINE").length}
          detail={`${presence.length} tracked`}
          icon={Users}
          tone="green"
        />
        <KpiCard label="Live calls" value={liveCalls.length} detail="Right now" icon={PhoneCall} />
        <KpiCard
          label="Ringing"
          value={liveCalls.filter((c) => c.status === "RINGING").length}
          detail="Awaiting answer"
          icon={Clock3}
          tone="orange"
        />
      </div>

      <Card title="Agent status" description="Live status for agents assigned to your teams — updates instantly, no refresh needed.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Agent</th>
                <th className="pb-2 pr-4">Extension</th>
                <th className="pb-2 pr-4">Teams</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((agent) => (
                <tr key={agent.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4 text-text">{agent.name}</td>
                  <td className="py-3 pr-4 text-muted">{agent.extension || "—"}</td>
                  <td className="py-3 pr-4 text-muted">{agent.teamNames?.length ? agent.teamNames.join(", ") : "—"}</td>
                  <td className="py-3">
                    <StatusBadge tone={AGENT_STATUS_TONE[agent.status] || "neutral"}>
                      {agent.status.replace("_", " ")}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!roster.length && <EmptyState title="No agents assigned to your teams yet" />}
        </div>
      </Card>

      <Card title="Active calls" description="Buttons are shown only when the assigned role permits that monitoring mode.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Agent</th>
                <th className="pb-2 pr-4">From</th>
                <th className="pb-2 pr-4">To</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Started</th>
                <th className="pb-2">Supervisor action</th>
              </tr>
            </thead>
            <tbody>
              {liveCalls.map((call) => (
                <tr key={call.linkedid} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4 text-text">{call.agent || "—"}</td>
                  <td className="py-3 pr-4 text-muted">{call.from}</td>
                  <td className="py-3 pr-4 text-muted">{call.to}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge tone="success">{call.status}</StatusBadge>
                  </td>
                  <td className="py-3 pr-4 text-muted">{formatDate(call.startedAt)}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      {can("LISTEN_LIVE_CALLS") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busyAction === `${call.linkedid}:listen`}
                          onClick={() => monitor(call.linkedid, "listen")}
                        >
                          Listen
                        </Button>
                      )}
                      {can("WHISPER_CALLS") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busyAction === `${call.linkedid}:whisper`}
                          onClick={() => monitor(call.linkedid, "whisper")}
                        >
                          Whisper
                        </Button>
                      )}
                      {can("BARGE_CALLS") && (
                        <Button
                          size="sm"
                          variant="danger"
                          loading={busyAction === `${call.linkedid}:barge`}
                          onClick={() => monitor(call.linkedid, "barge")}
                        >
                          Barge
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!liveCalls.length && <EmptyState title="No live calls to monitor" />}
        </div>
      </Card>
    </div>
  );
}
