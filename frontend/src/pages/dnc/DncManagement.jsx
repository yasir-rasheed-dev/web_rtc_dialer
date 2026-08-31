import { useEffect, useRef, useState } from "react";
import { PhoneOff, Plus, Trash2, Upload } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import { api } from "../../lib/api";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";

// Do-Not-Call list — MANAGE_DNC gates the whole page (server-side too, on
// every route in dncRoutes.js). Numbers can be typed in any common form
// (+1XXXXXXXXXX, 1XXXXXXXXXX, bare XXXXXXXXXX) or come from an uploaded
// spreadsheet — the backend normalizes all of them to the same 10-digit
// key, so this page just displays whatever form each number was entered
// in (raw_number) while matching happens on the normalized one.
export default function DncManagement() {
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const load = async (searchTerm = search) => {
    setLoading(true);
    try {
      const result = await api(`/dnc?search=${encodeURIComponent(searchTerm)}`);
      setNumbers(result.numbers || []);
    } catch (error) {
      notifyError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const addNumber = async (event) => {
    event.preventDefault();
    if (!newNumber.trim()) return;
    setAdding(true);
    try {
      await api("/dnc", { method: "POST", body: { number: newNumber.trim(), reason: newReason.trim() } });
      notifySuccess("Number added to the Do-Not-Call list.");
      setNewNumber("");
      setNewReason("");
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

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api("/dnc/upload", { method: "POST", body: formData });
      notifySuccess(
        `${result.inserted} number${result.inserted === 1 ? "" : "s"} added` +
          (result.duplicates ? `, ${result.duplicates} already on the list` : "") +
          (result.skipped ? `, ${result.skipped} skipped (no usable number)` : "") +
          "."
      );
      load();
    } catch (error) {
      notifyError(error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Do-Not-Call list</h1>
        <p className="mt-1 text-sm text-muted">
          Numbers here are blocked from outbound dialing tenant-wide, unless an agent's role has the
          "Call Do-Not-Call Numbers" permission.
        </p>
      </div>

      <Card title="Add a number">
        <form onSubmit={addNumber} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 min-w-[200px] flex-col gap-1.5 text-xs font-medium text-muted">
            Phone number
            <Input
              value={newNumber}
              onChange={(event) => setNewNumber(event.target.value)}
              placeholder="+1 555 123 4567"
              required
            />
          </label>
          <label className="flex flex-1 min-w-[200px] flex-col gap-1.5 text-xs font-medium text-muted">
            Reason (optional)
            <Input
              value={newReason}
              onChange={(event) => setNewReason(event.target.value)}
              placeholder="Customer requested no contact"
            />
          </label>
          <Button type="submit" disabled={adding}>
            <Plus size={15} />
            {adding ? "Adding…" : "Add number"}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleFileChange} />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={15} />
            {uploading ? "Uploading…" : "Upload spreadsheet"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Spreadsheet needs a "Phone" (or "Number") column — every other column is ignored. Numbers already on
          the list, or repeated in the sheet, are skipped automatically.
        </p>
      </Card>

      <Card
        title={`${numbers.length} number${numbers.length === 1 ? "" : "s"}`}
        actions={
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search…"
            className="w-52"
          />
        }
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">Loading…</p>
        ) : numbers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Number</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2.5 font-medium text-text">
                      <span className="inline-flex items-center gap-1.5">
                        <PhoneOff size={13} className="text-danger" />
                        {entry.raw_number}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{entry.reason || "—"}</td>
                    <td className="px-3 py-2.5 text-muted">{entry.source === "UPLOAD" ? "Spreadsheet" : "Manual"}</td>
                    <td className="px-3 py-2.5 text-muted">{new Date(entry.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => deleteNumber(entry)}
                        disabled={deletingId === entry.id}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                        aria-label="Remove from list"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted">
            {search ? "No matching numbers." : "The Do-Not-Call list is empty."}
          </p>
        )}
      </Card>
    </div>
  );
}
