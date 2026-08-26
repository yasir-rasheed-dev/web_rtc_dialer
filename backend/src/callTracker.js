import path from "node:path";
import { db } from "./db.js";

function cleanChannel(channel = "") {
  return channel.replace(/-[0-9a-f]+$/i, "");
}

function endpointFromChannel(channel = "") {
  const match = String(channel || "").match(/^PJSIP\/([^/-]+)-/i);
  return match?.[1] || null;
}

function normalizeNumber(value = "") {
  return String(value || "").replace(/[^0-9+]/g, "");
}

function publicCall(call) {
  return {
    linkedid: call.linkedid,
    tenantId: call.tenantId || null,
    agentUserId: call.agentUserId || null,
    agent: call.agent,
    agentName: call.agentName || null,
    agentExtension: call.agentExtension,
    teamName: call.teamName || null,
    teamIds: Array.isArray(call.teamIds) ? call.teamIds : [],
    teamNames: Array.isArray(call.teamNames) ? call.teamNames : [],
    direction: call.direction,
    from: call.from,
    to: call.to,
    status: call.status,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    channels: [...call.channels]
  };
}

export class CallTracker {
  constructor(io, recordingRoot) {
    this.io = io;
    this.recordingRoot = path.resolve(recordingRoot);
    this.calls = new Map();
    this.presence = new Map();
  }

  list(tenantId = null) {
    return [...this.calls.values()]
      .filter((call) => !tenantId || call.tenantId === tenantId)
      .map(publicCall);
  }

  listPresence(tenantId = null) {
    return [...this.presence.values()].filter((item) => !tenantId || item.tenantId === tenantId);
  }

  find(linkedid) {
    return this.calls.get(linkedid);
  }

