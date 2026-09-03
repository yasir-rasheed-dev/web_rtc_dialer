import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "./db.js";

// Reads just the RIFF/fmt/data chunk headers (not the whole file) to
// compute a WAV's duration — voicemails have no answered_at/ended_at
// pair like a regular call does to derive billable_sec from, so the
// audio file itself is the only source of truth for how long one is.
// Scans chunks properly (rather than assuming a fixed 44-byte header)
// since a WAV can carry extra chunks before 'data'; returns 0 (never
// throws) for anything that doesn't parse as a canonical PCM WAV.
function wavDurationSeconds(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") return 0;

      let offset = 12;
      let sampleRate = 0;
      let channels = 0;
      let bitsPerSample = 0;
      let dataSize = 0;
      const chunkHeader = Buffer.alloc(8);
      // A handful of chunks at most in a Record()-produced WAV — bounded
      // loop as a defensive cap either way.
      for (let i = 0; i < 20; i++) {
        const read = fs.readSync(fd, chunkHeader, 0, 8, offset);
        if (read < 8) break;
        const chunkId = chunkHeader.toString("ascii", 0, 4);
        const chunkSize = chunkHeader.readUInt32LE(4);
        if (chunkId === "fmt ") {
          const fmt = Buffer.alloc(16);
          fs.readSync(fd, fmt, 0, 16, offset + 8);
          channels = fmt.readUInt16LE(2);
          sampleRate = fmt.readUInt32LE(4);
          bitsPerSample = fmt.readUInt16LE(14);
        } else if (chunkId === "data") {
          dataSize = chunkSize;
          break;
        }
        offset += 8 + chunkSize + (chunkSize % 2);
      }

      if (!sampleRate || !channels || !bitsPerSample || !dataSize) return 0;
      const byteRate = sampleRate * channels * (bitsPerSample / 8);
      return byteRate ? Math.round(dataSize / byteRate) : 0;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return 0;
  }
}

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
    channels: [...call.channels],
    participants: participantList(call)
  };
}

// Everyone who was actually on the call — the attributed agent plus any
// warm-transfer targets / PSTN parties added later. Supervisor monitoring
// legs never reach here (their events are dropped upstream).
function participantList(call) {
  return call.participants instanceof Map ? [...call.participants.values()] : [];
}

function participantKey(participant) {
  return participant.userId ? `u:${participant.userId}` : `n:${participant.number || participant.name || ""}`;
}

