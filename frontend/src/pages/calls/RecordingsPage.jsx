import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileAudio, RefreshCw, X } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { api, recordingBlob } from "../../lib/api";
import { Filters, Pagination, formatDate, formatSeconds, useAgentOptions } from "./shared";

export default function RecordingsPage() {
  const agents = useAgentOptions();
  const [filters, setFilters] = useState({ from: "", to: "", agentId: "", search: "" });
  const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [audio, setAudio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    try {
      if (audio?.url) URL.revokeObjectURL(audio.url);
      setAudio({ call, url: await recordingBlob(call.id) });
    } catch (requestError) {
      setError(requestError.message);
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

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card title="Available recordings" description={`${result.total} matching recordings`} icon={FileAudio}>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} cols={7} />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2 pr-4">Agent</th>
                  <th className="pb-2 pr-4">Direction</th>
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2 pr-4">Talk time</th>
                  <th className="pb-2">Recording</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((call) => (
                  <tr key={call.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 text-muted">{formatDate(call.started_at)}</td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text">{call.agent_name || call.agent_sip_username || "—"}</p>
                      {call.agent_sip_username && <p className="text-xs text-muted">{call.agent_sip_username}</p>}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone="brand">{call.direction}</StatusBadge>
                    </td>
                    <td className="py-3 pr-4 text-muted">{call.from_number || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{call.to_number || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{formatSeconds(call.billable_sec)}</td>
                    <td className="py-3">
                      <Button size="sm" variant="ghost" icon={FileAudio} onClick={() => play(call)}>
                        Play
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !result.rows.length && <EmptyState title="No matching recordings" />}
        </div>
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
            <audio src={audio.url} controls autoPlay className="w-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
