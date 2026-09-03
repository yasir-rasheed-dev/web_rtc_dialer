import { api, getSession, setAuth, clearAuth } from "./lib/api.js";

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => { el.hidden = !on; };
let toastT;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200);
}

/* ---- tiny confirm modal ---- */
function confirmModal(message, okText = "Continue") {
  return new Promise((resolve) => {
    const wrap = $("modal");
    $("modal-msg").textContent = message;
    $("modal-ok").textContent = okText;
    wrap.hidden = false;
    const done = (v) => { wrap.hidden = true; $("modal-ok").onclick = null; $("modal-cancel").onclick = null; resolve(v); };
    $("modal-ok").onclick = () => done(true);
    $("modal-cancel").onclick = () => done(false);
  });
}

/* ============================ AUTH ============================ */
let pending2fa = null; // { pendingToken, mode }

async function doLogin(forceLogout = false) {
  if (pending2fa) {
    const code = $("li-code").value.trim();
    const path = pending2fa.mode === "setup" ? "/auth/2fa/setup-confirm" : "/auth/2fa/verify";
    return onAuthed(await api(path, { method: "POST", body: { pendingToken: pending2fa.pendingToken, code } }));
  }
  const workspace = $("li-workspace").value.trim();
  const email = $("li-email").value.trim();
  const password = $("li-password").value;
  const p = await api("/auth/login", { method: "POST", body: { workspace, email, password, forceLogout } });
  if (p.requiresSetup) {
    pending2fa = { pendingToken: p.pendingToken, mode: "setup" };
    $("li-qr").src = p.qr; show($("li-qr-wrap"), true); show($("li-2fa"), true);
    $("li-submit").textContent = "Verify & sign in"; return;
  }
  if (p.requires2fa) {
    pending2fa = { pendingToken: p.pendingToken, mode: "verify" };
    show($("li-2fa"), true); $("li-submit").textContent = "Verify & sign in"; return;
  }
  onAuthed(p);
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("li-submit"); btn.disabled = true;
  show($("li-error"), false);
  try {
    await doLogin(false);
  } catch (err) {
    if (err.code === "SESSION_ACTIVE") {
      const ok = await confirmModal(
        "This account is already signed in on another device or browser. Sign that session out and continue here?",
        "Force sign out & continue"
      );
      if (ok) {
        try { await doLogin(true); }
        catch (e2) { $("li-error").textContent = e2.message || "Sign in failed"; show($("li-error"), true); }
      }
    } else {
      $("li-error").textContent = err.message || "Sign in failed";
      show($("li-error"), true);
    }
  } finally {
    btn.disabled = false;
  }
});

async function onAuthed(p) {
  if (!p?.sip || !p.sip.username) {
    $("li-error").textContent = "This account has no SIP endpoint — only agents can use the dialer.";
    show($("li-error"), true);
    pending2fa = null;
    return;
  }
  await setAuth({ token: p.token, refreshToken: p.refreshToken, session: { user: p.user, sip: p.sip, permissions: p.permissions || [] } });
  try { await chrome.storage.local.set({ rnx_workspace: $("li-workspace").value.trim() }); } catch {}
  pending2fa = null;
  enterMain(p);
}

$("m-logout").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST" }); } catch {}
  try { chrome.runtime.sendMessage({ type: "sip:disconnect" }); } catch {}
  await clearAuth();
  location.reload();
});

/* ============================ BOOT ============================ */
(async function boot() {
  try { $("li-workspace").value = (await chrome.storage.local.get("rnx_workspace")).rnx_workspace || ""; } catch {}
  const s = await getSession();
  if (s?.sip?.username) {
    try {
      const fresh = await api("/auth/session"); // validates token / triggers refresh
      enterMain({ user: fresh.user, sip: s.sip, permissions: fresh.permissions || s.permissions });
      await setAuth({ session: { user: fresh.user, sip: s.sip, permissions: fresh.permissions || [] } });
      return;
    } catch { await clearAuth(); }
  }
  show($("view-login"), true);
})();

/* ============================ MAIN ============================ */
let SIP = null;

async function enterMain(p) {
  SIP = p.sip;
  show($("view-login"), false);
  show($("view-main"), true);
  $("m-name").textContent = p.user?.name || SIP.username;
  $("m-ext").textContent = SIP.extension ? "Ext " + SIP.extension : "";

  initTabs(); initDialer(); initLogs();
  loadLogs();

  await ensureMic();
  await chrome.runtime.sendMessage({ type: "ensure-offscreen" }).catch(() => {});
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "sip:connect", config: SIP }).catch(() => {});
  }, 300);
}

