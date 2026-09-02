import { useCallback, useEffect, useMemo, useState } from "react";
import { Headset, MonitorPlay, Phone, Plus, Trash2, Voicemail } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import Toggle from "../../components/ui/Toggle";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";
import {
  api,
  deleteTollFreeCampaign,
  deleteTollFreeIvr,
  getTollFreeCampaign,
  getTollFreeIvr,
  getTollFreeQueueStatus,
  listTollFreeCampaigns,
  listTollFreeIvrs,
  listTollFreeNumbers,
  updateTollFreeCampaign
} from "../../lib/api";

import { CreateCampaignModal, CreateIvrModal } from "./modals";

const QUEUE_STATUS_POLL_MS = 15000;

export default function TollFreePage({ permissions = [], isOwner = false }) {
  const can = (key) => permissions.includes(key);
  const canManage = can("MANAGE_TOLL_FREE_CAMPAIGNS");

  const [numbers, setNumbers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [ivrs, setIvrs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("campaigns");
  const [campaignModal, setCampaignModal] = useState({ open: false, campaign: null, agents: [] });
  const [ivrModal, setIvrModal] = useState({ open: false, ivr: null });
  // Keyed by campaign id -> { waiting, longestWaitSec } | undefined (still
  // loading). Polled, not pushed — a toll-free queue is low-traffic enough
  // that a plain interval is simpler than wiring a new socket channel for
  // it, and it self-heals if a poll fails (getTollFreeQueueStatus never
  // throws, see api.js).
  const [queueStatus, setQueueStatus] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [numbersResult, campaignsResult, ivrsResult, usersResult] = await Promise.all([
        listTollFreeNumbers(),
        listTollFreeCampaigns(),
        listTollFreeIvrs(),
        api("/users").catch(() => ({ users: [] }))
      ]);
      setNumbers(numbersResult);
      setCampaigns(campaignsResult);
      setIvrs(ivrsResult);
      setUsers(usersResult.users || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll live queue depth for every ACTIVE campaign. Runs independently of
  // `load()` so a slow/failed Asterisk poll never blocks the rest of the
  // page, and re-subscribes whenever the active campaign list changes.
  const activeCampaignIds = campaigns.filter((c) => c.status === "ACTIVE").map((c) => c.id).join(",");
  useEffect(() => {
    const ids = activeCampaignIds ? activeCampaignIds.split(",") : [];
    if (!ids.length) return undefined;
    let cancelled = false;
    const poll = () => {
      ids.forEach((id) => {
        getTollFreeQueueStatus(id)
          .then((status) => {
            if (!cancelled) setQueueStatus((current) => ({ ...current, [id]: status }));
          })
          .catch(() => {});
      });
    };
    poll();
    const timer = setInterval(poll, QUEUE_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeCampaignIds]);

  const toggleCampaignStatus = async (campaign) => {
    const nextStatus = campaign.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const result = await updateTollFreeCampaign(campaign.id, { status: nextStatus });
      notifySuccess(`"${campaign.name}" is now ${nextStatus === "ACTIVE" ? "active" : "inactive"}.`);
      if (result.asteriskSync && !result.asteriskSync.ok) {
        notifyError(`Status saved, but the Asterisk sync failed: ${result.asteriskSync.error}.`);
      }
      load();
    } catch (e) {
      notifyError(e.message);
    }
  };

  const removeCampaign = async (campaign) => {
    const confirmed = await confirmModal({
      title: "Delete campaign",
      message: `Delete "${campaign.name}"? The toll-free number stays yours, but calls to it won't reach any agent until you create a new campaign.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    try {
      await deleteTollFreeCampaign(campaign.id);
      notifySuccess("Campaign deleted.");
      load();
    } catch (e) {
      notifyError(e.message);
    }
  };

  const openEditCampaign = async (campaign) => {
    try {
      const detail = await getTollFreeCampaign(campaign.id);
      setCampaignModal({ open: true, campaign: detail.campaign, agents: detail.agents });
    } catch (e) {
      notifyError(e.message);
    }
  };

  const openEditIvr = async (ivr) => {
    try {
      const detail = await getTollFreeIvr(ivr.id);
      setIvrModal({ open: true, ivr: detail });
    } catch (e) {
      notifyError(e.message);
    }
  };

  const removeIvr = async (ivr) => {
    const confirmed = await confirmModal({
      title: "Delete IVR",
      message: `Delete "${ivr.name}"? Any campaign using it must be detached first.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    try {
      await deleteTollFreeIvr(ivr.id);
      notifySuccess("IVR deleted.");
      load();
    } catch (e) {
      notifyError(e.message);
    }
  };

  const unassignedNumbers = numbers.filter((n) => !n.campaign_id);

  const renderQueue = (campaign) => {
    if (campaign.status !== "ACTIVE") return <span className="text-muted/60">—</span>;
    const q = queueStatus[campaign.id];
    if (q === undefined) return <span className="text-xs text-muted">…</span>;
    if (q.ok === false)
      return (
        <span className="text-xs text-muted" title={q.error}>
          unavailable
        </span>
      );
    if (q.waiting > 0)
      return (
        <StatusBadge tone="warning">
          {q.waiting} waiting · {q.longestWaitSec}s
        </StatusBadge>
      );
    return <span className="text-xs text-muted">0 waiting</span>;
  };

  const campaignColumns = useMemo(
    () => [
      {
        key: "name",
        header: "Campaign",
        sortable: true,
        cellClassName: "text-text",
        cell: (c) => <span className="font-medium">{c.name}</span>
      },
      { key: "did_number", header: "Number", sortable: true, cell: (c) => <span className="font-mono text-xs">{c.did_number}</span> },
      {
        key: "agent_count",
        header: "Agents",
        align: "right",
        sortable: true,
        cell: (c) => <span className="tabular-nums">{c.agent_count}</span>
      },
      { key: "ivr_name", header: "IVR", cell: (c) => c.ivr_name || <span className="text-muted/60">—</span> },
      {
        key: "status",
        header: "Status",
        sortable: true,
        cell: (c) =>
          canManage ? (
            <div className="flex items-center gap-2">
              <Toggle checked={c.status === "ACTIVE"} onChange={() => toggleCampaignStatus(c)} label="Campaign active" />
              <StatusBadge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{c.status}</StatusBadge>
            </div>
          ) : (
            <StatusBadge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{c.status}</StatusBadge>
          )
      },
      { key: "queue", header: "Queue", cell: renderQueue },
      ...(canManage
        ? [
            {
              key: "actions",
              header: "",
              align: "right",
              cell: (c) => (
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="secondary" onClick={() => openEditCampaign(c)}>
                    Edit
                  </Button>
                  <button
                    onClick={() => removeCampaign(c)}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            }
          ]
        : [])
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, queueStatus]
  );

  const ivrColumns = useMemo(
    () => [
      {
        key: "name",
        header: "IVR menu",
        sortable: true,
        cellClassName: "text-text",
        cell: (v) => <span className="font-medium">{v.name}</span>
      },
      {
        key: "greeting_text",
        header: "Greeting",
        cell: (v) => <span className="line-clamp-1 block max-w-md text-muted">{v.greeting_text || "—"}</span>
      },
      ...(canManage
        ? [
            {
              key: "actions",
              header: "",
              align: "right",
              cell: (v) => (
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="secondary" onClick={() => openEditIvr(v)}>
                    Edit
                  </Button>
                  <button
                    onClick={() => removeIvr(v)}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                    aria-label={`Delete ${v.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            }
          ]
        : [])
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage]
  );

  const TABS = [
    { id: "campaigns", label: "Campaigns", icon: Headset, count: campaigns.length },
    { id: "ivrs", label: "IVRs", icon: Voicemail, count: ivrs.length }
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="INBOUND"
        title="Toll-Free"
        description="Buy a toll-free number from Phone Numbers, then build a campaign here — agents, an optional IVR, and Active/Inactive."
        actions={
          isOwner ? (
            <Button
              variant="secondary"
              icon={MonitorPlay}
              onClick={() =>
                // Deliberately no "noopener" feature — same-origin window.open()
                // clones sessionStorage (the auth token) into the new window at
                // creation time, which is what lets it authenticate with no
                // separate login step; that only reliably happens when the
                // opener relationship is kept intact.
                window.open(`${window.location.pathname}#toll-free-live`, "ringnex-toll-free-live", "width=1360,height=880")
              }
            >
              Open Dashboard Mode
            </Button>
          ) : null
        }
      />

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!loading && !numbers.length ? (
        <Card animate={false}>
          <EmptyState
            icon={Phone}
            title="No toll-free numbers yet"
            description="Buy one from the Phone Numbers page (choose 'Toll-free' as the type) to start building a campaign."
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
            <div className="flex">
              {TABS.map((t) => {
                const on = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={
                      "relative -mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors " +
                      (on ? "border-brand text-text" : "border-transparent text-muted hover:text-text")
                    }
                  >
                    <t.icon size={15} className={on ? "text-brand" : ""} />
                    {t.label}
                    <span
                      className={
                        "rounded-full px-1.5 text-[11px] font-semibold tabular-nums " +
                        (on ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted")
                      }
                    >
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>
            {canManage && activeTab === "campaigns" && (
              <Button
                size="sm"
                icon={Plus}
                className="mb-1.5"
                disabled={!unassignedNumbers.length}
                onClick={() => setCampaignModal({ open: true, campaign: null, agents: [] })}
              >
                New campaign
              </Button>
            )}
            {canManage && activeTab === "ivrs" && (
              <Button size="sm" icon={Plus} className="mb-1.5" onClick={() => setIvrModal({ open: true, ivr: null })}>
                New IVR
              </Button>
            )}
          </div>

          {activeTab === "campaigns" &&
            (loading || campaigns.length ? (
              <DataTable
                columns={campaignColumns}
                data={campaigns}
                loading={loading}
                getRowKey={(c) => c.id}
                searchKeys={["name", "did_number"]}
                searchPlaceholder="Filter campaigns…"
                initialSort={{ key: "name", dir: "asc" }}
                pageSize={12}
                emptyState={<EmptyState icon={Headset} title="No campaigns match" />}
              />
            ) : (
              <Card animate={false}>
                <EmptyState
                  icon={Headset}
                  title="No campaigns yet"
                  description="Point one of your toll-free numbers at a campaign to start taking inbound calls."
                  action={
                    canManage && unassignedNumbers.length ? (
                      <Button size="sm" icon={Plus} onClick={() => setCampaignModal({ open: true, campaign: null, agents: [] })}>
                        New campaign
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            ))}

          {activeTab === "ivrs" &&
            (loading || ivrs.length ? (
              <DataTable
                columns={ivrColumns}
                data={ivrs}
                loading={loading}
                getRowKey={(v) => v.id}
                searchKeys={["name"]}
                searchPlaceholder="Filter IVRs…"
                initialSort={{ key: "name", dir: "asc" }}
                pageSize={12}
                emptyState={<EmptyState icon={Voicemail} title="No IVRs match" />}
              />
            ) : (
              <Card animate={false}>
                <EmptyState
                  icon={Voicemail}
                  title="No IVRs yet"
                  description="Optional — a campaign can route straight to its agent queue without a phone menu."
                  action={
                    canManage ? (
                      <Button size="sm" icon={Plus} onClick={() => setIvrModal({ open: true, ivr: null })}>
                        New IVR
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            ))}
        </>
      )}

      <CreateCampaignModal
        open={campaignModal.open}
        onClose={() => setCampaignModal({ open: false, campaign: null, agents: [] })}
        campaign={campaignModal.campaign}
        currentAgents={campaignModal.agents}
        numbers={numbers}
        ivrs={ivrs}
        users={users}
        onSaved={load}
      />
      <CreateIvrModal
        open={ivrModal.open}
        onClose={() => setIvrModal({ open: false, ivr: null })}
        ivr={ivrModal.ivr}
        campaigns={campaigns}
        onSaved={load}
      />
    </div>
  );
}
