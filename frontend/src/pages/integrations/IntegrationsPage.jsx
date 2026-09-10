import { useEffect, useMemo, useState } from "react";
import { Plug, Link2Off, ExternalLink } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import Toggle from "../../components/ui/Toggle";
import StatusBadge from "../../components/ui/StatusBadge";
import { api } from "../../lib/api";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";

// Owner-only (MANAGE_SETTINGS — enforced server-side on every crmRoutes
// endpoint too). GoHighLevel is the only integration for now.
export default function IntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setStatus(await api("/integrations/crm/status"));
    } catch (e) {
      notifyError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const connect = async () => {
    setBusy("connect");
    try {
      const { url } = await api("/integrations/crm/connect");
      window.location.href = url;
    } catch (e) {
      notifyError(e.message);
      setBusy("");
    }
  };

  const disconnect = async () => {
    const ok = await confirmModal({
      title: "Disconnect GoHighLevel?",
      message: "Contacts, opportunities and call notes will stop syncing. You can reconnect any time.",
      confirmText: "Disconnect",
      danger: true
    });
    if (!ok) return;
    setBusy("disconnect");
    try {
      await api("/integrations/crm/disconnect", { method: "POST" });
      notifySuccess("Disconnected.");
      await load();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy("");
    }
  };

  const patchSettings = async (patch) => {
    setStatus((s) => ({ ...s, ...patch }));
    try {
      await api("/integrations/crm/settings", {
        method: "POST",
        body: {
          pipelineId: patch.pipelineId ?? status.pipelineId ?? null,
          pipelineStageId: patch.pipelineStageId ?? status.pipelineStageId ?? null,
          createOpportunity: patch.createOpportunity ?? status.createOpportunity ?? true
        }
      });
    } catch (e) {
      notifyError(e.message);
      load();
    }
  };

  const toggleActive = async (active) => {
    setStatus((s) => ({ ...s, active }));
    setBusy("toggle");
    try {
      await api("/integrations/crm/toggle", { method: "POST", body: { active } });
    } catch (e) {
      notifyError(e.message);
      load();
    } finally {
      setBusy("");
    }
  };

  const pipelineOptions = useMemo(
    () => (status?.pipelines || []).map((p) => ({ value: p.id, label: p.name })),
    [status]
  );
  const stageOptions = useMemo(() => {
    const p = (status?.pipelines || []).find((x) => x.id === status?.pipelineId);
    return (p?.stages || []).map((s) => ({ value: s.id, label: s.name }));
  }, [status]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="INTEGRATIONS"
        title="Integrations"
        description="Connect ringNex to the tools your team already uses."
      />

      <Card animate={false}>
        <div className="flex flex-col gap-4 p-1">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-2">
                <Plug size={18} className="text-brand" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold text-text">GoHighLevel</h3>
                  {status?.connected ? (
                    <StatusBadge tone={status.active ? "success" : "neutral"}>
                      {status.active ? "Active" : "Connected — inactive"}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Not connected</StatusBadge>
                  )}
                </div>
                <p className="mt-1 max-w-xl text-[13px] text-muted">
                  On call end, create/update the contact in your sub-account (no duplicates), open an
                  opportunity, and push call remarks as contact notes. Nothing syncs until this is
                  connected <em>and</em> switched on.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-[13px] text-muted">Loading…</p>
          ) : !status?.configured ? (
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-muted">
              This integration isn’t available on your plan yet.
            </p>
          ) : !status.connected ? (
            <div>
              <Button icon={ExternalLink} loading={busy === "connect"} onClick={connect}>
                Connect GoHighLevel
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[13px] font-medium text-text">Sync active</div>
                  <div className="text-[12px] text-muted">Master switch for all GoHighLevel syncing.</div>
                </div>
                <Toggle checked={!!status.active} disabled={busy === "toggle"} onChange={toggleActive} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-muted">Opportunity pipeline</label>
                  <Select
                    options={pipelineOptions}
                    value={pipelineOptions.find((o) => o.value === status.pipelineId) || null}
                    onChange={(o) => patchSettings({ pipelineId: o?.value || null, pipelineStageId: null })}
                    placeholder={pipelineOptions.length ? "Select pipeline" : "No pipelines found"}
                    isClearable
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-muted">Stage</label>
                  <Select
                    options={stageOptions}
                    value={stageOptions.find((o) => o.value === status.pipelineStageId) || null}
                    onChange={(o) => patchSettings({ pipelineStageId: o?.value || null })}
                    placeholder={status.pipelineId ? "Select stage" : "Pick a pipeline first"}
                    isDisabled={!status.pipelineId}
                    isClearable
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[13px] font-medium text-text">Create an opportunity for new contacts</div>
                  <div className="text-[12px] text-muted">
                    When a call creates a brand-new contact, also add it to the pipeline above.
                  </div>
                </div>
                <Toggle
                  checked={status.createOpportunity !== false}
                  onChange={(v) => patchSettings({ createOpportunity: v })}
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <span className="text-[12px] text-muted">Location&nbsp;ID: {status.locationId || "—"}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Link2Off}
                  loading={busy === "disconnect"}
                  onClick={disconnect}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
