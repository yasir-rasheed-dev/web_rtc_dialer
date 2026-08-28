import { Archive, FileSpreadsheet, FileText, Film, Music, Presentation } from "lucide-react";

// Ringnex ids are UUID strings, not numbers — chat ids are just the two
// user ids joined, string-sorted so both directions land on the same key.
export const getChatId = (a, b) => (String(a) < String(b) ? `${a}_${b}` : `${b}_${a}`);

export function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImage(url, mime) {
  if (mime?.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|svg|bmp)(\?|$)/i.test(url || "");
}

export function firstFilled(...values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      const nested = firstFilled(...v);
      if (nested) return nested;
      continue;
    }
    if (typeof v === "object") {
      const nested = firstFilled(v.number, v.did, v.didNumber, v.phoneNumber, v.value, v.name);
      if (nested) return nested;
      continue;
    }
    const str = String(v).trim();
    if (str) return str;
  }
  return "";
}

export function getAgentSip(agent) {
  return firstFilled(agent?.sipUsername, agent?.sipIdentity, agent?.sip, agent?.extension) || "Not assigned";
}

export function getAgentDid(agent) {
  return firstFilled(agent?.callerIdNumber, agent?.assignedDidNumber, agent?.didNumber, agent?.did) || "Not assigned";
}

export function initials(name = "") {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function forceDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "download";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Mirrors AttachThumb's typeInfo mapping so a sent video/zip/doc/etc.
// attachment gets the same distinct icon it showed in the pre-send queue,
// instead of every non-image type collapsing into a generic FileText icon.
export function attachTypeIcon(mimeType, fileName) {
  const mime = mimeType || "";
  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
  const isPdf = mime === "application/pdf" || ext === "pdf";
  const isDoc = /word|document/i.test(mime) || ["doc", "docx"].includes(ext);
  const isXls = /excel|sheet/i.test(mime) || ["xls", "xlsx", "csv"].includes(ext);
  const isPpt = /powerpoint|presentation/i.test(mime) || ["ppt", "pptx"].includes(ext);
  const isVid = mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
  const isAud = mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext);
  const isZip = /zip|rar|compressed/i.test(mime) || ["zip", "rar", "7z"].includes(ext);

  if (isVid) return Film;
  if (isAud) return Music;
  if (isZip) return Archive;
  if (isXls) return FileSpreadsheet;
  if (isPpt) return Presentation;
  if (isPdf || isDoc) return FileText;
  return FileText;
}

/* ─── attachment types ───────────────────────────────── */
export const SUPPORTED_MIME = [
  "image/jpeg","image/png","image/gif","image/webp","image/svg+xml","image/bmp",
  "application/pdf",
  "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/zip","application/x-rar-compressed","application/x-zip-compressed",
  "video/mp4","audio/mpeg","audio/mp3",
];
export const SUPPORTED_EXT = /\.(jpe?g|png|gif|webp|svg|bmp|pdf|docx?|xlsx?|pptx?|txt|zip|rar|mp4|mp3)$/i;

export function isFileSupported(f) {
  if (SUPPORTED_MIME.includes(f.type)) return true;
  return SUPPORTED_EXT.test(f.name);
}