// The side panel can't surface the mic prompt, so a dedicated page is
// opened in its own small window; it requests access and closes itself.
let micWin = null;
function ensureMic() {
  return new Promise(async (resolve) => {
    try {
      const st = await navigator.permissions.query({ name: "microphone" });
      if (st.state === "granted") return resolve(true);
    } catch { /* older Chrome — fall through */ }

    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; chrome.runtime.onMessage.removeListener(onMsg); resolve(v); };
    const onMsg = (m) => { if (m?.type === "mic:granted") finish(true); };
    chrome.runtime.onMessage.addListener(onMsg);

    try {
      micWin = await chrome.windows.create({
        url: chrome.runtime.getURL("permission.html"),
        type: "popup",
        width: 420,
        height: 360,
        focused: true
      });
    } catch {
      toast("Enable microphone for this extension, then reopen the panel.");
      finish(false);
      return;
    }
    // don't block the SIP connect forever if the user ignores the window
    setTimeout(() => finish(false), 60000);
  });
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
      show($("tab-dialer"), t.dataset.tab === "dialer");
      show($("tab-logs"), t.dataset.tab === "logs");
    });
  });
}
function gotoDialer() {
  document.querySelector('.tab[data-tab="dialer"]').click();
}

/* ---------------------- DIALER ---------------------- */
const call = {
  state: "idle", // idle | outgoing | incoming | active | held
  muted: false, held: false, startedAt: 0, timer: null,
  warm: { stage: "idle", conferenceId: null, target: "" }
};

function initDialer() {
  const num = $("d-number");
  document.querySelectorAll("#dialer-idle .keypad button").forEach((b) =>
    b.addEventListener("click", () => { num.value += b.textContent; })
  );
  $("d-back").addEventListener("click", () => { num.value = num.value.slice(0, -1); });
  $("d-call").addEventListener("click", startCall);
  num.addEventListener("keydown", (e) => { if (e.key === "Enter") startCall(); });

  document.querySelectorAll("#dtmf-pad button").forEach((b) =>
    b.addEventListener("click", () => chrome.runtime.sendMessage({ type: "sip:dtmf", tone: b.textContent }))
  );

  $("call-card").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    ({
      answer: () => send("sip:answer"),
      decline: () => send("sip:hangup"),
      hangup: () => send("sip:hangup"),
      mute: () => send(call.muted ? "sip:unmute" : "sip:mute"),
      hold: () => send(call.held ? "sip:unhold" : "sip:hold"),
      dtmf: () => { if (call.state === "active" || call.state === "held") { show($("dtmf-pad"), $("dtmf-pad").hidden); syncDtmfBtn(); } },
      warm: startWarm,
      addpart: startAddParticipant,
      "warm-complete": completeWarm,
      "warm-cancel": cancelWarm
    })[act]?.();
  });
}

function send(type, extra) { chrome.runtime.sendMessage({ type, ...extra }).catch(() => {}); }

