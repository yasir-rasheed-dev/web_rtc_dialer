import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Delete as DeleteKey,
  Eye,
  EyeOff,
  Headphones,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { RingnexSipClient } from "./lib/sipClient";
import {
  formatDuration,
  formatForDialing,
  initials,
  isValidDialString,
  normalizeDialString
} from "./lib/phone";
import { api } from "./lib/api";
import {
  loadConfig,
  loadHistory,
  loadTabPassword,
  saveConfig,
  saveHistory,
  saveTabPassword
} from "./lib/storage";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import Input from "./components/ui/Input";
import Modal from "./components/ui/Modal";

const KEYPAD = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""]
];

const CONNECTION_LABELS = {
  disconnected: "Offline",
  connecting: "Connecting",
  registering: "Registering",
  registered: "Ready",
  error: "Connection error"
};

const CALL_LABELS = {
  idle: "Ready to call",
  dialing: "Starting call",
  ringing: "Ringing",
  incoming: "Incoming call",
  connecting: "Connecting call",
  active: "Call connected",
  held: "Call on hold",
  ending: "Ending call"
};

const HISTORY_TABS = [
  { id: "all", label: "All", icon: Phone },
  { id: "incoming", label: "Incoming", icon: PhoneIncoming },
  { id: "outgoing", label: "Outgoing", icon: PhoneOutgoing },
  { id: "missed", label: "Missed", icon: PhoneMissed }
];

