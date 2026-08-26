import { useCallback, useEffect, useState } from "react";
import { BarChart3, Plus, RefreshCw, Trash2 } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";
import { deleteCampaign, listCampaigns, updateCampaign } from "../../lib/campaignApi";
import { CreateCampaignModal } from "./modals";
import CampaignDetailView from "./CampaignDetailView";

const CAMPAIGN_STATUS_OPTIONS = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"].map((value) => ({ value, label: value }));

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CampaignsPanel({ permissions }) {
  const can = (key) => permissions.includes(key);
  const canCreate = can("CREATE_CAMPAIGNS") || can("MANAGE_CAMPAIGNS");
  const canManage = can("MANAGE_CAMPAIGNS");

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCampaigns(await listCampaigns());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (campaign, status) => {
    try {
      await updateCampaign({ ...campaign, status });
      notifySuccess(`Campaign set to ${status}.`);
      await load();
    } catch (e) {
      notifyError(e.message);
    }
  };

  const removeCampaign = async (campaign) => {
    const confirmed = await confirmModal({
      title: "Delete campaign",
      message: `Delete "${campaign.name}"? Its contacts and call history stay in the database, but the campaign disappears from this list.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    setDeletingId(campaign.id);
    try {
      await deleteCampaign(campaign.id);
      notifySuccess("Campaign deleted.");
      await load();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (openId) {
    return (
      <CampaignDetailView
        campaignId={openId}
        permissions={permissions}
        onBack={() => setOpenId(null)}
        onDeleted={() => {
          setOpenId(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="OUTBOUND CAMPAIGNS"
        title="Campaigns"
        description="Create a campaign, import contacts from Excel, distribute them to agents, then activate it."
        actions={
          <>
            {canCreate && (
              <Button icon={Plus} onClick={() => setCreateOpen(true)}>
                New campaign
              </Button>
            )}
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>
              Refresh
            </Button>
          </>
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card animate={false} title="All campaigns" description={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`} icon={BarChart3}>
        {loading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : campaigns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Campaign</th>
                  <th className="pb-2 pr-4">Mode</th>
                  <th className="pb-2 pr-4">Contacts</th>
                  <th className="pb-2 pr-4">Connected</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text">{row.name}</p>
                      <p className="max-w-[220px] truncate text-xs text-muted">{row.description || formatDate(row.created_at)}</p>
                    </td>
                    <td className="py-3 pr-4 text-muted">{row.mode === "PREVIEW" ? "Preview" : "Click to call"}</td>
                    <td className="py-3 pr-4 text-muted">{row.total_contacts || 0}</td>
                    <td className="py-3 pr-4 text-muted">{row.connected_contacts || 0}</td>
                    <td className="py-3 pr-4">
                      {canManage ? (
                        <div className="w-36">
                          <Select
                            className="text-xs"
                            isSearchable={false}
                            options={CAMPAIGN_STATUS_OPTIONS}
                            value={CAMPAIGN_STATUS_OPTIONS.find((option) => option.value === row.status) || null}
                            onChange={(option) => changeStatus(row, option.value)}
                          />
                        </div>
                      ) : (
                        <StatusBadge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status}</StatusBadge>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setOpenId(row.id)}>
                          Manage
                        </Button>
                        {canManage && (
                          <button
                            onClick={() => removeCampaign(row)}
                            disabled={deletingId === row.id}
                            className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                            aria-label={`Delete ${row.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No campaigns yet"
            action={
              canCreate ? (
                <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
                  New campaign
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      <CreateCampaignModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        campaign={null}
        onSaved={() => {
          setCreateOpen(false);
          load();
        }}
      />
    </div>
  );
}
