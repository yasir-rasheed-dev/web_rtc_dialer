import { useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, UploadCloud } from "lucide-react";

import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { getToken } from "../../lib/api";
import { API_BASE } from "../../lib/apiConfig";

const TEMPLATE_CSV =
  "Phone,Reason\n" +
  "+15551234567,Customer requested no contact\n" +
  "5559876543,Complaint\n" +
  '"+1 (555) 111-2222",\n';

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/**
 * Upload flow for the Do-Not-Call list: download a template, pick/drop a
 * sheet, watch a real upload progress bar (XHR, not fetch), then see a
 * breakdown of added / already-listed / skipped rows.
 */
export default function DncUploadModal({ open, onClose, onDone }) {
  const [phase, setPhase] = useState("pick"); // pick | uploading | done
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const xhrRef = useRef(null);

  const reset = () => {
    setPhase("pick");
    setFile(null);
    setProgress(0);
    setProcessing(false);
    setResult(null);
    setError("");
  };

  const close = () => {
    xhrRef.current?.abort();
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "dnc-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pickFile = (f) => {
    if (!f) return;
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) {
      setError("Use a .csv, .xlsx or .xls file.");
      return;
    }
    setError("");
    setFile(f);
  };

  const startUpload = () => {
    if (!file) return;
    setPhase("uploading");
    setProgress(0);
    setProcessing(false);
    setError("");

    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `${API_BASE}/api/dnc/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${getToken()}`);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      setProgress(pct);
      if (pct >= 100) setProcessing(true);
    };
    xhr.onload = () => {
      xhrRef.current = null;
      let body = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        setResult(body);
        setPhase("done");
        onDone?.();
      } else {
        setError(body.error || `Upload failed (${xhr.status}).`);
        setPhase("pick");
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setError("Network error during upload.");
      setPhase("pick");
    };
    xhr.onabort = () => {
      xhrRef.current = null;
    };
    xhr.send(fd);
  };

  return (
    <Modal open={open} onClose={close} title="Upload numbers" width="max-w-lg">
      {phase === "pick" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <FileSpreadsheet size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">Need the format?</p>
                <p className="text-xs leading-relaxed text-muted">
                  A <span className="font-mono">Phone</span> column is required; <span className="font-mono">Reason</span> is optional.
                </p>
              </div>
            </div>
            <Button size="sm" variant="secondary" icon={Download} onClick={downloadTemplate}>
              Template
            </Button>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            className={
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors " +
              (dragOver ? "border-brand bg-brand/5" : "border-border hover:border-border-strong")
            }
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <UploadCloud size={26} className={file ? "text-brand" : "text-muted"} />
            {file ? (
              <>
                <p className="text-sm font-medium text-text">{file.name}</p>
                <p className="text-xs text-muted">{formatBytes(file.size)} · click to change</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-text">Drop a spreadsheet here, or click to browse</p>
                <p className="text-xs text-muted">.csv, .xlsx or .xls</p>
              </>
            )}
          </label>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" disabled={!file} onClick={startUpload}>
              Upload
            </Button>
          </div>
        </div>
      )}

      {phase === "uploading" && (
        <div className="flex flex-col gap-4 py-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <FileSpreadsheet size={17} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{file?.name}</p>
              <p className="text-xs text-muted">{processing ? "Processing rows on the server…" : `Uploading… ${progress}%`}</p>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className={"h-full rounded-full bg-brand transition-[width] duration-200 " + (processing ? "animate-pulse" : "")}
              style={{ width: `${processing ? 100 : progress}%` }}
            />
          </div>
          <p className="text-center text-xs text-muted">
            {processing ? "Almost done — matching against the existing list." : "Sending the file…"}
          </p>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">Upload complete</p>
              <p className="text-xs text-muted">
                {result?.total ?? 0} row{result?.total === 1 ? "" : "s"} read from the file
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border">
            {[
              ["Added", result?.inserted ?? 0, "text-success"],
              ["Already listed", result?.duplicates ?? 0, "text-text"],
              ["Skipped", result?.skipped ?? 0, "text-muted"]
            ].map(([label, value, cls]) => (
              <div key={label} className="px-3 py-3 text-center">
                <p className={"text-xl font-bold tabular-nums " + cls}>{value}</p>
                <p className="mt-0.5 text-[11px] text-muted">{label}</p>
              </div>
            ))}
          </div>

          {result?.duplicates > 0 && (
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
              {result.duplicates} number{result.duplicates === 1 ? " was" : "s were"} already on the Do-Not-Call list and left
              unchanged.
            </p>
          )}
          {result?.skipped > 0 && (
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
              {result.skipped} row{result.skipped === 1 ? "" : "s"} had no usable phone number and {result.skipped === 1 ? "was" : "were"} skipped.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={reset}>
              Upload another
            </Button>
            <Button size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