function Softphone({ sip = null, permissions = [] }) {
  const can = (key) => permissions.includes(key);
  const [config, setConfig] = useState(() => ({
    ...loadConfig(),
    ...(sip
      ? {
        username: sip.username,
        displayName: sip.displayName,
        domain: sip.domain,
        wssUrl: sip.wssUrl
      }
      : {})
  }));
  const [password, setPassword] = useState(() => sip?.password || loadTabPassword());
  const [rememberForTab, setRememberForTab] = useState(() => Boolean(loadTabPassword()));
  const [showPassword, setShowPassword] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [callStatus, setCallStatusState] = useState("idle");
  const [dialNumber, setDialNumber] = useState("");
  const [currentParty, setCurrentParty] = useState({ number: "", displayName: "" });
  const [elapsed, setElapsed] = useState(0);
  
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState(loadHistory);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [microphones, setMicrophones] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [deviceStatus, setDeviceStatus] = useState("unchecked");
  const [conferenceId, setConferenceId] = useState(null);
const [transferTarget, setTransferTarget] = useState("");
const [transferStage, setTransferStage] = useState("idle");

  // UI-only state for the redesigned layout (call-history tabs, the audio
  // settings popover, and a drag-over highlight on the dial input) — none of
  // it touches SIP/call logic above.
  const [historyTab, setHistoryTab] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialDragOver, setDialDragOver] = useState(false);

  const remoteAudioRef = useRef(null);
  const clientRef = useRef(null);
  const callStatusRef = useRef("idle");
  const activeCallRef = useRef(null);
  const historyCommittedRef = useRef(false);
  const noticeTimerRef = useRef(null);
  const registrationTimerRef = useRef(null);
  const autoConnectAttemptedRef = useRef(false);

  const setCallStatus = useCallback((next) => {
    callStatusRef.current = next;
    setCallStatusState(next);
  }, []);

  const isRegistered = connectionStatus === "registered";
  const callInProgress = callStatus !== "idle";
  const callEstablished = callStatus === "active" || callStatus === "held";
  const settingsLocked = connectionStatus !== "disconnected" && connectionStatus !== "error";

  const flashNotice = useCallback((message) => {
    window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2800);
  }, []);

  const appendHistory = useCallback((entry) => {
    setHistory((current) => {
      const next = [{ id: crypto.randomUUID(), ...entry }, ...current].slice(0, 20);
      saveHistory(next);
      return next;
    });
  }, []);

  const finishCall = useCallback(
    (forcedOutcome) => {
      const call = activeCallRef.current;
      if (call && !historyCommittedRef.current) {
        historyCommittedRef.current = true;
        const duration = call.connectedAt
          ? Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000))
          : 0;
        const outcome =
          forcedOutcome ||
          (call.connectedAt
            ? "completed"
            : call.direction === "incoming"
              ? "missed"
              : "not answered");
        appendHistory({
          direction: call.direction,
          number: call.number,
          displayName: call.displayName || "",
          startedAt: call.startedAt,
          duration,
          outcome
        });
      }

      if (call) {
        // The Auto Dialer listens for this to open its disposition panel.
        window.dispatchEvent(
          new CustomEvent("ringnex:call-ended", {
            detail: {
              number: call.number,
              direction: call.direction,
              duration: call.connectedAt ? Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000)) : 0,
              connected: Boolean(call.connectedAt),
              outcome:
                forcedOutcome ||
                (call.connectedAt ? "completed" : call.direction === "incoming" ? "missed" : "not answered")
            }
          })
        );
      }

      activeCallRef.current = null;
      setCurrentParty({ number: "", displayName: "" });
      setElapsed(0);
      setMuted(false);
      setHeld(false);
      setCallStatus("idle");
    },
    [appendHistory, setCallStatus]
  );

  const refreshDevices = useCallback(async (requestPermission = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDeviceStatus("unsupported");
      return;
    }

    setDeviceStatus("checking");
    let stream;
    try {
      if (requestPermission) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === "audioinput");
      const outputs = devices.filter((device) => device.kind === "audiooutput");
      setMicrophones(inputs);
      setSpeakers(outputs);
      setDeviceStatus(inputs.length ? "ready" : "unavailable");
    } catch (deviceError) {
      setDeviceStatus(deviceError?.name === "NotAllowedError" ? "denied" : "unavailable");
      setError(
        deviceError?.name === "NotAllowedError"
          ? "Microphone permission was blocked. Allow it in the browser site settings."
          : "No working microphone was found."
      );
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    refreshDevices(false);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshDevices]);

  useEffect(() => {
    if (!callEstablished || !activeCallRef.current?.connectedAt) return undefined;
    const tick = () => {
      setElapsed(Math.floor((Date.now() - activeCallRef.current.connectedAt) / 1000));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [callEstablished]);

  useEffect(
    () => () => {
      window.clearTimeout(noticeTimerRef.current);
      window.clearTimeout(registrationTimerRef.current);
      clientRef.current?.disconnect().catch(() => undefined);
    },
    []
  );

  const connect = async (event) => {
    event?.preventDefault();
    setError("");
    setNotice("");

    const cleanConfig = {
      ...config,
      username: config.username.trim(),
      displayName: config.displayName.trim(),
      domain: config.domain.trim(),
      wssUrl: config.wssUrl.trim()
    };

    if (!cleanConfig.username || !password) {
      setError("SIP username and SIP password are required.");
      return;
    }
    if (!cleanConfig.domain || !/^wss:\/\//i.test(cleanConfig.wssUrl)) {
      setError("Use a valid SIP domain and a secure wss:// WebSocket URL.");
      return;
    }
    if (!online) {
      setError("Your browser is offline. Reconnect to the internet and try again.");
      return;
    }

    saveConfig(cleanConfig);
    saveTabPassword(rememberForTab ? password : "");
    setConfig(cleanConfig);
    setConnectionStatus("connecting");

    if (clientRef.current) {
      await clientRef.current.disconnect().catch(() => undefined);
      clientRef.current = null;
    }

    const client = new RingnexSipClient(
      { ...cleanConfig, password, microphoneId },
      remoteAudioRef.current,
      {
        onServerConnect: () => setConnectionStatus("registering"),
        onServerDisconnect: () => {
          window.clearTimeout(registrationTimerRef.current);
          setConnectionStatus("disconnected");
          if (callStatusRef.current !== "idle") finishCall("disconnected");
        },
        onRegistered: () => {
          window.clearTimeout(registrationTimerRef.current);
          setConnectionStatus("registered");
          flashNotice("SIP account registered and ready");
        },
        onRegistrationAccepted: () => {
          window.clearTimeout(registrationTimerRef.current);
          setConnectionStatus("registered");
        },
        onRegistrationRejected: (reason) => {
          window.clearTimeout(registrationTimerRef.current);
          setConnectionStatus("error");
          setError(`Registration rejected: ${reason}. Check the SIP password.`);
          clientRef.current?.disconnect().catch(() => undefined);
        },
        onCallTrying: () => setCallStatus("dialing"),
        onCallProgress: () => setCallStatus("ringing"),
        onCallReceived: async (identity) => {
          const isMonitoringCall =
            String(identity?.displayName || "").trim() === "Ringnex Monitor";

          const party = {
            number: identity?.number || "Unknown caller",
            displayName: identity?.displayName || "Incoming call"
          };

          historyCommittedRef.current = false;

          activeCallRef.current = {
            ...party,
            direction: isMonitoringCall ? "monitoring" : "incoming",
            startedAt: new Date().toISOString(),
            connectedAt: null
          };

          setCurrentParty(party);

          if (isMonitoringCall) {
            setCallStatus("connecting");

            try {
              await clientRef.current?.answer();
            } catch (error) {
              setError(
                error?.message ||
                "Could not connect the supervisor monitoring session."
              );
              finishCall("failed");
            }

            return;
          }

          setCallStatus("incoming");
        },
        onCallAnswered: (identity) => {
          if (activeCallRef.current) activeCallRef.current.connectedAt = Date.now();
          if (identity?.number) setCurrentParty((current) => ({ ...current, ...identity }));
          setCallStatus("active");
          refreshDevices(false);
        },
        onCallHangup: () => finishCall(),
        onCallHold: (isHeld) => {
          setHeld(isHeld);
          setCallStatus(isHeld ? "held" : "active");
        },
        onCallRejected: (reason) => {
          setError(`Call failed: ${reason}`);
          finishCall("failed");
        }
      }
    );

    clientRef.current = client;
    registrationTimerRef.current = window.setTimeout(() => {
      if (clientRef.current === client) {
        setConnectionStatus("error");
        setError("The SIP server did not complete registration in time. Check the password and server status.");
        client.disconnect().catch(() => undefined);
      }
    }, 18000);
    try {
      await client.connectAndRegister();
    } catch (connectError) {
      window.clearTimeout(registrationTimerRef.current);
      setConnectionStatus("error");
      setError(
        connectError?.message ||
        "Could not connect to the Asterisk WebSocket. Check the server and credentials."
      );
    }
  };

  useEffect(() => {
    if (!sip || !online || autoConnectAttemptedRef.current) return;

    if (
      !sip.username ||
      !sip.password ||
      !sip.domain ||
      !sip.wssUrl
    ) {
      return;
    }

    autoConnectAttemptedRef.current = true;
    connect();
  }, [sip, online]);

  const disconnect = async () => {
    if (callInProgress) {
      setError("Hang up the active call before disconnecting the SIP account.");
      return;
    }
    setError("");
    window.clearTimeout(registrationTimerRef.current);
    setConnectionStatus("connecting");
    try {
      await clientRef.current?.disconnect();
    } catch {
      // The local UI can still safely return to the disconnected state.
    } finally {
      clientRef.current = null;
      setConnectionStatus("disconnected");
      if (!rememberForTab) setPassword("");
      flashNotice("SIP account disconnected");
    }
  };

  // Single outbound entry point. The keypad and the Auto Dialer both go through
  // here, so there is exactly one SIP calling path in the app.
  const startCall = async (rawNumber, { displayName = "Outbound call" } = {}) => {
    setError("");
    const fail = (message) => {
      setError(message);
      throw new Error(message);
    };

    if (!can("MAKE_CALLS")) fail("Your role does not allow outbound calls.");
    if (!isRegistered) fail("Connect the SIP account before placing a call.");
    if (callStatusRef.current !== "idle") fail("Another call is already in progress.");

    // Whatever shape the agent typed/dropped/redialed (bare 10-digit, an 11-digit
    // number with the leading 1, or already E.164), this puts it into the E.164
    // form Commio expects on the wire — extensions and DTMF codes pass through
    // unchanged. See lib/phone.js#formatForDialing.
    const number = formatForDialing(rawNumber);
    if (!isValidDialString(number)) fail("Enter a valid phone number using digits, +, * or #.");

    const party = { number, displayName };
    historyCommittedRef.current = false;
    activeCallRef.current = {
      ...party,
      direction: "outgoing",
      startedAt: new Date().toISOString(),
      connectedAt: null
    };
    setCurrentParty(party);
    setCallStatus("dialing");
    window.dispatchEvent(new CustomEvent("ringnex:call-started", { detail: { number, direction: "outgoing" } }));

    try {
      await clientRef.current.call(number);
      return number;
    } catch (callError) {
      const message = callError?.message || "The call could not be started.";
      setError(message);
      finishCall("failed");
      throw new Error(message);
    }
  };

  const placeCall = async (event) => {
    event?.preventDefault();
    await startCall(dialNumber).catch(() => undefined);
  };

  // startCall closes over render state, so keep the ref pointing at the latest
  // one and let the global handle delegate through it.
  const startCallRef = useRef(startCall);
  useEffect(() => {
    startCallRef.current = startCall;
  });

  useEffect(() => {
    const dial = (number, options) => startCallRef.current(number, options);
    window.ringnexDial = dial;
    return () => {
      if (window.ringnexDial === dial) delete window.ringnexDial;
    };
  }, []);

  useEffect(() => {
    // Published for panels rendered outside the softphone (Auto Dialer). The
    // snapshot covers consumers that mount after the last transition.
    window.ringnexSoftphoneState = { registered: isRegistered, callStatus };
    window.dispatchEvent(
      new CustomEvent("ringnex:softphone-state", { detail: window.ringnexSoftphoneState })
    );
  }, [isRegistered, callStatus]);

  const answerCall = async () => {
    setError("");
    if (!can("RECEIVE_CALLS")) {
      setError("Your role does not allow inbound calls.");
      return;
    }
    setCallStatus("connecting");
    try {
      await clientRef.current?.answer();
    } catch (answerError) {
      setError(answerError?.message || "The incoming call could not be answered.");
      finishCall("failed");
    }
  };

  const declineCall = async () => {
    setCallStatus("ending");
    try {
      await clientRef.current?.decline();
    } catch {
      finishCall("declined");
    }
  };

  const hangup = async () => {
    setCallStatus("ending");
    try {
      await clientRef.current?.hangup();
    } catch (hangupError) {
      setError(hangupError?.message || "The call ended locally.");
      finishCall();
    }
  };

  const toggleMute = () => {
    if (!clientRef.current || !callEstablished) return;
    if (muted) clientRef.current.unmute();
    else clientRef.current.mute();
    setMuted((current) => !current);
  };

  const toggleHold = async () => {
    if (!clientRef.current || !callEstablished) return;
    setError("");
    try {
      if (held) await clientRef.current.unhold();
      else await clientRef.current.hold();
    } catch (holdError) {
      setError(holdError?.message || "The hold request was not accepted.");
    }
  };
  const transferCall = async () => {
    if (!clientRef.current || !callEstablished) {
      setError("No active call available to transfer.");
      return;
    }

    const input = window.prompt(
      "Transfer call to agent extension or phone number:",
      ""
    );

    if (input === null) return;

    const target = normalizeDialString(input);

    if (!isValidDialString(target)) {
      setError("Enter a valid agent extension or phone number.");
      return;
    }

    setError("");

    try {
      await clientRef.current.transfer(target);

      flashNotice(`Transfer initiated to ${target}`);
    } catch (transferError) {
      setError(
        transferError?.message ||
        "The call could not be transferred."
      );
    }
  };
  const startWarmTransfer = async () => {
  if (!callEstablished) {
    setError("No active call available to transfer.");
    return;
  }

  const input = window.prompt(
    "Enter agent extension for warm transfer:",
    "1002"
  );

  if (input === null) return;

  const target = input.trim();

  if (!/^\d+$/.test(target)) {
    setError("Enter a valid agent extension.");
    return;
  }

  setError("");
  setTransferStage("consulting");
  setTransferTarget(target);

  try {
    // 1. Move Agent + Customer into a ConfBridge
    const conference = await api(
      "/calls/conference/start",
      {
        method: "POST"
      }
    );

    setConferenceId(conference.conferenceId);

    // 2. Ring target agent and join them to same conference
    await api(
      "/calls/conference/invite-agent",
      {
        method: "POST",
        body: {
          conferenceId: conference.conferenceId,
          targetExtension: target
        }
      }
    );

    setTransferStage("ready");

    flashNotice(
      `Agent ${target} invited to transfer`
    );
  } catch (warmTransferError) {
    setTransferStage("idle");

    setError(
      warmTransferError?.message ||
        "Warm transfer could not be started."
    );
  }
};
const completeWarmTransfer = async () => {
  if (!conferenceId) {
    setError("No active warm transfer conference.");
    return;
  }

  setError("");

  try {
    await api(
      "/calls/conference/complete",
      {
        method: "POST",
        body: {
          conferenceId
        }
      }
    );

    flashNotice(
      `Transfer to agent ${transferTarget} completed`
    );

    setConferenceId(null);
    setTransferTarget("");
    setTransferStage("idle");
  } catch (completeTransferError) {
    setError(
      completeTransferError?.message ||
        "Could not complete the transfer."
    );
  }
};
const addPstnParticipant = async () => {
  if (!callEstablished) {
    setError("No active call available.");
    return;
  }

  const input = window.prompt(
    "Enter participant phone number with country code:"
  );

  if (input === null) return;

  const target = input.trim();

  if (!target) {
    setError("Enter a valid phone number.");
    return;
  }

  setError("");

  try {
    let activeConferenceId = conferenceId;

    // If normal 2-party call is active, create conference first
    if (!activeConferenceId) {
      const conference = await api(
        "/calls/conference/start",
        {
          method: "POST"
        }
      );

      activeConferenceId = conference.conferenceId;
      setConferenceId(activeConferenceId);
    }

    // Invite external PSTN participant
    await api(
      "/calls/conference/invite-pstn",
      {
        method: "POST",
        body: {
          conferenceId: activeConferenceId,
          number: target
        }
      }
    );

    flashNotice(
      `Participant ${target} invited`
    );
  } catch (participantError) {
    setError(
      participantError?.message ||
        "Could not add participant."
    );
  }
};

  const pressKey = async (key) => {
    if (callEstablished) {
      try {
        await clientRef.current?.sendDTMF(key);
        flashNotice(`DTMF ${key} sent`);
      } catch {
        setError("The DTMF tone could not be sent.");
      }
      return;
    }
    if (callStatus === "idle") {
      setDialNumber((current) => normalizeDialString(`${current}${key}`));
    }
  };

  const selectSpeaker = async (value) => {
    setSpeakerId(value);
    try {
      if (remoteAudioRef.current?.setSinkId) {
        await remoteAudioRef.current.setSinkId(value);
        flashNotice("Speaker changed");
      }
    } catch {
      setError("The browser could not switch to that speaker.");
    }
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const primaryParty = currentParty.displayName || currentParty.number;
  const supportsAudioOutput = Boolean(remoteAudioRef.current?.setSinkId);

  const deviceLabel = useMemo(() => {
    if (deviceStatus === "ready") return `${microphones.length} microphone${microphones.length === 1 ? "" : "s"}`;
    if (deviceStatus === "denied") return "Permission blocked";
    if (deviceStatus === "checking") return "Checking";
    if (deviceStatus === "unsupported") return "Not supported";
    if (deviceStatus === "unavailable") return "No microphone";
    return "Permission not checked";
  }, [deviceStatus, microphones.length]);

  const filteredHistory = useMemo(() => {
    if (historyTab === "incoming") return history.filter((item) => item.direction === "incoming");
    if (historyTab === "outgoing") return history.filter((item) => item.direction === "outgoing");
    if (historyTab === "missed") return history.filter((item) => item.direction === "incoming" && item.outcome === "missed");
    return history;
  }, [history, historyTab]);

  const callsToday = useMemo(() => {
    const todayKey = new Date().toDateString();
    return history.filter((item) => new Date(item.startedAt).toDateString() === todayKey).length;
  }, [history]);

  const redialFromHistory = (item) => {
    if (callStatus === "idle") setDialNumber(item.number);
  };

  // Lets an agent drag a phone number they've selected anywhere on the page
  // (a contact, a call-log row) and drop it straight into the dial input —
  // browsers already support dragging selected text, so this only needs a
  // drop target, no draggable="true" wiring on the source elements.
  const handleDialDrop = (event) => {
    event.preventDefault();
    setDialDragOver(false);
    if (callStatus !== "idle") return;
    const raw = event.dataTransfer.getData("text/plain") || event.dataTransfer.getData("text") || "";
    const candidate = normalizeDialString(raw);
    if (candidate) setDialNumber(candidate);
  };


  return (
    <div className="flex h-full min-h-[600px] flex-col gap-4 p-6">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <Card animate={false} className="flex flex-col !p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-base font-bold text-brand">
                {initials(config.displayName || config.username)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{config.displayName || "Agent"}</p>
                <p className="truncate text-xs text-muted">{config.username || "—"}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isRegistered ? "bg-success" : connectionStatus === "error" ? "bg-danger" : "bg-muted"
                }`}
                title={CONNECTION_LABELS[connectionStatus]}
              />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                aria-label="Audio settings"
              >
                <Settings2 size={16} />
              </button>
            </div>
          </div>

          {/* No tenant-issued SIP identity was provided — a defensive fallback path
              that never actually renders in the real app (App.jsx only mounts
              Softphone once session.sip exists), kept so a manual connection is
              still possible outside that flow. When `sip` is present the agent's
              extension connects automatically in the background instead. */}
          {!sip && (
            <form onSubmit={connect} className="mb-5 flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-sm font-semibold text-text">Agent connection</h1>
                {isRegistered ? <ShieldCheck size={18} className="text-success" /> : <Settings2 size={16} className="text-muted" />}
              </div>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                SIP username
                <Input
                  value={config.username}
                  onChange={(event) => setConfig({ ...config, username: event.target.value })}
                  autoComplete="username"
                  disabled={settingsLocked}
                  placeholder="webdialer01"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                SIP password
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    disabled={settingsLocked}
                    placeholder="Enter SIP password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={settingsLocked}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                Display name
                <Input
                  value={config.displayName}
                  onChange={(event) => setConfig({ ...config, displayName: event.target.value })}
                  disabled={settingsLocked}
                  placeholder="Agent name"
                />
              </label>

              <details className="text-xs text-muted">
                <summary className="cursor-pointer select-none font-medium text-text">Server settings</summary>
                <div className="mt-2 flex flex-col gap-2">
                  <label className="flex flex-col gap-1.5">
                    SIP domain
                    <Input
                      value={config.domain}
                      onChange={(event) => setConfig({ ...config, domain: event.target.value })}
                      disabled={settingsLocked}
                      inputMode="url"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    WebSocket URL
                    <Input
                      value={config.wssUrl}
                      onChange={(event) => setConfig({ ...config, wssUrl: event.target.value })}
                      disabled={settingsLocked}
                      inputMode="url"
                    />
                  </label>
                </div>
              </details>

              <label className="flex items-center gap-2 text-xs text-text">
                <input
                  type="checkbox"
                  checked={rememberForTab}
                  onChange={(event) => {
                    setRememberForTab(event.target.checked);
                    if (!event.target.checked) saveTabPassword("");
                  }}
                  disabled={settingsLocked}
                  className="h-4 w-4 rounded border-border-strong accent-[rgb(var(--rn-blue))]"
                />
                Keep password for this tab only
              </label>
              <p className="text-[11px] text-muted">Use the SIP User password, not the portal password.</p>

              {isRegistered ? (
                <Button type="button" variant="secondary" icon={WifiOff} onClick={disconnect} disabled={callInProgress}>
                  Disconnect
                </Button>
              ) : (
                <Button type="submit" icon={Wifi} loading={connectionStatus === "connecting" || connectionStatus === "registering"}>
                  {connectionStatus === "connecting" || connectionStatus === "registering" ? "Connecting…" : "Connect account"}
                </Button>
              )}
            </form>
          )}

          {callInProgress ? (
            <div className="flex flex-1 flex-col items-center justify-between gap-6 py-2">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand/10 text-xl font-bold text-brand">
                  {callStatus === "incoming" && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
                  )}
                  <span className="relative">{initials(primaryParty)}</span>
                </div>
                <div>
                  <p className="text-xs text-muted">
                    {currentParty.displayName || (callStatus === "incoming" ? "Incoming call" : "Calling")}
                  </p>
                  <p className="text-lg font-semibold text-text">{currentParty.number || "Unknown caller"}</p>
                  <p className="mt-0.5 text-xs text-muted">{callEstablished ? formatDuration(elapsed) : CALL_LABELS[callStatus]}</p>
                </div>
              </div>

              {callStatus === "incoming" ? (
                <div className="flex w-full items-center justify-center gap-8">
                  <button type="button" onClick={declineCall} className="flex flex-col items-center gap-1.5" aria-label="Decline call">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white shadow-card">
                      <PhoneOff size={22} />
                    </span>
                    <span className="text-xs font-medium text-danger">Decline</span>
                  </button>
                  {can("RECEIVE_CALLS") && (
                    <button type="button" onClick={answerCall} className="flex flex-col items-center gap-1.5" aria-label="Answer call">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-white shadow-card">
                        <PhoneIncoming size={22} />
                      </span>
                      <span className="text-xs font-medium text-success">Answer</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex w-full flex-col gap-4">
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={toggleMute}
                      disabled={!callEstablished}
                      className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                        muted ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted hover:text-text"
                      }`}
                    >
                      {muted ? <MicOff size={18} /> : <Mic size={18} />}
                      {muted ? "Unmute" : "Mute"}
                    </button>
                    {can("HOLD_CALL") && (
                      <button
                        type="button"
                        onClick={toggleHold}
                        disabled={!callEstablished}
                        className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                          held ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted hover:text-text"
                        }`}
                      >
                        {held ? <Play size={18} /> : <Pause size={18} />}
                        {held ? "Resume" : "Hold"}
                      </button>
                    )}
                    {can("BLIND_TRANSFER") && (
                      <button
                        type="button"
                        onClick={transferCall}
                        disabled={!callEstablished}
                        className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 py-2.5 text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
                      >
                        <ArrowUpRight size={18} />
                        Transfer
                      </button>
                    )}
                    {can("WARM_TRANSFER") && (
                      <button
                        type="button"
                        onClick={startWarmTransfer}
                        disabled={!callEstablished || transferStage !== "idle"}
                        className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 py-2.5 text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
                      >
                        <ArrowUpRight size={18} />
                        {transferStage === "idle" ? "Warm" : "Transferring"}
                      </button>
                    )}
                  </div>

                  {can("WARM_TRANSFER") && transferStage === "ready" && conferenceId && (
                    <Button size="sm" onClick={completeWarmTransfer} className="w-full justify-center">
                      Complete transfer
                    </Button>
                  )}
                  {can("ADD_PARTICIPANT") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={ArrowUpRight}
                      onClick={addPstnParticipant}
                      disabled={!callEstablished}
                      className="w-full justify-center"
                    >
                      Add participant
                    </Button>
                  )}

                  <Button variant="danger" icon={PhoneOff} onClick={hangup} className="w-full justify-center">
                    Hang up
                  </Button>

                  {callEstablished && can("SEND_DTMF") && (
                    <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
                      {KEYPAD.map(([key, letters]) => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => pressKey(key)}
                          aria-label={`Send DTMF ${key}`}
                          className="flex flex-col items-center rounded-xl py-2 text-text transition-colors hover:bg-surface-2"
                        >
                          <span className="text-base font-semibold">{key}</span>
                          {letters && <span className="text-[9px] text-muted">{letters}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-5">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDialDragOver(true);
                }}
                onDragLeave={() => setDialDragOver(false)}
                onDrop={handleDialDrop}
                className={`flex items-center gap-2 rounded-xl border bg-surface-2 px-4 py-3 transition-colors ${
                  dialDragOver ? "border-brand ring-2 ring-brand/20" : "border-border"
                }`}
              >
                <input
                  value={dialNumber}
                  onChange={(event) => setDialNumber(normalizeDialString(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") placeCall(event);
                  }}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="Enter number…"
                  aria-label="Phone number"
                  className="min-w-0 flex-1 bg-transparent font-mono text-base tracking-wide text-text outline-none placeholder:font-sans placeholder:text-muted"
                />
                {dialNumber && (
                  <button
                    type="button"
                    onClick={() => setDialNumber((current) => current.slice(0, -1))}
                    className="shrink-0 text-muted hover:text-text"
                    aria-label="Delete last digit"
                  >
                    <DeleteKey size={18} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 justify-items-center gap-3">
                {KEYPAD.map(([key, letters]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => pressKey(key)}
                    aria-label={`Dial ${key}`}
                    className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-surface-2 text-text transition-colors hover:bg-surface-3 active:scale-95"
                  >
                    <span className="text-xl font-semibold">{key}</span>
                    <span className="text-[9px] font-medium text-muted">{letters}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={placeCall}
                disabled={!can("MAKE_CALLS") || !isRegistered || !isValidDialString(dialNumber)}
                aria-label="Start call"
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white shadow-[0_10px_24px_-6px_rgb(var(--rn-green)/0.5)] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                <PhoneCall size={22} />
              </button>
              <p className="text-center text-xs text-muted">
                {!can("MAKE_CALLS")
                  ? "Outbound calling is disabled for your role."
                  : isRegistered
                    ? "Calls are routed through your tenant-aware Asterisk setup."
                    : "Connect your SIP account to enable calling."}
              </p>
            </div>
          )}
        </Card>

        <Card animate={false} className="flex flex-col !p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text">Call History</h2>
              <p className="text-xs text-muted">
                {callsToday} call{callsToday === 1 ? "" : "s"} today
              </p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                aria-label="Clear call history"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          <div className="mb-3 flex gap-1 border-b border-border">
            {HISTORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHistoryTab(tab.id)}
                className={`flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
                  historyTab === tab.id ? "border-brand text-brand" : "border-transparent text-muted hover:text-text"
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredHistory.length ? (
              <div className="flex flex-col divide-y divide-border/60">
                {filteredHistory.map((item) => {
                  const missed = item.direction === "incoming" && item.outcome === "missed";
                  const RowIcon = item.direction === "incoming" ? ArrowDownLeft : ArrowUpRight;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => redialFromHistory(item)}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          missed ? "bg-danger-soft text-danger" : "bg-brand/10 text-brand"
                        }`}
                      >
                        <RowIcon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">{item.displayName || item.number}</p>
                        <p className="truncate text-xs text-muted">
                          {item.displayName ? item.number : missed ? "Missed" : item.outcome}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted">
                          {new Date(item.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {item.duration > 0 && <p className="text-xs text-muted">{formatDuration(item.duration)}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center py-16">
                <EmptyState icon={Phone} title="No calls in this category" />
              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Audio settings">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <Headphones size={16} className="text-muted" />
            Device setup
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                deviceStatus === "ready" ? "bg-success-soft text-success" : "bg-surface-3 text-muted"
              }`}
            >
              <Mic size={16} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-text">Microphone</p>
              <p className="text-xs text-muted">{deviceLabel}</p>
            </div>
            {deviceStatus === "ready" && <Check size={16} className="text-success" />}
          </div>
          <Button variant="secondary" icon={Mic} onClick={() => refreshDevices(true)} disabled={callInProgress}>
            Check microphone
          </Button>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Microphone input
            <select
              value={microphoneId}
              onChange={(event) => setMicrophoneId(event.target.value)}
              disabled={settingsLocked || callInProgress || microphones.length === 0}
              className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              <option value="">System default</option>
              {microphones.map((device, index) => (
                <option value={device.deviceId} key={device.deviceId || index}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Speaker output
            <select
              value={speakerId}
              onChange={(event) => selectSpeaker(event.target.value)}
              disabled={!supportsAudioOutput || speakers.length === 0}
              className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              <option value="">System default</option>
              {speakers.map((device, index) => (
                <option value={device.deviceId} key={device.deviceId || index}>
                  {device.label || `Speaker ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted">Disconnect before changing the microphone. Speaker selection depends on browser support.</p>

          <div className="flex items-start gap-2 border-t border-border pt-4 text-xs text-muted">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-muted" />
            <span>Your SIP password is never written into the app bundle or permanent browser storage.</span>
          </div>
        </div>
      </Modal>

      {(error || notice || !online) && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-card ${
            error || !online ? "border-danger/30 bg-surface text-danger" : "border-success/30 bg-surface text-success"
          }`}
          role="status"
          aria-live="polite"
        >
          {error || (!online ? "Internet connection lost." : notice)}
          {error && (
            <button type="button" onClick={() => setError("")} aria-label="Dismiss message" className="text-muted hover:text-text">
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default Softphone;