export class CallTracker {
  constructor(io, recordingRoot, applyAgentStatus = null, voicemailRoot = null) {
    this.io = io;
    this.recordingRoot = path.resolve(recordingRoot);
    // Separate spool from recordingRoot — see config.js's voicemailRoot.
    // Falls back to recordingRoot only so a caller that doesn't pass one
    // (e.g. a test harness) doesn't crash path.resolve(null).
    this.voicemailRoot = path.resolve(voicemailRoot || recordingRoot);
    this.calls = new Map();
    this.presence = new Map();
    // Uniqueids (and later, resolved channel names) of supervisor
    // listen/whisper/barge legs. These are ChanSpy Originate()s the
    // /api/supervisor/monitor route pre-registers here with a known
    // ChannelId — they are NOT calls, so every AMI event for them is
    // dropped: no `calls` row, no `call_events` row, no live-call emit.
    // monitorChannelId -> { linkedid, channelName } ; channelName -> monitorChannelId
    this.monitorChannelIds = new Map();
    this.monitorChannelNames = new Map();
    // linkedid -> Set(monitorChannelId) so a call's monitor legs can be
    // torn down the moment the call ends (barge keeps the agent channel
    // alive otherwise, and the board would never clear).
    this.monitorsByCall = new Map();
    // server.js sets this to (channel) => ami.action({Action:"Hangup", Channel:channel})
    this.hangupChannel = null;
    // Warm-transfer / conference legs the tracker should fold into an
    // EXISTING call as a participant instead of logging as their own call.
    // channelId -> { linkedid, participant }. Registered by
    // /api/calls/conference/invite-agent and invite-pstn.
    this.participantLegs = new Map();
    this.participantLegChannels = new Set();
    // Optional — server.js passes its applyAgentStatus(tenantId, userId,
    // sipUsername, status) helper here so an agent's status auto-flips to
    // ON_CALL the moment they're actually bridged (inbound or outbound —
    // whichever direction resolved agentUserId), and back to READY once
    // that call ends. Kept optional (rather than a hard dependency) so
    // this class stays testable/usable without the full server.js wiring.
    this.applyAgentStatus = applyAgentStatus;
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

  // Called by /api/supervisor/monitor right before it fires the ChanSpy
  // Originate, passing the same value it hands Asterisk as `ChannelId`.
  // From then on the tracker recognises that channel's events and ignores
  // them entirely, so a supervisor listening/whispering/barging never
  // shows up as a call in the logs or the live dashboard.
  registerMonitorChannel(channelId, linkedid = null) {
    if (!channelId) return;
    this.monitorChannelIds.set(channelId, { linkedid, channelName: null });
    if (linkedid) {
      if (!this.monitorsByCall.has(linkedid)) this.monitorsByCall.set(linkedid, new Set());
      this.monitorsByCall.get(linkedid).add(channelId);
    }
    // Safety GC — if we somehow never see this channel's Hangup, don't leak.
    const timer = setTimeout(() => this.#forgetMonitor(channelId), 4 * 60 * 60 * 1000);
    timer.unref?.();
  }

  #forgetMonitor(channelId) {
    const entry = this.monitorChannelIds.get(channelId);
    if (!entry) return;
    if (entry.channelName) this.monitorChannelNames.delete(entry.channelName);
    if (entry.linkedid && this.monitorsByCall.has(entry.linkedid)) {
      this.monitorsByCall.get(entry.linkedid).delete(channelId);
      if (!this.monitorsByCall.get(entry.linkedid).size) this.monitorsByCall.delete(entry.linkedid);
    }
    this.monitorChannelIds.delete(channelId);
  }

  // Hangs up every supervisor monitor leg attached to this call. Called
  // when the call's non-agent leg drops (or the call fully ends) so barge/
  // listen never keeps the board row alive.
  #dropMonitorsForCall(linkedid) {
    const set = this.monitorsByCall.get(linkedid);
    if (!set || !set.size) return;
    for (const channelId of [...set]) {
      const entry = this.monitorChannelIds.get(channelId);
      const name = entry?.channelName;
      if (name && typeof this.hangupChannel === "function") {
        try { this.hangupChannel(name); } catch (e) { console.error("[callTracker] monitor hangup failed:", e.message); }
      }
      this.#forgetMonitor(channelId);
    }
  }

