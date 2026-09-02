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
  X
} from "lucide-react";

import AudioPlayer from "../../components/ui/AudioPlayer";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { api, recordingBlob } from "../../lib/api";
import { Filters, Pagination, formatDate, formatSeconds, useAgentOptions } from "./shared";

const otherParty = (call) => (call.direction === "OUTBOUND" ? call.to_number : call.from_number) || "";
const SORT_VALUE = {
  number: otherParty,
  agent: (c) => c.agent_name || c.agent_sip_username || "",
  direction: (c) => c.direction || "",
  duration: (c) => Number(c.billable_sec) || 0,
  started: (c) => c.started_at || ""
};

export default function RecordingsPage() {
  const agents = useAgentOptions();
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", search: "" });
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [audio, setAudio] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState(null); // { key, dir }

  const sortedRows = useMemo(() => {
    if (!sort) return result.rows;
    const get = SORT_VALUE[sort.key] || (() => "");
    return [...result.rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "desc" ? -cmp : cmp;
    });
  }, [result.rows, sort]);
  const toggleSort = (key) =>
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ page: String(page), pageSize: "25" });
        Object.entries(filters).forEach(([key, value]) => {
          if (value) query.set(key, value);
        });
        setResult(await api(`/recordings?${query.toString()}`));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => {
    if (audio?.url) URL.revokeObjectURL(audio.url);
  }, [audio]);

  const play = async (call) => {
    setError("");
    setPlayingId(call.id);
    try {
      if (audio?.url) URL.revokeObjectURL(audio.url);
      setAudio({ call, url: await recordingBlob(call.id) });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPlayingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader
        eyebrow="CALL MEDIA"
        title="Recordings"
        description="Search and play recordings by agent and date without mixing them into call logs."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => load(result.page)}>
            Refresh
          </Button>
        }
      />

      <Card>
        <Filters filters={filters} setFilters={setFilters} onApply={() => load(1)} agents={agents} loading={loading} />
      </Card>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <Card compact title="Available recordings" description={`${result.total} matching recordings`} icon={FileAudio}>
        {loading ? (
          <SkeletonTable rows={6} cols={6} />
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
                      ["duration", "Duration"],
                      ["started", "Date & time"],
                      [null, "Recording"]
                    ].map(([key, label]) => {
                      const active = sort?.key === key;
                      return (
                        <th key={label} className="h-10 whitespace-nowrap px-4 text-left font-semibold">
                          {key ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(key)}
                              className={"inline-flex items-center gap-1 transition-colors hover:text-text " + (active ? "text-text" : "")}
                            >
                              {label}
                              {active ? (
                                sort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
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
                        <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-success">
                          {formatSeconds(call.billable_sec)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(call.started_at)}</td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={PlayCircle}
                            loading={playingId === call.id}
                            onClick={() => play(call)}
                          >
                            Play
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState title="No matching recordings" />
        )}
        <Pagination result={result} load={load} />
      </Card>

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
                <FileAudio size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">
                  {audio.call.agent_name || audio.call.agent_sip_username || "Recording"}
                </p>
                <p className="truncate text-xs text-muted">
                  {formatDate(audio.call.started_at)} · {audio.call.from_number} → {audio.call.to_number}
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
