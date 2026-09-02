import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, MapPin, Palette, Phone, Plus, RefreshCw, Search, Tag, Users } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { Pagination, fieldLabelClass, formatDate } from "../calls/shared";
import {
  createDisposition,
  deleteDisposition,
  getDispositions,
  getLead,
  getLeads,
  leadAttachmentBlob,
  updateDisposition
} from "../../lib/leadsApi";
import { notifyError, notifySuccess } from "../../lib/toast";

function DispositionBadge({ name, color }) {
  if (!name) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-text">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color || "#6366f1" }} />
      {name}
    </span>
  );
}

function DispositionsModal({ open, onClose, canManage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getDispositions(true)
      .then(setRows)
      .catch((e) => notifyError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createDisposition({ name: name.trim(), color });
      setName("");
      setColor("#6366f1");
      notifySuccess("Disposition added");
      load();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (row) => {
    try {
      if (row.active) await deleteDisposition(row.id);
      else await updateDisposition(row.id, { active: true });
      load();
    } catch (e) {
      notifyError(e.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Dispositions" width="max-w-lg">
      <p className="-mt-2 mb-4 text-xs text-muted">
        One shared list, used by Leads, the End Call popup and the Auto Dialer alike.
      </p>
      {canManage && (
        <form onSubmit={submit} className="mb-4 flex items-end gap-2">
          <label className={`${fieldLabelClass()} flex-1`}>
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Interested" />
          </label>
          <label className={fieldLabelClass()}>
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-[42px] w-14 cursor-pointer rounded-xl border border-border bg-surface-2 p-1"
            />
          </label>
          <Button type="submit" icon={Plus} loading={busy}>
            Add
          </Button>
        </form>
      )}
      {loading ? (
        <SkeletonTable rows={4} cols={2} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
              <DispositionBadge name={row.name} color={row.color} />
              {canManage && (
                <button
                  type="button"
                  onClick={() => toggleActive(row)}
                  className={`text-xs font-medium ${row.active ? "text-danger" : "text-brand"}`}
                >
                  {row.active ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </div>
          ))}
          {!rows.length && <EmptyState title="No dispositions yet" />}
        </div>
      )}
    </Modal>
  );
}

function LeadDetailModal({ leadId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    getLead(leadId)
      .then(setData)
      .catch((e) => notifyError(e.message))
      .finally(() => setLoading(false));
  }, [leadId]);

  const downloadAttachment = async (attachment) => {
    setDownloadingId(attachment.id);
    try {
      const url = await leadAttachmentBlob(attachment.id);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.file_name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifyError(e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Modal open={Boolean(leadId)} onClose={onClose} title={loading ? "Lead" : data?.lead?.name || "Lead"} width="max-w-2xl">
      {loading ? (
        <SkeletonTable rows={4} cols={2} />
      ) : (
        data && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-2 p-4 text-sm">
              <div className="flex items-center gap-2 text-text">
                <Phone size={14} className="text-muted" /> {data.lead.phone}
              </div>
              <div className="flex items-center gap-2 text-text">
                <MapPin size={14} className="text-muted" /> {data.lead.address || "No address on file"}
              </div>
              <div className="col-span-2">
                <DispositionBadge name={data.lead.disposition_name} color={data.lead.disposition_color} />
              </div>
            </div>

            {data.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Tag size={13} className="text-muted" />
                {data.tags.map((tag) => (
                  <span key={tag.id} className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                    {tag.tag}
                  </span>
                ))}
              </div>
            )}

            {data.attachments.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Attachments</p>
                {data.attachments.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => downloadAttachment(file)}
                    disabled={downloadingId === file.id}
                    className="flex w-fit items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-border-strong disabled:opacity-60"
                  >
                    <Download size={12} /> {file.file_name}
                  </button>
                ))}
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Interaction history</p>
              <div className="flex flex-col gap-3">
                {data.interactions.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border bg-surface-2 p-3.5">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <DispositionBadge name={item.disposition_name} color={item.disposition_color} />
                        <span className="text-xs text-muted">{item.agent_name || "—"}</span>
                      </div>
                      <span className="text-xs text-muted">{formatDate(item.created_at)}</span>
                    </div>
                    {item.remarks && <p className="text-sm text-text">{item.remarks}</p>}
                    {item.follow_up_at && (
                      <div className="mt-2">
                        <StatusBadge tone={item.follow_up_done ? "success" : "brand"} icon={CheckCircle2}>
                          Follow-up {formatDate(item.follow_up_at)} {item.follow_up_done ? "· done" : ""}
                        </StatusBadge>
                      </div>
                    )}
                  </div>
                ))}
                {!data.interactions.length && <EmptyState title="No interactions yet" />}
              </div>
            </div>
          </div>
        )
      )}
    </Modal>
  );
}

export default function LeadsPage({ permissions = [] }) {
  const canManageDispositions = permissions.includes("MANAGE_DISPOSITIONS");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState({ rows: [], page: 1, pageSize: 25, total: 0 });
  const [loading, setLoading] = useState(true);
  const [dispositionsOpen, setDispositionsOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  const load = useCallback(
    (page = 1) => {
      setLoading(true);
      getLeads({ page, search })
        .then(setResult)
        .catch((e) => notifyError(e.message))
        .finally(() => setLoading(false));
    },
    [search]
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="RELATIONSHIP MANAGEMENT"
        title="Leads"
        description="Every customer captured from the End Call popup, with their full interaction history."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={Palette} onClick={() => setDispositionsOpen(true)}>
              Dispositions
            </Button>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={() => load(result.page)}>
              Refresh
            </Button>
          </div>
        }
      />

      <Card compact>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            load(1);
          }}
          className="flex items-end gap-2"
        >
          <label className={`${fieldLabelClass()} flex-1`}>
            Search
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or phone number" />
          </label>
          <Button type="submit" icon={Search} loading={loading}>
            Search
          </Button>
        </form>
      </Card>

      <Card compact title="Leads" description={`${result.total} matching leads`} icon={Users}>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} cols={5} />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Phone</th>
                  <th className="pb-2 pr-4">Disposition</th>
                  <th className="pb-2 pr-4">Last interaction</th>
                  <th className="pb-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="py-2.5 pr-4 font-medium text-text">{lead.name || "—"}</td>
                    <td className="py-2.5 pr-4 text-muted">{lead.phone}</td>
                    <td className="py-2.5 pr-4">
                      <DispositionBadge name={lead.disposition_name} color={lead.disposition_color} />
                    </td>
                    <td className="py-2.5 pr-4 text-muted">{lead.last_interaction_at ? formatDate(lead.last_interaction_at) : "—"}</td>
                    <td className="py-2.5 text-muted">{formatDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !result.rows.length && <EmptyState icon={Users} title="No leads yet" description="Leads captured from the End Call popup will show up here." />}
        </div>
        <Pagination result={result} load={(page) => load(page)} />
      </Card>

      <DispositionsModal open={dispositionsOpen} onClose={() => setDispositionsOpen(false)} canManage={canManageDispositions} />
      <LeadDetailModal leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
