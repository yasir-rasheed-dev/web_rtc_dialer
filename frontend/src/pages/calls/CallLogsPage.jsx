import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FileAudio,
  PhoneIncoming,
  PhoneOutgoing,
  PlayCircle,
  RefreshCw,
  Voicemail,
  X
} from "lucide-react";

import AudioPlayer from "../../components/ui/AudioPlayer";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Button from "../../components/ui/Button";
import { api, getCallCounts, getVoicemailCounts, markVoicemailHeard, recordingBlob, voicemailBlob } from "../../lib/api";
import { Filters, Pagination, formatDate, formatSeconds, useAgentOptions } from "./shared";

// Each tab maps to its own extra query params on top of the shared
// filters — `outcome=missed` (not direction+connected) so the Missed tab
// uses the exact same server-side definition (MISSED_CALL_SQL in
// server.js) as the counts endpoint's own "missed" SUM. Keeping list and
// counts on one shared predicate is what guarantees they can't disagree.
//
// "Voicemail" is deliberately NOT one of these — it's not a filtered view
// of /api/calls at all, it's its own data source (/api/voicemails, see
// backend/src/voicemailRoutes.js), rendered with its own column set below.
const TABS = [
  { id: "all", label: "All", countKey: "all", params: {} },
  { id: "incoming", label: "Incoming", countKey: "incoming", params: { direction: "INBOUND" } },
  { id: "outgoing", label: "Outgoing", countKey: "outgoing", params: { direction: "OUTBOUND" } },
  { id: "missed", label: "Missed", countKey: "missed", params: { outcome: "missed" } }
];

// Everyone who was actually on the call — the attributed agent plus any
// warm-transfer targets / added PSTN parties. Supervisor listen/whisper/
// barge legs are never recorded here (the backend drops them entirely).
function ParticipantCells({ participants }) {
  const list = Array.isArray(participants) ? participants : [];
  if (list.length <= 1) return <span className="text-muted/60">—</span>;
  const label = (p) => p.name || p.number || p.extension || "Unknown";
  const shown = list.slice(0, 3);
  const extra = list.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1.5" title={list.map(label).join(", ")}>
      {shown.map((p, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text"
        >
          <span
            className={
              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold " +
              (p.type === "pstn" ? "bg-accent/15 text-accent" : "bg-brand/10 text-brand")
            }
          >
            {label(p).slice(0, 1).toUpperCase()}
          </span>
          <span className="max-w-[120px] truncate">{label(p)}</span>
        </span>
      ))}
      {extra > 0 && <span className="text-[11px] font-medium text-muted">+{extra}</span>}
    </span>
  );
}

function TabBar({ tab, counts, countsLoading, showVoicemail, vmUnheard, onSelect }) {
  const pill = (id, label, count, highlight) => {
    const active = tab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelect(id)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
          active
            ? "border-brand bg-brand text-white"
            : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
        }`}
      >
        {label}
        <span
          className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
            active ? "bg-white/20 text-white" : highlight && count > 0 ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted"
          }`}
        >
          {count ?? 0}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => pill(t.id, t.label, countsLoading ? "…" : counts[t.countKey] ?? 0, t.id === "missed"))}
      {showVoicemail && pill("voicemail", "Voicemail", vmUnheard, true)}
    </div>
  );
}

