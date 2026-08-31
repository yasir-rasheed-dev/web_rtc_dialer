import { useCallback, useEffect, useState } from "react";
import { Headset, MonitorPlay, Phone, Plus, Trash2, Voicemail } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="INBOUND"
        title="Toll-Free"
        description="Buy a toll-free number from Phone Numbers, then build a campaign here — agents, an optional IVR, and Active/Inactive."
        actions={
          <>
            {isOwner && (
              <Button
                variant="secondary"
                icon={MonitorPlay}
                onClick={() =>
                  // Deliberately no "noopener" feature — same-origin
                  // window.open() clones sessionStorage (the auth token)
                  // into the new window at creation time, which is what
                  // lets it authenticate with no separate login step; that
                  // only reliably happens when the opener relationship is
                  // kept intact.
                  window.open(`${window.location.pathname}#toll-free-live`, "ringnex-toll-free-live", "width=1360,height=880")
                }
              >
                Open Dashboard Mode
              </Button>
            )}
            {canManage && (
              <Button icon={Plus} onClick={() => setCampaignModal({ open: true, campaign: null, agents: [] })} disabled={!unassignedNumbers.length}>
                New campaign
              </Button>
            )}
          </>
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {!loading && !numbers.length && (
        <Card animate={false}>
          <EmptyState
            icon={Phone}
            title="No toll-free numbers yet"
            description="Buy one from the Phone Numbers page (choose 'Toll-free' as the type) to start building a campaign."
          />
        </Card>
      )}

      <Card animate={false} title="Campaigns" description={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`} icon={Headset}>
        {loading ? (
          <SkeletonTable rows={3} cols={7} />
        ) : campaigns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Campaign</th>
                  <th className="pb-2 pr-4">Number</th>
                  <th className="pb-2 pr-4">Agents</th>
                  <th className="pb-2 pr-4">IVR</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Queue</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 font-medium text-text">{campaign.name}</td>
                    <td className="py-3 pr-4 text-muted">{campaign.did_number}</td>
                    <td className="py-3 pr-4 text-muted">{campaign.agent_count}</td>
                    <td className="py-3 pr-4 text-muted">{campaign.ivr_name || "—"}</td>
                    <td className="py-3 pr-4">
                      {canManage ? (
                        <label className="flex items-center gap-2">
                          <Toggle checked={campaign.status === "ACTIVE"} onChange={() => toggleCampaignStatus(campaign)} label="Campaign active" />
                          <StatusBadge tone={campaign.status === "ACTIVE" ? "success" : "neutral"}>{campaign.status}</StatusBadge>
                        </label>
                      ) : (
                        <StatusBadge tone={campaign.status === "ACTIVE" ? "success" : "neutral"}>{campaign.status}</StatusBadge>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted">
                      {campaign.status !== "ACTIVE" ? (
                        "—"
                      ) : queueStatus[campaign.id] === undefined ? (
                        <span className="text-xs">…</span>
                      ) : queueStatus[campaign.id].ok === false ? (
                        <span className="text-xs text-muted" title={queueStatus[campaign.id].error}>
                          unavailable
                        </span>
                      ) : queueStatus[campaign.id].waiting > 0 ? (
                        <StatusBadge tone="warning">
                          {queueStatus[campaign.id].waiting} waiting · {queueStatus[campaign.id].longestWaitSec}s
                        </StatusBadge>
                      ) : (
                        <span className="text-xs">0 waiting</span>
                      )}
                    </td>
                    <td className="py-3">
                      {canManage && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="secondary" onClick={() => openEditCampaign(campaign)}>
                            Edit
                          </Button>
                          <button
                            onClick={() => removeCampaign(campaign)}
                            className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                            aria-label={`Delete ${campaign.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Headset}
            title="No campaigns yet"
            action={
              canManage && unassignedNumbers.length ? (
                <Button size="sm" icon={Plus} onClick={() => setCampaignModal({ open: true, campaign: null, agents: [] })}>
                  New campaign
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      <Card animate={false} title="IVRs" description={`${ivrs.length} menu${ivrs.length === 1 ? "" : "s"}`} icon={Voicemail}>
        <div className="mb-3 flex justify-end">
          {canManage && (
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setIvrModal({ open: true, ivr: null })}>
              New IVR
            </Button>
          )}
        </div>
        {loading ? (
          <SkeletonTable rows={2} cols={3} />
        ) : ivrs.length ? (
          <div className="flex flex-col divide-y divide-border/60">
            {ivrs.map((ivr) => (
              <div key={ivr.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{ivr.name}</p>
                  <p className="truncate text-xs text-muted">{ivr.greeting_text}</p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openEditIvr(ivr)}>
                      Edit
                    </Button>
                    <button
                      onClick={() => removeIvr(ivr)}
                      className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                      aria-label={`Delete ${ivr.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Voicemail} title="No IVRs yet" description="Optional — campaigns can route straight to a queue instead." />
        )}
      </Card>

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
