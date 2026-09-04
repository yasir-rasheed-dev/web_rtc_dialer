import { useState } from "react";
import { Clock3, PhoneCall, Radio, RotateCw, Users } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { notifyError, notifySuccess } from "../../lib/toast";
import { api } from "../../lib/api";
import { formatInWorkspaceTz } from "../../lib/tz";

const formatDate = (value) => formatInWorkspaceTz(value);

const AGENT_STATUS_TONE = {
  READY: "success",
  ON_CALL: "brand",
  PAUSED: "warning",
  WRAP_UP: "brand",
  OFFLINE: "neutral"
};

// Agents currently bridged into a call: the live agent leg first, then any
// warm-transfer / add-party agents folded into call.participants by the
// backend. De-duped by userId. Listen/barge/whisper supervisor legs never
// appear here (they are suppressed from participants server-side).
function agentsOnCall(call) {
  const out = [];
  const seen = new Set();
  const push = (id, name, extension) => {
    const key = String(id || name || extension || "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ id: id != null ? String(id) : null, name: name || extension || "Agent", extension: extension || "" });
  };
  if (call.agentUserId || call.agent) push(call.agentUserId, call.agent, call.agentExtension);
  for (const p of call.participants || []) {
    if (p.type === "agent") push(p.userId, p.name, p.extension);
  }
  return out;
}

export default function Supervisor({
  liveCalls,
  presence,
  agents = [],
  liveAgentStatus = {},
  amiConnected,
  permissions,
  onRefreshLive
}) {
  const [busyAction, setBusyAction] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // { call } while the supervisor is choosing which of 2+ agents to whisper to
  const [whisperPick, setWhisperPick] = useState(null);
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

  const doRefresh = async () => {
    if (!onRefreshLive) return;
    setRefreshing(true);
    try {
      await onRefreshLive();
    } finally {
      setRefreshing(false);
    }
  };

  const monitor = async (linkedid, mode, targetAgentId) => {
    setBusyAction(`${linkedid}:${mode}`);
    try {
      const body = { linkedid, mode };
      if (targetAgentId) body.targetAgentId = targetAgentId;
      await api("/supervisor/monitor", { method: "POST", body });
      notifySuccess(`${mode[0].toUpperCase()}${mode.slice(1)} request sent to your SIP phone.`);
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusyAction(null);
    }
  };

  // Whisper needs a specific agent when more than one is on the call —
  // otherwise ChanSpy would attach to whichever leg it matches first. One
  // agent → whisper straight away; 2+ → open the picker.
  const startWhisper = (call) => {
    const onCall = agentsOnCall(call);
    if (onCall.length >= 2) {
      setWhisperPick({ call, agents: onCall });
      return;
    }
    monitor(call.linkedid, "whisper", onCall[0]?.id || undefined);
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

      <Card
        title="Active calls"
        description="Buttons are shown only when the assigned role permits that monitoring mode."
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={RotateCw}
            loading={refreshing}
            onClick={doRefresh}
            title="Refresh live calls"
            aria-label="Refresh live calls"
          >
            Refresh
          </Button>
        }
      >
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
                          onClick={() => startWhisper(call)}
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

      <Modal
        open={Boolean(whisperPick)}
        onClose={() => setWhisperPick(null)}
        title="Whisper to which agent?"
      >
        <p className="mb-4 text-sm text-muted">
          This call has more than one agent. Pick the agent who should hear you — the customer and the
          other agent will not.
        </p>
        <div className="flex flex-col gap-2">
          {(whisperPick?.agents || []).map((a) => (
            <button
              key={a.id || a.name}
              type="button"
              onClick={() => {
                const { call } = whisperPick;
                setWhisperPick(null);
                monitor(call.linkedid, "whisper", a.id || undefined);
              }}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left text-sm text-text hover:border-border-strong hover:bg-surface-2"
            >
              <span className="font-medium">{a.name}</span>
              {a.extension && <span className="text-xs text-muted">Ext. {a.extension}</span>}
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setWhisperPick(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