  #isMonitorEvent(event) {
    const id = event.Uniqueid || event.Linkedid;
    const byId = id ? this.monitorChannelIds.get(id) : null;
    const monitorId = byId ? id : (event.Channel ? this.monitorChannelNames.get(event.Channel) : null);
    if (!byId && !monitorId) return false;
    const key = byId ? id : monitorId;
    const entry = this.monitorChannelIds.get(key);
    if (entry && event.Channel && !entry.channelName) {
      entry.channelName = event.Channel;
      this.monitorChannelNames.set(event.Channel, key);
    }
    if (event.Event === "Hangup") this.#forgetMonitor(key);
    return true;
  }

  // Called by the warm-transfer / add-participant routes right before they
  // Originate the new leg, with the same value passed to Asterisk as
  // `ChannelId`. That leg then never becomes its own call log — instead
  // the person/number is folded into the existing call's participant list.
  registerParticipantLeg(channelId, linkedid, participant) {
    if (!channelId || !linkedid || !participant) return;
    this.participantLegs.set(channelId, { linkedid, participant });
    const call = this.calls.get(linkedid);
    if (call) {
      this.#addParticipant(call, participant);
      this.#upsert(call, {}).catch(() => undefined);
      const visible = publicCall(call);
      if (call.tenantId) {
        this.io.to(`tenant:${call.tenantId}:live`).emit("call:update", visible);
        this.#emitCallTeamEvent(call, "call:update", visible);
      }
    }
    const timer = setTimeout(() => this.participantLegs.delete(channelId), 4 * 60 * 60 * 1000);
    timer.unref?.();
  }

  #addParticipant(call, participant) {
    if (!call || !participant) return;
    call.participants ||= new Map();
    const key = participantKey(participant);
    if (!call.participants.has(key)) {
      call.participants.set(key, {
        type: participant.type || (participant.userId ? "agent" : "pstn"),
        userId: participant.userId || null,
        name: participant.name || null,
        extension: participant.extension || null,
        number: participant.number || null
      });
    }
  }

  // A participant leg's own AMI events (Newchannel/Newstate/Hangup/…) must
  // not spawn or mutate a `calls` row of their own. On the first event we
  // fold the person into the target call; every event for that channel is
  // then swallowed.
  #isParticipantLegEvent(event) {
    const id = event.Uniqueid || event.Linkedid;
    const leg = (id && this.participantLegs.get(id)) || null;
    if (!leg && !(event.Channel && this.participantLegChannels.has(event.Channel))) return false;
    if (event.Channel) this.participantLegChannels.add(event.Channel);
    if (leg) {
      const call = this.calls.get(leg.linkedid);
      if (call) {
        this.#addParticipant(call, leg.participant);
        this.#upsert(call, event).catch(() => undefined);
        const visible = publicCall(call);
        if (call.tenantId) {
          this.io.to(`tenant:${call.tenantId}:live`).emit("call:update", visible);
          this.#emitCallTeamEvent(call, "call:update", visible);
        }
      }
    }
    if (event.Event === "Hangup") {
      if (event.Channel) this.participantLegChannels.delete(event.Channel);
      if (id) this.participantLegs.delete(id);
    }
    return true;
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
    this.#addParticipant(call, {
      type: "agent",
      userId: agentRecord.id || null,
      name: agentRecord.name || null,
      extension: agentRecord.extension || null
    });
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

    // Supervisor monitoring legs (listen/whisper/barge) are not calls —
    // drop every event for them before any tracking/persistence happens.
    if (this.#isMonitorEvent(event)) return;

    // Warm-transfer / add-participant legs fold into an existing call's
    // participant list rather than becoming a call of their own.
    if (this.#isParticipantLegEvent(event)) return;

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
      // Optional hook (server.js): a new call for this agent ends any
      // pending "old device" hand-off grace.
      if (agentRecord?.id) this.onAgentCallStarted?.(agentRecord.id, linkedid);
    }

    if (!call) return;
    if (event.Channel) call.channels.add(event.Channel);

    // For a Queue()-routed call (toll-free campaigns ringing multiple
    // agents), every candidate's channel generates its own events on this
    // same linkedid — including the ones who never answer. Once the call
    // has actually been answered, only let further updates through for the
    // endpoint that's already attributed as the agent; otherwise a losing
    // candidate's later Hangup (e.g. they declined a few seconds after the
    // winner answered) would stomp call.agent back to the wrong person.
    // Before answer, any detected candidate is fair game (useful to show
    // "ringing <agent>" for the single-agent-dial case).
    const detectedEndpoint = endpointFromChannel(event.Channel || event.DestChannel);
    const detectedAgent = detectedEndpoint ? await this.#resolveAgent(detectedEndpoint) : null;
    const alreadyAnswered = call.status === "ANSWERED" || call.status === "HELD" || Boolean(call.answeredAt);
    if (detectedAgent && (!alreadyAnswered || detectedEndpoint === call.agent)) {
      this.#applyAgent(call, detectedEndpoint, detectedAgent);
    } else if (detectedAgent) {
      // A different real agent turning up on an already-answered call is a
      // blind/warm transfer target that rode the same linkedid — keep the
      // call attributed to the original agent (above), but record this
      // person as a participant of the same call log.
      this.#addParticipant(call, {
        type: "agent",
        userId: detectedAgent.id || null,
        name: detectedAgent.name || null,
        extension: detectedAgent.extension || null
      });
    }

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
      const wasAlreadyAnswered = Boolean(call.answeredAt);
      call.status = "ANSWERED";
      call.answeredAt ||= new Date().toISOString();
      // Only on the FIRST answer (BridgeEnter can fire again later, e.g.
      // re-bridging after a transfer) and only for whichever endpoint is
      // actually attributed as the agent — not a losing queue candidate
      // whose own channel happens to reach "Up" transiently.
      if (!wasAlreadyAnswered && call.agentUserId && detectedEndpoint === call.agent && this.applyAgentStatus) {
        call.onCallStatusApplied = true;
        this.applyAgentStatus(call.tenantId, call.agentUserId, call.agent, "ON_CALL").catch((error) =>
          console.error("[callTracker] auto-ON_CALL failed:", error.message)
        );
      }
    } else if (event.Event === "Hold") {
      call.status = "HELD";
    } else if (event.Event === "Unhold") {
      call.status = "ANSWERED";
    } else if (event.Event === "MixMonitorStart" || (event.Event === "VarSet" && event.Variable === "RECORDING_FILE")) {
      const recording = event.File || event.Filename || event.Value || null;
      if (recording) {
        call.recordingPath = path.isAbsolute(recording) ? recording : path.join(this.recordingRoot, recording);
      }
    } else if (event.Event === "VarSet" && event.Variable === "RN_VOICEMAIL_FILE") {
      // Set by the dialplan's [from-commio-route] agent-route branch right
      // after Record() finishes, when a declined/unanswered direct PSTN
      // call to an agent with REDIRECT_TO_VOICEMAIL falls through to
      // voicemail instead of a plain hangup — see
      // backend/asterisk/toll-free-routing-snippet.conf. Never fires for
      // the toll-free queue path, by design.
      const vm = event.Value || null;
      if (vm && call.tenantId && call.agentUserId) {
        const resolved = path.resolve(path.isAbsolute(vm) ? vm : path.join(this.voicemailRoot, vm));
        if (resolved.startsWith(`${this.voicemailRoot}${path.sep}`)) {
          await this.#saveVoicemail(call, resolved);
        }
      }
    } else if (event.Event === "Hangup") {
      const hungEndpoint = endpointFromChannel(event.Channel);
      call.channels.delete(event.Channel);
      call.status = event.Cause === "16" ? "COMPLETED" : "FAILED";
      call.endedAt = new Date().toISOString();
      call.hangupCause = event["Cause-txt"] || event.Cause || "";
      // The customer / non-agent leg just dropped, or nothing's left —
      // tear down any supervisor monitor legs so barge/listen doesn't hold
      // the agent channel (and this call's row) open.
      if (this.monitorsByCall.has(linkedid) && (call.channels.size === 0 || hungEndpoint !== call.agent)) {
        this.#dropMonitorsForCall(linkedid);
      }
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
      this.#dropMonitorsForCall(linkedid); // belt & braces
      if (call.tenantId) {
        this.io.to(`tenant:${call.tenantId}:live`).emit("call:ended", visibleCall);
        this.#emitCallTeamEvent(call, "call:ended", visibleCall);
      }
      // Mirror of the auto-ON_CALL transition above — an agent whose
      // status this call itself flipped to ON_CALL becomes available
      // again the instant it's actually over (both legs gone, not just
      // this one channel), not left stuck on ON_CALL for whatever comes
      // next. Doesn't fire for a call that never triggered ON_CALL in the
      // first place (no agent resolved, or applyAgentStatus wasn't wired).
      if (call.onCallStatusApplied && call.agentUserId && this.applyAgentStatus) {
        this.applyAgentStatus(call.tenantId, call.agentUserId, call.agent, "READY").catch((error) =>
          console.error("[callTracker] auto-READY-after-call failed:", error.message)
        );
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

    const participants = participantList(call);
    const participantsJson = participants.length ? JSON.stringify(participants) : "[]";

    await db.execute(
      `INSERT INTO calls
        (tenant_id, linkedid, uniqueid, agent_user_id, agent_sip_username, direction, from_number, to_number,
         status, started_at, answered_at, ended_at, duration_sec, billable_sec, hangup_cause,
         recording_path, recording_name, participants_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tenant_id=COALESCE(VALUES(tenant_id), tenant_id),
         agent_user_id=COALESCE(VALUES(agent_user_id), agent_user_id),
         agent_sip_username=COALESCE(VALUES(agent_sip_username), agent_sip_username),
         from_number=VALUES(from_number), to_number=VALUES(to_number), status=VALUES(status),
         answered_at=COALESCE(VALUES(answered_at), answered_at), ended_at=VALUES(ended_at),
         duration_sec=VALUES(duration_sec), billable_sec=VALUES(billable_sec),
         hangup_cause=VALUES(hangup_cause),
         recording_path=COALESCE(VALUES(recording_path), recording_path),
         recording_name=COALESCE(VALUES(recording_name), recording_name),
         participants_json=COALESCE(NULLIF(VALUES(participants_json), '[]'), participants_json)`,
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
        recordingName,
        participantsJson
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

  async #saveVoicemail(call, filePath) {
    const id = crypto.randomUUID();
    const fileName = path.basename(filePath);
    const durationSec = wavDurationSeconds(filePath);
    await db.execute(
      `INSERT INTO voicemails
        (id, tenant_id, agent_user_id, linkedid, from_number, to_number, file_path, file_name, duration_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, call.tenantId, call.agentUserId, call.linkedid, call.from || "", call.to || "", filePath, fileName, durationSec]
    );
    const payload = {
      id,
      agentUserId: call.agentUserId,
      from: call.from,
      to: call.to,
      createdAt: new Date().toISOString()
    };
    this.io.to(`user:${call.agentUserId}`).emit("voicemail:new", payload);
    if (call.tenantId) this.io.to(`tenant:${call.tenantId}:live`).emit("voicemail:new", payload);
  }
}
