import { useCallback, useEffect, useState } from "react";
import { AlarmClock, CalendarCheck, CheckCircle2, ListTodo } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { formatDate } from "../calls/shared";
import { completeFollowUp, getFollowUpKpis, getFollowUps } from "../../lib/leadsApi";
import { notifyError, notifySuccess } from "../../lib/toast";

function KpiCard({ label, value, icon: Icon, tone }) {
  const toneClass =
    tone === "danger" ? "bg-danger-soft text-danger" : tone === "brand" ? "bg-brand/10 text-brand" : "bg-surface-3 text-muted";
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold text-text">{value}</p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon size={17} />
        </span>
      </div>
    </Card>
  );
}

const TABS = [
  { id: "missed", label: "Missed" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" }
];

export default function FollowUpsPage() {
  const [kpis, setKpis] = useState({ total: 0, today: 0, missed: 0 });
  const [when, setWhen] = useState("missed");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadKpis = useCallback(() => {
    getFollowUpKpis().then(setKpis).catch(() => undefined);
  }, []);

  const loadRows = useCallback((tab) => {
    setLoading(true);
    getFollowUps({ when: tab })
      .then((result) => setRows(result.rows || []))
      .catch((e) => notifyError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    loadRows(when);
  }, [when, loadRows]);

  const markDone = async (interactionId) => {
    try {
      await completeFollowUp(interactionId);
      notifySuccess("Follow-up marked done");
      setRows((current) => current.filter((row) => row.id !== interactionId));
      loadKpis();
    } catch (e) {
      notifyError(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="RELATIONSHIP MANAGEMENT" title="Follow-ups" description="Every scheduled follow-up across your leads." />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Open follow-ups" value={kpis.total} icon={ListTodo} />
        <KpiCard label="Today" value={kpis.today} icon={CalendarCheck} tone="brand" />
        <KpiCard label="Missed" value={kpis.missed} icon={AlarmClock} tone="danger" />
      </div>

      <Card compact>
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setWhen(tab.id)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                when === tab.id
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      <Card compact title="Follow-ups" description={`${rows.length} in this view`}>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={5} cols={5} />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Lead</th>
                  <th className="pb-2 pr-4">Phone</th>
                  <th className="pb-2 pr-4">Scheduled</th>
                  <th className="pb-2 pr-4">Agent</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-text">{row.lead_name || "—"}</td>
                    <td className="py-2.5 pr-4 text-muted">{row.lead_phone}</td>
                    <td className="py-2.5 pr-4 text-muted">{formatDate(row.follow_up_at)}</td>
                    <td className="py-2.5 pr-4 text-muted">{row.agent_name || "—"}</td>
                    <td className="py-2.5">
                      <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => markDone(row.id)}>
                        Mark done
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !rows.length && <EmptyState icon={ListTodo} title="Nothing here" description="No follow-ups in this view." />}
        </div>
      </Card>
    </div>
  );
}