  findByAgent(agent) {
    if (!agent) return null;
    return [...this.calls.values()]
      .filter((call) => call.agent === agent && call.channels?.size > 0)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] || null;
  }

  #emitTeamEvent(agentRecord, eventName, payload) {
    if (!agentRecord?.tenant_id) return;
    const teamIds = Array.isArray(agentRecord.team_ids) ? agentRecord.team_ids : [];
    for (const teamId of teamIds) {
      this.io.to(`tenant:${agentRecord.tenant_id}:team:${teamId}`).emit(eventName, payload);
    }
    if (agentRecord.team_name) {
      this.io.to(`tenant:${agentRecord.tenant_id}:team:${agentRecord.team_name}`).emit(eventName, payload);
    }
  }

  #emitCallTeamEvent(call, eventName, payload) {
    if (!call?.tenantId) return;
    for (const teamId of Array.isArray(call.teamIds) ? call.teamIds : []) {
      this.io.to(`tenant:${call.tenantId}:team:${teamId}`).emit(eventName, payload);
    }
    if (call.teamName) {
      this.io.to(`tenant:${call.tenantId}:team:${call.teamName}`).emit(eventName, payload);
    }
  }

  #applyAgent(call, endpoint, agentRecord) {
    if (!call || !agentRecord) return;
    call.agent = endpoint;
    call.agentUserId = agentRecord.id || call.agentUserId || null;
    call.agentName = agentRecord.name || call.agentName || null;
    call.tenantId = agentRecord.tenant_id || call.tenantId;
    call.teamName = agentRecord.team_name || call.teamName;
    call.teamIds = Array.isArray(agentRecord.team_ids) ? agentRecord.team_ids : (call.teamIds || []);
    call.teamNames = Array.isArray(agentRecord.team_names) ? agentRecord.team_names : (call.teamNames || []);
    call.agentExtension = agentRecord.extension || call.agentExtension;
  }

  async handle(event) {
    const linkedid = event.Linkedid || event.Uniqueid;

    if (event.Event === "ContactStatus") {
      const endpoint = event.AOR || event.EndpointName || "unknown";
      const agentRecord = await this.#resolveAgent(endpoint);
      if (!agentRecord) return;
      const presence = {
        tenantId: agentRecord.tenant_id,
        userId: agentRecord.id,
        name: agentRecord.name || null,
        agent: endpoint,
        extension: agentRecord.extension || null,
        teamIds: agentRecord.team_ids || [],
        teamNames: agentRecord.team_names || [],
        status: /Reachable|Created|Updated/i.test(event.ContactStatus || "") ? "ONLINE" : "OFFLINE",
        uri: event.URI || "",
        rtt: Number(event.RoundtripUsec || 0) / 1000,
        updatedAt: new Date().toISOString()
      };
      this.presence.set(`${agentRecord.tenant_id}:${endpoint}`, presence);
      this.io.to(`tenant:${agentRecord.tenant_id}:live`).emit("presence:update", presence);
      this.#emitTeamEvent(agentRecord, "presence:update", presence);
      return;
    }

    if (!linkedid || !event.Event) return;
    let call = this.calls.get(linkedid);

    if (event.Event === "Newchannel") {
      const endpoint = endpointFromChannel(event.Channel);
      const agentRecord = endpoint ? await this.#resolveAgent(endpoint) : null;
      const tenantId = agentRecord?.tenant_id || await this.#resolveTenantByDid(event.Exten);
      call ||= {
        linkedid,
        uniqueid: event.Uniqueid,
        tenantId: tenantId || null,
        agentUserId: agentRecord?.id || null,
        agent: agentRecord ? endpoint : null,
        agentName: agentRecord?.name || null,
        agentExtension: agentRecord?.extension || event.CallerIDNum || "",
        teamName: agentRecord?.team_name || null,
        teamIds: agentRecord?.team_ids || [],
        teamNames: agentRecord?.team_names || [],
        direction: agentRecord ? "OUTBOUND" : "INBOUND",
        from: event.CallerIDNum || "",
        to: event.Exten || "",
        status: "STARTING",
        startedAt: new Date().toISOString(),
        answeredAt: null,
        channels: new Set(),
        recordingPath: null
      };
      if (agentRecord) this.#applyAgent(call, endpoint, agentRecord);
      call.channels.add(event.Channel);
      this.calls.set(linkedid, call);
      await this.#upsert(call, event);
    }

    if (!call) return;
    if (event.Channel) call.channels.add(event.Channel);

    const detectedEndpoint = endpointFromChannel(event.Channel || event.DestChannel);
    const detectedAgent = detectedEndpoint ? await this.#resolveAgent(detectedEndpoint) : null;
    if (detectedAgent) this.#applyAgent(call, detectedEndpoint, detectedAgent);

    if (!call.tenantId) {
      call.tenantId = await this.#resolveTenantByDid(call.to || event.Exten);
    }

    if (event.Event === "DialBegin") {
      call.status = "RINGING";
      if (call.direction !== "INBOUND" || !call.to || call.to === "s") {
        call.to = event.DestCallerIDNum || event.DialString || call.to;
      }
    } else if (event.Event === "VarSet" && event.Variable === "RN_INBOUND_DID") {
      const inboundDid = normalizeNumber(event.Value || "");
      if (inboundDid) {
        call.direction = "INBOUND";
        call.to = inboundDid;
        call.tenantId ||= await this.#resolveTenantByDid(inboundDid);
      }
    } else if (event.Event === "BridgeEnter" || (event.Event === "Newstate" && event.ChannelStateDesc === "Up")) {
      call.status = "ANSWERED";
      call.answeredAt ||= new Date().toISOString();
    } else if (event.Event === "Hold") {
      call.status = "HELD";
    } else if (event.Event === "Unhold") {
      call.status = "ANSWERED";
    } else if (event.Event === "MixMonitorStart" || (event.Event === "VarSet" && event.Variable === "RECORDING_FILE")) {
      const recording = event.File || event.Filename || event.Value || null;
      if (recording) {
        call.recordingPath = path.isAbsolute(recording) ? recording : path.join(this.recordingRoot, recording);
      }
    } else if (event.Event === "Hangup") {
      call.channels.delete(event.Channel);
      call.status = event.Cause === "16" ? "COMPLETED" : "FAILED";
      call.endedAt = new Date().toISOString();
      call.hangupCause = event["Cause-txt"] || event.Cause || "";
    }

    await this.#event(call, event);
    await this.#upsert(call, event);
    const visibleCall = publicCall(call);

    if (call.tenantId) {
      this.io.to(`tenant:${call.tenantId}:live`).emit("call:update", visibleCall);
      this.#emitCallTeamEvent(call, "call:update", visibleCall);
    }

    if (event.Event === "Hangup" && call.channels.size === 0) {
      this.calls.delete(linkedid);
      if (call.tenantId) {
        this.io.to(`tenant:${call.tenantId}:live`).emit("call:ended", visibleCall);
        this.#emitCallTeamEvent(call, "call:ended", visibleCall);
      }
    }
  }

  async #resolveAgent(endpoint) {
    if (!endpoint) return null;
    const [rows] = await db.execute(
      `SELECT id,tenant_id,name,role_id,team_name,extension
         FROM users WHERE sip_username=? LIMIT 1`,
      [endpoint]
    );
    const agent = rows[0];
    if (!agent) return null;

    try {
      const [teams] = await db.execute(
        `SELECT t.id,t.name
           FROM team_members tm
           JOIN teams t ON t.id=tm.team_id AND t.tenant_id=tm.tenant_id
          WHERE tm.tenant_id=? AND tm.user_id=? AND tm.active=1 AND t.active=1
          ORDER BY t.name ASC`,
        [agent.tenant_id, agent.id]
      );
      agent.team_ids = teams.map((team) => team.id);
      agent.team_names = teams.map((team) => team.name);
    } catch {
      agent.team_ids = [];
      agent.team_names = agent.team_name ? [agent.team_name] : [];
    }
    return agent;
  }

  async #resolveTenantByDid(number) {
    const normalized = normalizeNumber(number);
    if (!normalized) return null;
    const candidates = [...new Set([normalized, normalized.replace(/^\+/, ""), `+${normalized.replace(/^\+/, "")}`])];
    const [rows] = await db.query(
      `SELECT tenant_id FROM tenant_dids WHERE number IN (${candidates.map(() => "?").join(",")}) AND status <> 'DISABLED' LIMIT 1`,
      candidates
    );
    return rows[0]?.tenant_id || null;
  }

  async #upsert(call, event) {
    const agentRecord = await this.#resolveAgent(call.agent);
    const agentId = agentRecord?.id || call.agentUserId || null;
    if (agentRecord) this.#applyAgent(call, call.agent, agentRecord);
    const startedAt = new Date(call.startedAt);
    const answeredAt = call.answeredAt ? new Date(call.answeredAt) : null;
    const endedAt = call.endedAt ? new Date(call.endedAt) : null;
    const duration = endedAt ? Math.max(0, Math.floor((endedAt - startedAt) / 1000)) : 0;
    const billable = endedAt && answeredAt ? Math.max(0, Math.floor((endedAt - answeredAt) / 1000)) : 0;
    let recordingName = null;
    if (call.recordingPath) {
      const resolved = path.resolve(call.recordingPath);
      if (resolved.startsWith(`${this.recordingRoot}${path.sep}`)) recordingName = path.basename(resolved);
    }

    await db.execute(
      `INSERT INTO calls
        (tenant_id, linkedid, uniqueid, agent_user_id, agent_sip_username, direction, from_number, to_number,
         status, started_at, answered_at, ended_at, duration_sec, billable_sec, hangup_cause,
         recording_path, recording_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tenant_id=COALESCE(VALUES(tenant_id), tenant_id),
         agent_user_id=COALESCE(VALUES(agent_user_id), agent_user_id),
         agent_sip_username=COALESCE(VALUES(agent_sip_username), agent_sip_username),
         from_number=VALUES(from_number), to_number=VALUES(to_number), status=VALUES(status),
         answered_at=COALESCE(VALUES(answered_at), answered_at), ended_at=VALUES(ended_at),
         duration_sec=VALUES(duration_sec), billable_sec=VALUES(billable_sec),
         hangup_cause=VALUES(hangup_cause),
         recording_path=COALESCE(VALUES(recording_path), recording_path),
         recording_name=COALESCE(VALUES(recording_name), recording_name)`,
      [
        call.tenantId,
        call.linkedid,
        call.uniqueid || event.Uniqueid || null,
        agentId,
        call.agent,
        call.direction,
        call.from,
        call.to,
        call.status,
        startedAt,
        answeredAt,
        endedAt,
        duration,
        billable,
        call.hangupCause || null,
        call.recordingPath,
        recordingName
      ]
    );
  }

  async #event(call, event) {
    await db.execute(
      `INSERT INTO call_events (tenant_id, linkedid, uniqueid, event_name, channel_name, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [call.tenantId, call.linkedid, event.Uniqueid || null, event.Event, cleanChannel(event.Channel), JSON.stringify(event)]
    );
  }
}
