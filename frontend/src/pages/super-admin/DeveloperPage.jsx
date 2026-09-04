import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Cpu,
  Database,
  Pause,
  Phone,
  Play,
  RefreshCw,
  Server,
  Trash2,
  Users
} from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import Input from "../../components/ui/Input";
import { notifyError, notifySuccess } from "../../lib/toast";
import { superApi } from "../../lib/api";

const OVERVIEW_MS = 5000;
const FEED_MS = 2500;

function fmtUptime(sec = 0) {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

const clock = (t) =>
  new Date(t).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

const LOG_TONE = {
  error: "text-danger",
  warn: "text-warning",
  info: "text-text",
  debug: "text-muted"
};

const STATE_OPTIONS = [
  { value: "auto", label: "Auto (live health check)" },
  { value: "operational", label: "Operational" },
  { value: "degraded", label: "Degraded" },
  { value: "maintenance", label: "Under maintenance" },
  { value: "down", label: "Down / under development" }
];

const STATE_BADGE = {
  operational: "bg-success-soft text-success",
  degraded: "bg-warning-soft text-warning",
  maintenance: "bg-brand/10 text-brand",
  down: "bg-danger-soft text-danger"
};

// A scrolling, auto-tailing log/event panel with pause + clear.
function FeedPanel({ title, icon: Icon, lines, onClear, paused, setPaused, footer, renderLine }) {
  const boxRef = useRef(null);
  const stick = useRef(true);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  useEffect(() => {
    if (paused || !stick.current) return;
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, paused]);

  return (
    <Card
      title={title}
      icon={Icon}
      actions={
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" icon={paused ? Play : Pause} onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={onClear}>
            Clear
          </Button>
        </div>
      }
    >
      <div
        ref={boxRef}
        onScroll={onScroll}
        className="h-[340px] overflow-y-auto rounded-lg border border-border bg-[#0b1020] p-3 font-mono text-[11px] leading-relaxed text-slate-200"
      >
        {lines.length === 0 ? (
          <p className="text-slate-500">Waiting for activity…</p>
        ) : (
          lines.map(renderLine)
        )}
      </div>
      {footer && <p className="mt-2 text-[11px] text-muted">{footer}</p>}
    </Card>
  );
}

export default function DeveloperPage() {
  const [overview, setOverview] = useState(null);
  const [ovError, setOvError] = useState("");

  const [logs, setLogs] = useState([]);
  const [logPaused, setLogPaused] = useState(false);
  const [logLevel, setLogLevel] = useState("all");
  const logCursor = useRef(0);

  const [ami, setAmi] = useState([]);
  const [amiPaused, setAmiPaused] = useState(false);
  const amiCursor = useRef(0);

  const [statusRows, setStatusRows] = useState([]);
  const [savingKey, setSavingKey] = useState(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await superApi("/super-admin/dev/overview"));
      setOvError("");
    } catch (e) {
      setOvError(e.message);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const r = await superApi("/super-admin/status");
      setStatusRows(
        (r.components || []).map((c) => ({
          ...c,
          _state: c.overrideState || "auto",
          _message: c.overrideMessage || "",
          _eta: c.etaAt ? c.etaAt.slice(0, 16) : ""
        }))
      );
    } catch (e) {
      notifyError(e.message);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadStatus();
    const t = setInterval(loadOverview, OVERVIEW_MS);
    return () => clearInterval(t);
  }, [loadOverview, loadStatus]);

  // Log + AMI feed polling (independent of the pause toggles — pause only
  // stops auto-scroll and trimming so you can read; data keeps arriving).
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await superApi(`/super-admin/dev/logs?after=${logCursor.current}`);
        if (!alive) return;
        logCursor.current = r.cursor || logCursor.current;
        if (r.lines?.length) setLogs((cur) => [...cur, ...r.lines].slice(-1200));
      } catch {
        /* transient */
      }
    };
    tick();
    const t = setInterval(tick, FEED_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await superApi(`/super-admin/dev/ami?after=${amiCursor.current}`);
        if (!alive) return;
        amiCursor.current = r.cursor || amiCursor.current;
        if (r.events?.length) setAmi((cur) => [...cur, ...r.events].slice(-1000));
      } catch {
        /* transient */
      }
    };
    tick();
    const t = setInterval(tick, FEED_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const saveStatus = async (row) => {
    setSavingKey(row.key);
    try {
      await superApi(`/super-admin/status/${row.key}`, {
        method: "PUT",
        body: {
          overrideState: row._state,
          overrideMessage: row._message,
          etaAt: row._eta ? new Date(row._eta).toISOString() : null
        }
      });
      notifySuccess(`${row.name} status saved`);
      loadStatus();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setSavingKey(null);
    }
  };

  const shownLogs = logs.filter((l) => logLevel === "all" || l.level === logLevel);
  const p = overview?.process;
  const svc = overview?.services;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="DEVELOPER"
        title="Developer dashboard"
        description="Live platform metrics, application + Asterisk activity, and public status control — no SSH needed."
        actions={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={loadOverview}>Refresh</Button>}
      />

      {ovError && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{ovError}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Workspaces" value={overview?.tenants.total ?? "—"} detail={`${overview?.tenants.active ?? 0} active · ${overview?.tenants.trial ?? 0} trial`} icon={Server} />
        <KpiCard label="Users (total)" value={overview?.users.total ?? "—"} detail={`${overview?.users.active ?? 0} active · ${overview?.users.owners ?? 0} owners`} icon={Users} />
        <KpiCard label="SIP users" value={overview?.users.sip ?? "—"} detail={`${overview?.users.sipActive ?? 0} active`} icon={Phone} tone="orange" />
        <KpiCard label="Live agents" value={overview?.live.agentsOnline ?? "—"} detail={`${overview?.live.agentsOnCall ?? 0} on a call`} icon={Activity} tone="green" />
        <KpiCard label="Live calls" value={overview?.live.calls ?? "—"} detail={`${overview?.calls24h ?? 0} in last 24h`} icon={Phone} />
        <KpiCard label="Database" value={svc ? (svc.database ? "Online" : "Down") : "—"} detail="Primary MySQL" icon={Database} tone={svc?.database ? "green" : "red"} />
        <KpiCard label="Telephony (AMI)" value={svc ? (svc.ami ? "Connected" : "Offline") : "—"} detail={svc?.amiHost ? `${svc.amiHost}:${svc.amiPort}` : "Asterisk manager"} icon={Phone} tone={svc?.ami ? "green" : "red"} />
        <KpiCard label="API uptime" value={p ? fmtUptime(p.uptimeSec) : "—"} detail={p ? `v${p.version} · ${p.node}` : ""} icon={Cpu} />
      </div>

      {p && (
        <Card title="Backend process" icon={Server}>
          <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Row k="Version" v={`v${p.version}`} />
            <Row k="Node" v={p.node} />
            <Row k="Environment" v={p.env} />
            <Row k="PID" v={p.pid} />
            <Row k="Started" v={new Date(p.startedAt).toLocaleString()} />
            <Row k="Uptime" v={fmtUptime(p.uptimeSec)} />
            <Row k="Memory (RSS)" v={`${p.rssMb} MB`} />
            <Row k="Heap" v={`${p.heapUsedMb} / ${p.heapTotalMb} MB`} />
            <Row k="Presence tracked" v={overview?.live.presenceTracked ?? 0} />
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <FeedPanel
          title="Application log"
          icon={Server}
          lines={shownLogs}
          paused={logPaused}
          setPaused={setLogPaused}
          onClear={() => setLogs([])}
          footer={
            <span className="flex items-center gap-2">
              Level:
              {["all", "info", "warn", "error", "debug"].map((lv) => (
                <button
                  key={lv}
                  type="button"
                  onClick={() => setLogLevel(lv)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${logLevel === lv ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text"}`}
                >
                  {lv}
                </button>
              ))}
            </span>
          }
          renderLine={(l) => (
            <div key={l.seq} className="whitespace-pre-wrap break-words">
              <span className="text-slate-500">{clock(l.t)} </span>
              <span className={`font-semibold uppercase ${LOG_TONE[l.level] || "text-slate-300"}`}>{l.level.slice(0, 4)}</span>
              <span className="text-slate-500"> · </span>
              <span className="text-slate-200">{l.message}</span>
            </div>
          )}
        />
        <FeedPanel
          title="Asterisk activity (AMI)"
          icon={Phone}
          lines={ami}
          paused={amiPaused}
          setPaused={setAmiPaused}
          onClear={() => setAmi([])}
          footer={svc?.ami ? "Live AMI event stream." : "AMI is currently offline — no events."}
          renderLine={(e) => (
            <div key={e.seq} className="whitespace-pre-wrap break-words">
              <span className="text-slate-500">{clock(e.t)} </span>
              <span className="font-semibold text-emerald-400">{e.name}</span>
              {Object.entries(e.detail || {}).map(([k, v]) => (
                <span key={k} className="text-slate-400">
                  {" "}
                  {k}=<span className="text-slate-200">{v}</span>
                </span>
              ))}
            </div>
          )}
        />
      </div>

      <Card
        title="Public status page"
        description="Controls what ringnex.co/status shows. Leave a component on Auto to report its live health check; override it to announce an incident, maintenance window or a component still under development — with an optional ETA."
        icon={Activity}
      >
        <div className="flex flex-col divide-y divide-border">
          {statusRows.map((row, i) => (
            <div key={row.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-start">
              <div className="lg:w-52 lg:shrink-0">
                <p className="text-sm font-semibold text-text">{row.name}</p>
                <p className="font-mono text-[11px] text-muted">{row.key}</p>
                {row.overrideState && (
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATE_BADGE[row.overrideState]}`}>
                    override: {row.overrideState}
                  </span>
                )}
              </div>
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                  State
                  <Select
                    options={STATE_OPTIONS}
                    value={STATE_OPTIONS.find((o) => o.value === row._state) || STATE_OPTIONS[0]}
                    onChange={(o) => setStatusRows((rs) => rs.map((r, j) => (j === i ? { ...r, _state: o.value } : r)))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                  ETA back (optional)
                  <Input
                    type="datetime-local"
                    value={row._eta}
                    disabled={row._state === "auto"}
                    onChange={(e) => setStatusRows((rs) => rs.map((r, j) => (j === i ? { ...r, _eta: e.target.value } : r)))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                  Public message (optional)
                  <Input
                    value={row._message}
                    disabled={row._state === "auto"}
                    placeholder="e.g. Upgrading call servers — calls unaffected."
                    onChange={(e) => setStatusRows((rs) => rs.map((r, j) => (j === i ? { ...r, _message: e.target.value } : r)))}
                  />
                </label>
              </div>
              <div className="lg:pt-5">
                <Button size="sm" loading={savingKey === row.key} onClick={() => saveStatus(row)}>
                  Save
                </Button>
              </div>
            </div>
          ))}
          {!statusRows.length && <p className="py-4 text-sm text-muted">No components — run the 20260907 migration.</p>}
        </div>
      </Card>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-1.5">
      <span className="text-muted">{k}</span>
      <span className="font-medium text-text">{v}</span>
    </div>
  );
}