export default function CallLogsPage({ permissions = [], onVoicemailHeard }) {
  const canPlayRecordings = permissions.includes("VIEW_RECORDINGS");
  const canViewVoicemails = permissions.includes("VIEW_VOICEMAILS");
  const agents = useAgentOptions();
  const [tab, setTab] = useState("all");
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", status: "", search: "" });
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [counts, setCounts] = useState({ all: 0, incoming: 0, outgoing: 0, missed: 0 });
  const [loading, setLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [error, setError] = useState("");
  const [audio, setAudio] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [callSort, setCallSort] = useState(null); // { key, dir }

  // Client-side sort of just the current page — the server owns paging and
  // filtering; this only reorders the ~25 rows already on screen.
  const otherParty = (call) => (call.direction === "OUTBOUND" ? call.to_number : call.from_number) || "";
  const SORT_VALUE = {
    number: otherParty,
    agent: (c) => c.agent_name || c.agent_sip_username || "",
    direction: (c) => c.direction || "",
    status: (c) => (c.answered_at ? 1 : 0),
    duration: (c) => Number(c.billable_sec) || 0,
    started: (c) => c.started_at || ""
  };
  const sortedRows = useMemo(() => {
    if (!callSort) return result.rows;
    const get = SORT_VALUE[callSort.key] || (() => "");
    return [...result.rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return callSort.dir === "desc" ? -cmp : cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.rows, callSort]);
  const toggleCallSort = (key) =>
    setCallSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });

  const [vmResult, setVmResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [vmLoading, setVmLoading] = useState(false);
  const [vmUnheard, setVmUnheard] = useState(0);

  const load = useCallback(
    async (page, activeTab, activeFilters) => {
      setLoading(true);
      setError("");
      try {
        const tabParams = TABS.find((t) => t.id === activeTab)?.params || {};
        const query = new URLSearchParams({ page: String(page), pageSize: "25" });
        Object.entries(activeFilters).forEach(([key, value]) => {
          if (value) query.set(key, value);
        });
        Object.entries(tabParams).forEach(([key, value]) => query.set(key, value));
        setResult(await api(`/calls?${query.toString()}`));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Counts intentionally use only the SHARED filters (date/agent/search —
  // never `status`, which is an additional refinement within whichever
  // tab is active, not a tab-defining filter) — this is what keeps every
  // tab's number stable no matter which tab you're looking at.
  const loadCounts = useCallback(async (activeFilters) => {
    setCountsLoading(true);
    try {
      const { status: _status, ...shared } = activeFilters;
      setCounts(await getCallCounts(shared));
    } catch {
      // Counts annotate the tabs; a failed fetch shouldn't block the page
      // — leave the last-known numbers showing instead of erroring out.
    } finally {
      setCountsLoading(false);
    }
  }, []);

  const loadVoicemails = useCallback(
    async (page) => {
      setVmLoading(true);
      setError("");
      try {
        const { status: _status, ...shared } = filters;
        const query = new URLSearchParams({ page: String(page), pageSize: "25" });
        Object.entries(shared).forEach(([key, value]) => {
          if (value) query.set(key, value);
        });
        setVmResult(await api(`/voicemails?${query.toString()}`));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setVmLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    load(1, "all", filters);
    loadCounts(filters);
    if (canViewVoicemails) {
      getVoicemailCounts()
        .then((r) => setVmUnheard(r.unheard || 0))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTab = (tabId) => {
    setTab(tabId);
    if (tabId === "voicemail") loadVoicemails(1);
    else load(1, tabId, filters);
  };

  const applyFilters = () => {
    if (tab === "voicemail") {
      loadVoicemails(1);
    } else {
      load(1, tab, filters);
      loadCounts(filters);
    }
  };

  useEffect(
    () => () => {
      if (audio?.url) URL.revokeObjectURL(audio.url);
    },
    [audio]
  );

  const play = async (call) => {
    setError("");
    setPlayingId(call.id);
    try {
      if (audio?.url) URL.revokeObjectURL(audio.url);
      setAudio({ kind: "call", item: call, url: await recordingBlob(call.id) });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPlayingId(null);
    }
  };

  const playVoicemail = async (voicemail) => {
    setError("");
    setPlayingId(voicemail.id);
    try {
      if (!voicemail.heard_at) {
        markVoicemailHeard(voicemail.id).catch(() => undefined);
        setVmResult((current) => ({
          ...current,
          rows: current.rows.map((row) => (row.id === voicemail.id ? { ...row, heard_at: new Date().toISOString() } : row))
        }));
        setVmUnheard((current) => Math.max(0, current - 1));
        onVoicemailHeard?.();
      }
      if (audio?.url) URL.revokeObjectURL(audio.url);
      setAudio({ kind: "voicemail", item: voicemail, url: await voicemailBlob(voicemail.id) });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPlayingId(null);
    }
  };

  const showingVoicemail = tab === "voicemail";

  return (
    <div className="flex flex-col gap-4 pb-20">
      <PageHeader
        eyebrow="CONVERSATION HISTORY"
        title="Call Logs"
        description="Filter tenant call history by agent, date and outcome."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={showingVoicemail ? vmLoading : loading}
            onClick={() => (showingVoicemail ? loadVoicemails(vmResult.page) : load(result.page, tab, filters))}
          >
            Refresh
          </Button>
        }
      />

      <TabBar
        tab={tab}
        counts={counts}
        countsLoading={countsLoading}
        showVoicemail={canViewVoicemails}
        vmUnheard={vmUnheard}
        onSelect={selectTab}
      />

      <Card compact>
        <Filters
          filters={filters}
          setFilters={setFilters}
          onApply={applyFilters}
          agents={agents}
          includeCallFilters={!showingVoicemail}
          loading={showingVoicemail ? vmLoading : loading}
        />
      </Card>

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {showingVoicemail ? (
        <Card compact title="Voicemails" description={`${vmResult.total} matching voicemails`} icon={Voicemail}>
          <div className="overflow-x-auto">
            {vmLoading ? (
              <SkeletonTable rows={6} cols={6} />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4">Received</th>
                    <th className="pb-2 pr-4">Agent</th>
                    <th className="pb-2 pr-4">From</th>
                    <th className="pb-2 pr-4">Duration</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Play</th>
                  </tr>
                </thead>
                <tbody>
                  {vmResult.rows.map((voicemail) => (
                    <tr key={voicemail.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 text-muted">{formatDate(voicemail.created_at)}</td>
                      <td className="py-2 pr-4 font-medium text-text">{voicemail.agent_name || "—"}</td>
                      <td className="py-2 pr-4 text-muted">{voicemail.from_number || "—"}</td>
                      <td className="py-2 pr-4 text-muted">{formatSeconds(voicemail.duration_sec)}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge tone={voicemail.heard_at ? "neutral" : "brand"}>
                          {voicemail.heard_at ? "Heard" : "New"}
                        </StatusBadge>
                      </td>
                      <td className="py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={PlayCircle}
                          loading={playingId === voicemail.id}
                          onClick={() => playVoicemail(voicemail)}
                        >
                          Play
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!vmLoading && !vmResult.rows.length && <EmptyState icon={Voicemail} title="No voicemails yet" />}
          </div>
          <Pagination result={vmResult} load={(page) => loadVoicemails(page)} />
        </Card>
      ) : (
        <Card compact title="Call records" description={`${result.total} matching records`}>
          {loading ? (
            <SkeletonTable rows={6} cols={7} />
          ) : sortedRows.length ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {[
                        ["number", "Number"],
                        ["agent", "Agent"],
                        ["direction", "Direction"],
                        ["status", "Status"],
                        ["duration", "Duration"],
                        ["started", "Date & time"],
                        [null, "Participants"],
                        [null, "Recording"]
                      ].map(([key, label]) => {
                        const active = callSort?.key === key;
                        return (
                          <th key={label} className="h-10 whitespace-nowrap px-4 text-left font-semibold">
                            {key ? (
                              <button
                                type="button"
                                onClick={() => toggleCallSort(key)}
                                className={"inline-flex items-center gap-1 transition-colors hover:text-text " + (active ? "text-text" : "")}
                              >
                                {label}
                                {active ? (
                                  callSort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                                ) : (
                                  <ChevronsUpDown size={13} className="opacity-50" />
                                )}
                              </button>
                            ) : (
                              label
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((call) => {
                      const connected = Boolean(call.answered_at);
                      const outbound = call.direction === "OUTBOUND";
                      const agentName = call.agent_name || call.agent_sip_username || "—";
                      return (
                        <tr key={call.id} className="border-t border-border transition-colors hover:bg-surface-2">
                          <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-text">
                            {otherParty(call) || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2.5">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                                {agentName.slice(0, 1).toUpperCase()}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-text">{agentName}</span>
                                {call.agent_sip_username && (
                                  <span className="block truncate text-[11px] text-muted">{call.agent_sip_username}</span>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={"inline-flex items-center gap-1.5 font-medium " + (outbound ? "text-brand" : "text-accent")}>
                              {outbound ? <PhoneOutgoing size={14} /> : <PhoneIncoming size={14} />}
                              {outbound ? "Outbound" : "Inbound"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {connected ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connected
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-muted">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted" /> {call.status || "No answer"}
                              </span>
                            )}
                          </td>
                          <td className={"whitespace-nowrap px-4 py-3 tabular-nums " + (connected ? "font-semibold text-success" : "text-muted")}>
                            {connected ? formatSeconds(call.billable_sec) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(call.started_at)}</td>
                          <td className="px-4 py-3">
                            <ParticipantCells participants={call.participants} />
                          </td>
                          <td className="px-4 py-3">
                            {call.recording_name && canPlayRecordings ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={PlayCircle}
                                loading={playingId === call.id}
                                onClick={() => play(call)}
                              >
                                Play
                              </Button>
                            ) : (
                              <span className="text-muted/60">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState title="No matching calls" />
          )}
          <Pagination result={result} load={(page) => load(page, tab, filters)} />
        </Card>
      )}

      <AnimatePresence>
        {audio && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-x-4 bottom-4 z-40 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:inset-x-auto sm:right-6 sm:w-[440px]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                {audio.kind === "voicemail" ? <Voicemail size={17} /> : <FileAudio size={17} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">
                  {audio.kind === "voicemail"
                    ? audio.item.agent_name || "Voicemail"
                    : audio.item.agent_name || audio.item.agent_sip_username || "Recording"}
                </p>
                <p className="truncate text-xs text-muted">
                  {audio.kind === "voicemail"
                    ? `${formatDate(audio.item.created_at)} · ${audio.item.from_number || "—"}`
                    : `${formatDate(audio.item.started_at)} · ${audio.item.from_number} → ${audio.item.to_number}`}
                </p>
              </div>
              <button
                onClick={() => setAudio(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              >
                <X size={16} />
              </button>
            </div>
            <AudioPlayer src={audio.url} autoPlay />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