function startCall() {
  const n = $("d-number").value.replace(/[^\d+*#]/g, "");
  if (n.length < 2) return toast("Enter a valid number");
  call.state = "outgoing";
  renderCall({ name: n, sub: "Calling…" });
  send("sip:call", { number: n });
}

function syncDtmfBtn() {
  const b = $("call-card").querySelector('[data-act="dtmf"]');
  if (b) b.classList.toggle("active", !$("dtmf-pad").hidden);
}

function renderCall(info) {
  const idle = $("dialer-idle"), card = $("call-card");
  const active = call.state !== "idle";
  const connected = call.state === "active" || call.state === "held";
  show(idle, !active); show(card, active);
  // DTMF pad only exists once a call is connected
  if (!connected) { show($("dtmf-pad"), false); syncDtmfBtn(); }
  if (!active) return;
  if (info?.name) $("cc-name").textContent = info.name;
  if (info?.sub != null) $("cc-sub").textContent = info.sub;
  show($("cc-incoming"), call.state === "incoming");
  show($("cc-controls"), connected);
  show($("cc-warm"), call.warm.stage !== "idle");
  $("cc-warm-t").textContent = call.warm.target;
  const muteBtn = $("call-card").querySelector('[data-act="mute"]');
  const holdBtn = $("call-card").querySelector('[data-act="hold"]');
  muteBtn.classList.toggle("active", call.muted);
  muteBtn.querySelector("span").textContent = call.muted ? "Unmute" : "Mute";
  holdBtn.classList.toggle("active", call.held);
  holdBtn.querySelector("span").textContent = call.held ? "Resume" : "Hold";
}

function startTimer() {
  call.startedAt = Date.now();
  clearInterval(call.timer);
  call.timer = setInterval(() => {
    const s = Math.floor((Date.now() - call.startedAt) / 1000);
    $("cc-timer").textContent =
      String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 1000);
}
function endCall() {
  clearInterval(call.timer);
  Object.assign(call, { state: "idle", muted: false, held: false });
  call.warm = { stage: "idle", conferenceId: null, target: "" };
  $("cc-timer").textContent = "00:00";
  renderCall();
}

/* warm transfer (agents only, backend ConfBridge flow) */
async function startWarm() {
  const target = prompt("Warm transfer to agent extension:");
  if (!target || !/^\d+$/.test(target.trim())) return;
  try {
    const c = await api("/calls/conference/start", { method: "POST" });
    call.warm = { stage: "consulting", conferenceId: c.conferenceId, target: target.trim() };
    renderCall();
    await api("/calls/conference/invite-agent", {
      method: "POST", body: { conferenceId: c.conferenceId, targetExtension: target.trim() }
    });
    call.warm.stage = "ready"; renderCall();
    toast("Agent " + target.trim() + " invited — talk, then Complete");
  } catch (e) { call.warm = { stage: "idle", conferenceId: null, target: "" }; renderCall(); toast(e.message); }
}
async function completeWarm() {
  if (!call.warm.conferenceId) return;
  try {
    await api("/calls/conference/complete", { method: "POST", body: { conferenceId: call.warm.conferenceId } });
    toast("Transfer completed");
    call.warm = { stage: "idle", conferenceId: null, target: "" };
    renderCall();
  } catch (e) { toast(e.message); }
}
function cancelWarm() {
  call.warm = { stage: "idle", conferenceId: null, target: "" };
  renderCall();
  toast("You're still on the call — hang up the invited agent from their phone");
}
async function startAddParticipant() {
  const n = prompt("Add participant — phone number:");
  if (!n || !n.trim()) return;
  try {
    let cid = call.warm.conferenceId;
    if (!cid) { cid = (await api("/calls/conference/start", { method: "POST" })).conferenceId; call.warm.conferenceId = cid; }
    await api("/calls/conference/invite-pstn", { method: "POST", body: { conferenceId: cid, number: n.trim() } });
    toast("Participant " + n.trim() + " invited");
  } catch (e) { toast(e.message); }
}

/* ---------------------- SIP EVENTS ---------------------- */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "auth:expired") { clearAuth().then(() => location.reload()); return; }
  if (msg?.type === "dial-request" && msg.number) {
    $("d-number").value = String(msg.number).replace(/[^\d+*#]/g, "");
    gotoDialer();
    if (call.state === "idle") startCall();
    return;
  }
  if (msg?.type !== "sip:event") return;
  const { event, data } = msg;
  switch (event) {
    case "registered":
    case "registration:accepted":
      $("m-reg").className = "reg ok"; $("m-reg-t").textContent = "Registered"; break;
    case "registration:rejected":
    case "server:disconnect":
      $("m-reg").className = "reg bad"; $("m-reg-t").textContent = "Offline"; break;
    case "call:received":
      call.state = "incoming";
      renderCall({ name: data?.number || "Incoming call", sub: "Incoming" });
      break;
    case "call:trying": renderCall({ sub: "Calling…" }); break;
    case "call:progress": renderCall({ sub: "Ringing…" }); break;
    case "call:answered":
      call.state = "active";
      renderCall({ name: data?.number || $("cc-name").textContent, sub: "" });
      show($("dtmf-pad"), true); syncDtmfBtn();   // keypad available once connected
      startTimer();
      break;
    case "call:hold": call.held = !!data?.held; call.state = call.held ? "held" : "active"; renderCall(); break;
    case "muted": call.muted = !!data?.muted; renderCall(); break;
    case "call:hangup": endCall(); loadLogs(); break;
    case "call:rejected": toast("Call rejected: " + (data?.reason || "")); endCall(); break;
    case "error": toast(data?.message || "SIP error"); break;
  }
});

/* ---------------------- CALL LOGS ---------------------- */
const logs = { dir: "OUTBOUND", range: "month", from: "", to: "", page: 1, done: false };

function initLogs() {
  $("lg-range").addEventListener("change", () => {
    logs.range = $("lg-range").value;
    show($("lg-custom"), logs.range === "custom");
    if (logs.range !== "custom") loadLogs();
  });
  $("lg-from").addEventListener("change", loadLogs);
  $("lg-to").addEventListener("change", loadLogs);
  document.querySelectorAll(".subtab").forEach((s) =>
    s.addEventListener("click", () => {
      document.querySelectorAll(".subtab").forEach((x) => x.classList.toggle("active", x === s));
      logs.dir = s.dataset.dir; loadLogs();
    })
  );
  $("lg-more").addEventListener("click", () => { logs.page++; loadLogs(true); });
}

function dateRange() {
  const d = new Date();
  const iso = (x) => x.toISOString().slice(0, 10);
  if (logs.range === "today") return { from: iso(d), to: iso(d) };
  if (logs.range === "week") {
    const m = new Date(d); const day = (m.getDay() + 6) % 7; m.setDate(m.getDate() - day);
    return { from: iso(m), to: iso(d) };
  }
  if (logs.range === "month") return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(d) };
  return { from: $("lg-from").value, to: $("lg-to").value };
}

async function loadLogs(append = false) {
  if (!append) { logs.page = 1; $("lg-list").innerHTML = '<p class="muted sm pad">Loading…</p>'; }
  const { from, to } = dateRange();
  try {
    if (logs.dir === "VOICEMAIL") return renderVoicemails(await api(qs("/voicemails", { from, to, page: logs.page, pageSize: 25 })), append);
    const params = { from, to, page: logs.page, pageSize: 25 };
    if (logs.dir === "MISSED") params.outcome = "missed";
    else params.direction = logs.dir;
    renderCalls(await api(qs("/calls", params)), append);
  } catch (e) {
    $("lg-list").innerHTML = '<p class="err pad">' + (e.status === 403 ? "Not available for your role." : e.message) + "</p>";
    show($("lg-more-wrap"), false);
  }
}
function qs(path, obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== "" && v != null) p.set(k, v); });
  return path + "?" + p.toString();
}
function fmtTime(s) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
         d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function fmtDur(sec) {
  sec = Number(sec) || 0;
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

function renderCalls(res, append) {
  const list = $("lg-list");
  if (!append) list.innerHTML = "";
  (res.rows || []).forEach((c) => {
    const inbound = c.direction === "INBOUND";
    const missed = !c.answered_at && inbound;
    const other = inbound ? c.from_number : c.to_number;
    const row = document.createElement("div");
    row.className = "row" + (inbound ? " in" : "") + (missed ? " missed" : "");
    row.innerHTML =
      `<div class="r-ic">${missed ? "✕" : inbound ? "↙" : "↗"}</div>
       <div class="r-main"><div class="r-num">${other || "Unknown"}</div>
       <div class="r-meta">${(c.agent_name || "") + (c.agent_name ? " · " : "")}${fmtTime(c.started_at)}</div></div>
       <div class="r-dur">${c.answered_at ? fmtDur(c.billable_sec) : "—"}</div>`;
    row.addEventListener("click", () => { $("d-number").value = (other || "").replace(/[^\d+*#]/g, ""); gotoDialer(); });
    list.appendChild(row);
  });
  paging(res);
}
function renderVoicemails(res, append) {
  const list = $("lg-list");
  if (!append) list.innerHTML = "";
  if (!append && !(res.rows || []).length) list.innerHTML = '<p class="muted sm pad">No voicemails.</p>';
  (res.rows || []).forEach((v) => {
    const row = document.createElement("div");
    row.className = "row in";
    row.innerHTML =
      `<div class="r-ic">✉</div>
       <div class="r-main"><div class="r-num">${v.from_number || "Unknown"}</div>
       <div class="r-meta">${fmtTime(v.created_at)} · ${fmtDur(v.duration_sec)}${v.heard_at ? "" : " · new"}</div></div>
       <button class="r-play">Play</button>`;
    row.querySelector(".r-play").addEventListener("click", (e) => { e.stopPropagation(); playVoicemail(v.id, e.target); });
    row.addEventListener("click", () => { $("d-number").value = (v.from_number || "").replace(/[^\d+*#]/g, ""); gotoDialer(); });
    list.appendChild(row);
  });
  paging(res);
}
function paging(res) {
  const shown = logs.page * (res.pageSize || 25);
  show($("lg-more-wrap"), (res.total || 0) > shown);
}

async function playVoicemail(id, btn) {
  btn.textContent = "…";
  try {
    const token = (await chrome.storage.local.get("rnx_token")).rnx_token;
    const r = await fetch(`https://demoapi.ringnex.co/api/voicemails/${id}`, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("Cannot load");
    const a = $("vm-audio");
    a.src = URL.createObjectURL(await r.blob());
    await a.play();
    btn.textContent = "▮▮";
    a.onended = () => (btn.textContent = "Play");
  } catch (e) { toast(e.message); btn.textContent = "Play"; }
}
