import { useEffect, useMemo, useState } from "react";
import { PhoneOff, Plus, Trash2, Upload } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import DataTable from "../../components/ui/DataTable";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { api } from "../../lib/api";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";
import DncUploadModal from "./DncUploadModal";

// Do-Not-Call list — MANAGE_DNC gates the whole page (server-side too, on
// every route in dncRoutes.js). Numbers can be typed in any common form
// (+1XXXXXXXXXX, 1XXXXXXXXXX, bare XXXXXXXXXX) or come from an uploaded
// spreadsheet — the backend normalizes all of them to the same 10-digit
// key, so this page just displays whatever form each number was entered
// in (raw_number) while matching happens on the normalized one.
export default function DncManagement() {
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNumber, setNewNumber] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api("/dnc?search=");
      setNumbers(result.numbers || []);
    } catch (error) {
      notifyError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addNumber = async (event) => {
    event.preventDefault();
    if (!newNumber.trim()) return;
    setAdding(true);
    try {
      await api("/dnc", { method: "POST", body: { number: newNumber.trim(), reason: newReason.trim() } });
      notifySuccess("Number added to the Do-Not-Call list.");
      setNewNumber("");
      setNewReason("");
      setAddOpen(false);
      load();
    } catch (error) {
      notifyError(error.message);
    } finally {
      setAdding(false);
    }
  };

  const deleteNumber = async (entry) => {
    const confirmed = await confirmModal({
      title: "Remove from Do-Not-Call list",
      message: `Allow calls to "${entry.raw_number}" again?`,
      confirmText: "Remove",
      danger: true
    });
    if (!confirmed) return;
    setDeletingId(entry.id);
    try {
      await api(`/dnc/${entry.id}`, { method: "DELETE" });
      setNumbers((current) => current.filter((item) => item.id !== entry.id));
      notifySuccess("Removed from the Do-Not-Call list.");
    } catch (error) {
      notifyError(error.message);
    } finally {
      setDeletingId(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "raw_number",
        header: "Number",
        sortable: true,
        cellClassName: "text-text",
        cell: (e) => (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <PhoneOff size={13} className="text-danger" />
            {e.raw_number}
          </span>
        )
      },
      { key: "reason", header: "Reason", sortable: true, cell: (e) => e.reason || <span className="text-muted/60">—</span> },
      {
        key: "source",
        header: "Source",
        sortable: true,
        cell: (e) => (
          <StatusBadge tone="neutral">{e.source === "UPLOAD" ? "Spreadsheet" : "Manual"}</StatusBadge>
        )
      },
      {
        key: "created_at",
        header: "Added",
        sortable: true,
        sortValue: (e) => e.created_at,
        cell: (e) => new Date(e.created_at).toLocaleDateString()
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (e) => (
          <button
            type="button"
            onClick={() => deleteNumber(e)}
            disabled={deletingId === e.id}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
            aria-label="Remove from list"
          >
            <Trash2 size={15} />
          </button>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletingId]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="COMPLIANCE"
        title="Do-Not-Call list"
        description={
          "Numbers here are blocked from outbound dialing tenant-wide, unless an agent's role has the “Call Do-Not-Call Numbers” permission."
        }
        actions={
          <>
            <Button icon={Plus} onClick={() => setAddOpen(true)}>
              Add number
            </Button>
            <Button variant="secondary" icon={Upload} onClick={() => setUploadOpen(true)}>
              Upload spreadsheet
            </Button>
          </>
        }
      />

      {loading || numbers.length ? (
        <DataTable
          columns={columns}
          data={numbers}
          loading={loading}
          getRowKey={(e) => e.id}
          searchKeys={["raw_number", "reason"]}
          searchPlaceholder="Search number or reason…"
          filters={[
            {
              key: "source",
              label: "All sources",
              getValue: (e) => (e.source === "UPLOAD" ? "Spreadsheet" : "Manual"),
              options: [
                { value: "Manual", label: "Manual" },
                { value: "Spreadsheet", label: "Spreadsheet" }
              ]
            }
          ]}
          initialSort={{ key: "created_at", dir: "desc" }}
          pageSize={15}
          emptyState={<p className="text-sm text-muted">No matching numbers.</p>}
        />
      ) : (
        <Card animate={false}>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
              <PhoneOff size={22} />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">The Do-Not-Call list is empty</p>
              <p className="mt-1 text-xs text-muted">Add a single number, or upload a spreadsheet for bulk imports.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
                Add number
              </Button>
              <Button size="sm" variant="secondary" icon={Upload} onClick={() => setUploadOpen(true)}>
                Upload spreadsheet
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add number">
        <form onSubmit={addNumber} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Phone number
            <Input
              autoFocus
              value={newNumber}
              onChange={(event) => setNewNumber(event.target.value)}
              placeholder="+1 555 123 4567"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Reason <span className="font-normal normal-case text-muted/70">(optional)</span>
            <Input
              value={newReason}
              onChange={(event) => setNewReason(event.target.value)}
              placeholder="Customer requested no contact"
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={adding}>
              Add number
            </Button>
          </div>
        </form>
      </Modal>

      <DncUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={load} />
    </div>
  );
}
