// SIP engine — runs inside the MV3 offscreen document (the only extension
// context that can hold a persistent WebRTC connection + getUserMedia).
// Bundled with sip.js into ../offscreen.bundle.js by build.mjs.
//
// Talks to the side panel over chrome.runtime messaging:
//   in : { type: "sip:connect" | "sip:call" | "sip:hangup" | "sip:answer"
//              | "sip:mute" | "sip:unmute" | "sip:hold" | "sip:unhold"
//              | "sip:dtmf" | "sip:disconnect", ... }
//   out: { type: "sip:event", event, data }

import { SimpleUser } from "sip.js/lib/platform/web";

const remoteAudio = document.getElementById("remoteAudio");
document.getElementById("keepAlive")?.play().catch(() => {});

let user = null;
let cfg = null;

function emit(event, data) {
  chrome.runtime.sendMessage({ type: "sip:event", event, data }).catch(() => {});
}

function normalize(v) {
  return String(v || "").replace(/[^\d+*#]/g, "");
}
function destination(number) {
  const n = normalize(number);
  if (!/^\+?[0-9*#]{2,32}$/.test(n)) throw new Error("Invalid number");
  return `sip:${n}@${cfg.domain}`;
}

function remoteIdentity() {
  const id = user?.session?.remoteIdentity;
  return { displayName: id?.displayName || "", number: id?.uri?.user || "" };
}

async function connect(config) {
  cfg = config;
  if (user) {
    try { await user.disconnect(); } catch {}
    user = null;
  }

  user = new SimpleUser(config.wssUrl, {
    aor: `sip:${config.username}@${config.domain}`,
    media: { constraints: { audio: true, video: false }, remote: { audio: remoteAudio } },
    reconnectionAttempts: 8,
    reconnectionDelay: 4,
    registererOptions: { expires: 300, refreshFrequency: 75 },
    sendDTMFUsingSessionDescriptionHandler: true,
    userAgentOptions: {
      authorizationUsername: config.username,
      authorizationPassword: config.password,
      displayName: config.displayName || config.username,
      logBuiltinEnabled: false,
      sessionDescriptionHandlerFactoryOptions: { iceGatheringTimeout: 500 }
    },
    delegate: {
      onServerConnect: () => emit("server:connect"),
      onServerDisconnect: (e) => emit("server:disconnect", { error: String(e || "") }),
      onRegistered: () => emit("registered"),
      onUnregistered: () => emit("unregistered"),
      onCallCreated: () => emit("call:created", remoteIdentity()),
      onCallReceived: () => emit("call:received", remoteIdentity()),
      onCallAnswered: () => emit("call:answered", remoteIdentity()),
      onCallHangup: () => emit("call:hangup"),
      onCallHold: (held) => emit("call:hold", { held })
    }
  });

  await user.connect();
  await user.register({
    requestDelegate: {
      onAccept: () => emit("registration:accepted"),
      onReject: (r) => emit("registration:rejected", { reason: r?.message?.reasonPhrase || "rejected" })
    }
  });
}

async function handle(msg) {
  switch (msg.type) {
    case "sip:connect":
      await connect(msg.config);
      break;
    case "sip:disconnect":
      if (user) { try { await user.unregister(); } catch {} try { await user.disconnect(); } catch {} }
      user = null;
      emit("disconnected");
      break;
    case "sip:call":
      emit("call:trying");
      await user.call(destination(msg.number), {}, {
        requestDelegate: {
          onProgress: () => emit("call:progress"),
          onReject: (r) => emit("call:rejected", { reason: r?.message?.reasonPhrase || "rejected" })
        }
      });
      break;
    case "sip:answer": await user.answer(); break;
    case "sip:hangup":
      try { await user.hangup(); } catch { try { await user.decline(); } catch {} }
      break;
    case "sip:mute": user.mute(); emit("muted", { muted: true }); break;
    case "sip:unmute": user.unmute(); emit("muted", { muted: false }); break;
    case "sip:hold": await user.hold(); break;
    case "sip:unhold": await user.unhold(); break;
    case "sip:dtmf": await user.sendDTMF(String(msg.tone)); break;
    default: break;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("sip:")) return;
  handle(msg).catch((e) => emit("error", { message: e?.message || String(e), for: msg.type }));
});

emit("engine:ready");
