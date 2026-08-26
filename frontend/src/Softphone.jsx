import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Delete as DeleteKey,
  Eye,
  EyeOff,
  Headphones,
  History,
  LockKeyhole,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Signal,
  Trash2,
  Wifi,
  WifiOff
} from "lucide-react";
import { RingnexSipClient } from "./lib/sipClient";
import {
  formatDuration,
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

    const number = normalizeDialString(rawNumber);
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

  const connectionClass = `status-dot status-${connectionStatus}`;
  const primaryParty = currentParty.displayName || currentParty.number;
  const secondaryParty = currentParty.displayName ? currentParty.number : "";
  const secureContext = window.isSecureContext;
  const supportsAudioOutput = Boolean(remoteAudioRef.current?.setSinkId);

  const deviceLabel = useMemo(() => {
    if (deviceStatus === "ready") return `${microphones.length} microphone${microphones.length === 1 ? "" : "s"}`;
    if (deviceStatus === "denied") return "Permission blocked";
    if (deviceStatus === "checking") return "Checking";
    if (deviceStatus === "unsupported") return "Not supported";
    if (deviceStatus === "unavailable") return "No microphone";
    return "Permission not checked";
  }, [deviceStatus, microphones.length]);

  return (
    <div className="app-shell">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">RN</div>
          <div>
            <strong>Ringnex</strong>
            <span>Web Dialer</span>
          </div>
        </div>
        <div className="topbar-status">
          <span className="secure-chip"><LockKeyhole size={14} /> Secure WebRTC</span>
          <span className={`connection-chip ${connectionStatus}`}>
            <span className={connectionClass} />
            {CONNECTION_LABELS[connectionStatus]}
          </span>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-column">
          <section className="panel account-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SIP account</span>
                <h2>Agent connection</h2>
              </div>
              {isRegistered ? <ShieldCheck className="success-icon" size={22} /> : <Settings2 size={20} />}
            </div>

            <form onSubmit={connect} className="account-form">
              <label>
                <span>SIP username</span>
                <input
                  value={config.username}
                  onChange={(event) => setConfig({ ...config, username: event.target.value })}
                  autoComplete="username"
                  disabled={settingsLocked || Boolean(sip)}
                  placeholder="webdialer01"
                />
              </label>
              <label>
                <span>SIP password</span>
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    disabled={settingsLocked || Boolean(sip)}
                    placeholder="Enter SIP password"
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    disabled={settingsLocked || Boolean(sip)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <label>
                <span>Display name</span>
                <input
                  value={config.displayName}
                  onChange={(event) => setConfig({ ...config, displayName: event.target.value })}
                  disabled={settingsLocked || Boolean(sip)}
                  placeholder="Agent name"
                />
              </label>

              <details className="advanced-settings">
                <summary>Server settings <ChevronDown size={16} /></summary>
                <div className="advanced-fields">
                  <label>
                    <span>SIP domain</span>
                    <input
                      value={config.domain}
                      onChange={(event) => setConfig({ ...config, domain: event.target.value })}
                      disabled={settingsLocked || Boolean(sip)}
                      inputMode="url"
                    />
                  </label>
                  <label>
                    <span>WebSocket URL</span>
                    <input
                      value={config.wssUrl}
                      onChange={(event) => setConfig({ ...config, wssUrl: event.target.value })}
                      disabled={settingsLocked || Boolean(sip)}
                      inputMode="url"
                    />
                  </label>
                </div>
              </details>

              {!sip && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={rememberForTab}
                    onChange={(event) => {
                      setRememberForTab(event.target.checked);
                      if (!event.target.checked) saveTabPassword("");
                    }}
                    disabled={settingsLocked}
                  />
                  <span>Keep password for this tab only</span>
                </label>
              )}
              <p className="field-help">
                {sip ? "SIP credentials were released for this authenticated session only." : "Use the SIP User password, not the portal password."}
              </p>

              {isRegistered ? (
                <button type="button" className="button secondary full" onClick={disconnect} disabled={callInProgress}>
                  <WifiOff size={17} /> Disconnect
                </button>
              ) : (
                <button
                  type="submit"
                  className="button primary full"
                  disabled={connectionStatus === "connecting" || connectionStatus === "registering"}
                >
                  {connectionStatus === "connecting" || connectionStatus === "registering" ? (
                    <RefreshCw className="spin" size={17} />
                  ) : (
                    <Wifi size={17} />
                  )}
                  {connectionStatus === "connecting" || connectionStatus === "registering" ? "Connecting…" : "Connect account"}
                </button>
              )}
            </form>
          </section>

          <section className="panel history-panel">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">On this device</span>
                <h2>Recent calls</h2>
              </div>
              {history.length > 0 && (
                <button type="button" className="icon-button" onClick={clearHistory} aria-label="Clear call history">
                  <Trash2 size={17} />
                </button>
              )}
            </div>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="empty-state">
                  <History size={22} />
                  <span>Your recent calls will appear here.</span>
                </div>
              ) : (
                history.slice(0, 6).map((item) => (
                  <button
                    type="button"
                    className="history-item"
                    key={item.id}
                    onClick={() => {
                      if (callStatus === "idle") setDialNumber(item.number);
                    }}
                  >
                    <span className={`history-direction ${item.direction}`}>
                      {item.direction === "incoming" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                    <span className="history-copy">
                      <strong>{item.displayName || item.number}</strong>
                      <small>{item.displayName ? item.number : item.outcome}</small>
                    </span>
                    <span className="history-meta">
                      <small>{new Date(item.startedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small>
                      <small>{item.duration ? formatDuration(item.duration) : item.outcome}</small>
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="dialer-card" aria-label="Phone dialer">
          <div className="call-state-line" aria-live="polite">
            <span className={`status-dot ${callStatus === "active" ? "status-registered" : ""}`} />
            {CALL_LABELS[callStatus]}
          </div>

          {callInProgress ? (
            <div className="active-call-view">
              <div className={`caller-avatar ${callStatus === "incoming" ? "ringing-avatar" : ""}`}>
                {initials(primaryParty)}
                {callStatus === "incoming" && <span className="ring-wave wave-one" />}
                {callStatus === "incoming" && <span className="ring-wave wave-two" />}
              </div>
              <div className="caller-copy">
                <span>{currentParty.displayName || (callStatus === "incoming" ? "Incoming call" : "Calling")}</span>
                <h1>{currentParty.number || "Unknown caller"}</h1>
                <p>{callEstablished ? formatDuration(elapsed) : CALL_LABELS[callStatus]}</p>
              </div>

              {callStatus === "incoming" ? (
                <div className="incoming-actions">
                  <button type="button" className="round-action decline" onClick={declineCall} aria-label="Decline call">
                    <PhoneOff size={25} />
                    <span>Decline</span>
                  </button>
                  {can("RECEIVE_CALLS") && <button type="button" className="round-action answer" onClick={answerCall} aria-label="Answer call">
                    <PhoneIncoming size={25} />
                    <span>Answer</span>
                  </button>}
                </div>
              ) : (
                <>
                  <div className="call-controls">
                    <button
                      type="button"
                      className={`control-button ${muted ? "selected" : ""}`}
                      onClick={toggleMute}
                      disabled={!callEstablished}
                    >
                      {muted ? <MicOff size={21} /> : <Mic size={21} />}
                      <span>{muted ? "Unmute" : "Mute"}</span>
                    </button>
                    {can("HOLD_CALL") && <button
                      type="button"
                      className={`control-button ${held ? "selected" : ""}`}
                      onClick={toggleHold}
                      disabled={!callEstablished}
                    >
                      {held ? <Play size={21} /> : <Pause size={21} />}
                      <span>{held ? "Resume" : "Hold"}</span>
                    </button>}
                    {can("BLIND_TRANSFER") && <button
                      type="button"
                      className="control-button"
                      onClick={transferCall}
                      disabled={!callEstablished}
                    >
                      <ArrowUpRight size={21} />
                      <span>Transfer</span>
                    </button>}
                    {can("WARM_TRANSFER") && <button
  type="button"
  className="control-button"
  onClick={startWarmTransfer}
  disabled={!callEstablished || transferStage !== "idle"}
>
  <ArrowUpRight size={21} />
  <span>
    {transferStage === "idle"
      ? "Warm Transfer"
      : "Transferring..."}
  </span>
</button>}
{can("WARM_TRANSFER") && transferStage === "ready" && conferenceId && (
  <button
    type="button"
    className="control-button"
    onClick={completeWarmTransfer}
  >
    <ArrowUpRight size={21} />
    <span>Complete Transfer</span>
  </button>
)}
{can("ADD_PARTICIPANT") && <button
  type="button"
  className="control-button"
  onClick={addPstnParticipant}
  disabled={!callEstablished}
>
  <ArrowUpRight size={21} />
  <span>Add Participant</span>
</button>}
                    <button type="button" className="control-button danger-control" onClick={hangup}>
                      <PhoneOff size={21} />
                      <span>Hang up</span>
                    </button>
                  </div>

                  {callEstablished && can("SEND_DTMF") && (
                    <div className="in-call-keypad" aria-label="DTMF keypad">
                      {KEYPAD.map(([key, letters]) => (
                        <button type="button" key={key} onClick={() => pressKey(key)} aria-label={`Send DTMF ${key}`}>
                          <strong>{key}</strong>
                          <small>{letters}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="idle-dialer-view">
              <div className="number-entry">
                <span>Enter number</span>
                <div className="number-line">
                  <input
                    value={dialNumber}
                    onChange={(event) => setDialNumber(normalizeDialString(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") placeCall(event);
                    }}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+1 555 000 0000"
                    aria-label="Phone number"
                  />
                  <button
                    type="button"
                    className="backspace-button"
                    onClick={() => setDialNumber((current) => current.slice(0, -1))}
                    disabled={!dialNumber}
                    aria-label="Delete last digit"
                  >
                    <DeleteKey size={21} />
                  </button>
                </div>
              </div>

              <div className="keypad" aria-label="Dial pad">
                {KEYPAD.map(([key, letters]) => (
                  <button type="button" key={key} onClick={() => pressKey(key)} aria-label={`Dial ${key}`}>
                    <strong>{key}</strong>
                    <small>{letters}</small>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="call-button"
                onClick={placeCall}
                disabled={!can("MAKE_CALLS") || !isRegistered || !isValidDialString(dialNumber)}
                aria-label="Start call"
              >
                <PhoneCall size={25} />
              </button>
              <p className="dialer-help">
                {!can("MAKE_CALLS") ? "Outbound calling is disabled for your role." : isRegistered ? "Calls are routed through your tenant-aware Asterisk setup." : "Connect your SIP account to enable calling."}
              </p>
            </div>
          )}
        </section>

        <aside className="right-column">
          <section className="panel audio-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Audio</span>
                <h2>Device setup</h2>
              </div>
              <Headphones size={20} />
            </div>
            <div className="device-summary">
              <span className={`device-icon ${deviceStatus}`}><Mic size={18} /></span>
              <div>
                <strong>Microphone</strong>
                <small>{deviceLabel}</small>
              </div>
              {deviceStatus === "ready" && <Check className="success-icon" size={18} />}
            </div>
            <button
              type="button"
              className="button secondary full"
              onClick={() => refreshDevices(true)}
              disabled={callInProgress}
            >
              <Mic size={17} /> Check microphone
            </button>
            <label className="select-label">
              <span>Microphone input</span>
              <select
                value={microphoneId}
                onChange={(event) => setMicrophoneId(event.target.value)}
                disabled={settingsLocked || callInProgress || microphones.length === 0}
              >
                <option value="">System default</option>
                {microphones.map((device, index) => (
                  <option value={device.deviceId} key={device.deviceId || index}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-label">
              <span>Speaker output</span>
              <select
                value={speakerId}
                onChange={(event) => selectSpeaker(event.target.value)}
                disabled={!supportsAudioOutput || speakers.length === 0}
              >
                <option value="">System default</option>
                {speakers.map((device, index) => (
                  <option value={device.deviceId} key={device.deviceId || index}>
                    {device.label || `Speaker ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-help">Disconnect before changing the microphone. Speaker selection depends on browser support.</p>
          </section>

          <section className="panel system-panel">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">Live checks</span>
                <h2>System status</h2>
              </div>
              <Signal size={19} />
            </div>
            <ul className="check-list">
              <li>
                <span className={`check-mark ${secureContext ? "ok" : "bad"}`}>{secureContext ? <Check size={14} /> : <CircleAlert size={14} />}</span>
                <span><strong>Secure page</strong><small>{secureContext ? "HTTPS active" : "HTTPS required"}</small></span>
              </li>
              <li>
                <span className={`check-mark ${online ? "ok" : "bad"}`}>{online ? <Check size={14} /> : <CircleAlert size={14} />}</span>
                <span><strong>Network</strong><small>{online ? "Browser online" : "Browser offline"}</small></span>
              </li>
              <li>
                <span className={`check-mark ${isRegistered ? "ok" : "neutral"}`}>{isRegistered ? <Check size={14} /> : <Clock3 size={14} />}</span>
                <span><strong>Asterisk SIP</strong><small>{isRegistered ? "Registered" : "Waiting for login"}</small></span>
              </li>
            </ul>
            <div className="endpoint-box">
              <span>WebSocket endpoint</span>
              <code>{config.wssUrl}</code>
            </div>
          </section>

          <div className="safety-note">
            <ShieldCheck size={18} />
            <p><strong>Credential safety</strong><span>Your SIP password is never written into the app bundle or permanent browser storage.</span></p>
          </div>
        </aside>
      </main>

      {(error || notice || !online) && (
        <div className={`toast ${error || !online ? "toast-error" : "toast-success"}`} role="status" aria-live="polite">
          {error || (!online ? "Internet connection lost." : notice)}
          {error && <button type="button" onClick={() => setError("")} aria-label="Dismiss message">×</button>}
        </div>
      )}

      <footer>
        <span>Ringnex Contact Center v1.0</span>
        <span>Browser calling over WSS + DTLS-SRTP</span>
        <span>Emergency calling requires separate E911 configuration.</span>
      </footer>
    </div>
  );
}

export default Softphone;
