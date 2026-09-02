import { useEffect, useRef } from "react";
import { Hash, X, Trash2, Download, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { fmtSize, isImage, forceDownload, attachTypeIcon } from "./helpers";

/* ─── In-App Notification ────────────────────────────── */
export function InAppNotifToast({ notif, onDismiss, onOpen }) {
  useEffect(() => { const t = setTimeout(() => onDismiss(notif.id), 5000); return () => clearTimeout(t); }, [notif.id, onDismiss]);
  return (
    <motion.div layout
      initial={{ opacity: 0, x: 60, scale: 0.92 }} animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.88 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}
      onClick={() => onOpen(notif)}
      style={{ width: 300, background: "#fff", borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)", padding: "14px 14px 14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 11, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "linear-gradient(180deg,#0684BC,#0aa2d6)", borderRadius: "4px 0 0 4px" }} />
      <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: notif.chat?.type !== "individual" ? "linear-gradient(135deg,#23a6d4,#0684BC)" : "linear-gradient(135deg,#0684BC,#0aa2d6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700 }}>
        {notif.chat?.type !== "individual" ? <Hash size={15} /> : (notif.chat?.avatar || "?")}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{notif.title}</div>
        <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{notif.body}</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDismiss(notif.id); }} style={{ width: 20, height: 20, border: "none", background: "#f5f5f5", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
        <X size={10} color="#999" />
      </button>
      <motion.div initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 5, ease: "linear" }} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "#0684BC", transformOrigin: "left", borderRadius: "0 0 16px 16px", opacity: 0.35 }} />
    </motion.div>
  );
}

/* ─── Delete Confirm Modal ───────────────────────────── */
export function DeleteConfirmModal({ open = true, isMe, onDeleteForMe, onDeleteForEveryone, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title="Delete message">
      <p className="text-sm leading-relaxed text-muted">
        {isMe
          ? "Remove this message from your own view, or delete it for everyone in the chat?"
          : "This removes the message from your view only."}
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={isMe ? "secondary" : "danger"} size="sm" onClick={onDeleteForMe}>
          Delete for me
        </Button>
        {isMe && (
          <Button variant="danger" size="sm" icon={Trash2} onClick={onDeleteForEveryone}>
            Delete for everyone
          </Button>
        )}
      </div>
    </Modal>
  );
}

/* ─── AttachThumb ─────────────────────────────────────── */
export function AttachThumb({ f, onRemove, isDark }) {
  const isImg = f.file.type.startsWith("image/");
  const isPdf = f.file.type === "application/pdf";
  const isDoc = /word|document/i.test(f.file.type);
  const isXls = /excel|sheet/i.test(f.file.type);
  const isPpt = /powerpoint|presentation/i.test(f.file.type);
  const isVid = f.file.type.startsWith("video/");
  const isAud = f.file.type.startsWith("audio/");
  const isZip = /zip|rar/i.test(f.file.type);

  const objUrl = useRef(isImg ? URL.createObjectURL(f.file) : "");
  useEffect(() => () => { if (objUrl.current) URL.revokeObjectURL(objUrl.current); }, []);

  const typeInfo = isPdf ? { icon: "📄", accentBg: isDark ? "rgba(220,38,38,0.15)" : "#fef2f2" }
    : isDoc  ? { icon: "📝", accentBg: isDark ? "rgba(37,99,235,0.15)" : "#eff6ff" }
    : isXls  ? { icon: "📊", accentBg: isDark ? "rgba(22,163,74,0.15)" : "#f0fdf4" }
    : isPpt  ? { icon: "📋", accentBg: isDark ? "rgba(234,88,12,0.15)" : "#fff7ed" }
    : isVid  ? { icon: "🎬", accentBg: isDark ? "rgba(124,58,237,0.15)" : "#f5f3ff" }
    : isAud  ? { icon: "🎵", accentBg: isDark ? "rgba(8,145,178,0.15)" : "#ecfeff" }
    : isZip  ? { icon: "🗜️", accentBg: isDark ? "rgba(133,77,14,0.15)" : "#fefce8" }
    :          { icon: "📎", accentBg: isDark ? "rgba(99,102,241,0.15)" : "#e6f4fb" };

  const isUnsupported = f.status === "unsupported";
  const statusColor = f.status === "done" ? "#16a34a" : f.status === "error" || f.status === "cancelled" ? "#dc2626" : isUnsupported ? "#f59e0b" : "#0684BC";
  const statusLabel = f.status === "done" ? "Done" : f.status === "error" ? "Failed" : f.status === "cancelled" ? "Cancelled" : isUnsupported ? "Unsupported" : f.status === "uploading" ? `${f.progress}%` : "Waiting…";

  const barColor = f.status === "done" ? "#16a34a" : f.status === "error" || f.status === "cancelled" ? "#dc2626" : isUnsupported ? "#f59e0b" : "#0684BC";
  const barWidth = f.status === "done" || f.status === "error" || f.status === "cancelled" || isUnsupported ? "100%" : `${f.progress}%`;
  const isShimmer = f.status === "uploading";

  const rowBg     = isDark ? "#16161f" : "#fff";
  const rowBorder = isDark ? "#1e1e2a" : "rgba(0,0,0,0.07)";
  const nameColor = isDark ? "#e8e8f0" : "#111";
  const metaColor = isDark ? "#55556a" : "#9ca3af";
  const trackBg   = isDark ? "#1e1e2e" : "#f0f0f4";
  const cancelBg  = f.status === "error" ? (isDark ? "rgba(220,38,38,0.15)" : "#fef2f2") : (isDark ? "rgba(255,255,255,0.06)" : "#f6f7f9");
  const cancelBord= f.status === "error" ? "rgba(220,38,38,0.35)" : (isDark ? "#2a2a3a" : "rgba(0,0,0,0.08)");
  const cancelX   = f.status === "error" ? "#dc2626" : (isDark ? "#666" : "#888");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: rowBg, border: `1px solid ${rowBorder}`, borderRadius: 12, minWidth: 230, maxWidth: 300, flexShrink: 0, animation: "tc-slide-in 0.22s ease" }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: isImg && objUrl.current ? "transparent" : typeInfo.accentBg, position: "relative" }}>
        {isImg && objUrl.current
          ? <img src={objUrl.current} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
          : <span style={{ fontSize: 20, lineHeight: 1 }}>{typeInfo.icon}</span>
        }
        {f.status === "uploading" && (
          <div style={{ position: "absolute", inset: 3, borderRadius: "50%", border: `2px solid ${isDark ? "#1e1e3a" : "#d5ecf6"}`, borderTopColor: "#0684BC", animation: "tc-spin 0.75s linear infinite", pointerEvents: "none" }} />
        )}
        {f.status === "done" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(22,163,74,0.18)", borderRadius: 10 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 10.5l3.5 3.5 6.5-7" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: "tc-check 0.3s ease forwards" }} />
            </svg>
          </div>
        )}
        {isUnsupported && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(245,158,11,0.18)", borderRadius: 10 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 3L18 17H2L10 3Z" stroke="#f59e0b" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(245,158,11,0.15)" />
              <path d="M10 9v4" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
              <circle cx="10" cy="14.5" r="0.8" fill="#f59e0b" />
            </svg>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: nameColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3 }}>
          {f.file.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: metaColor, marginBottom: 4 }}>
          <span>{fmtSize(f.file.size)}</span>
          <span>·</span>
          <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
        </div>
        <div style={{ height: 3, borderRadius: 99, background: trackBg, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 99,
            width: barWidth,
            background: isShimmer
              ? `linear-gradient(90deg, ${isDark ? "#1e1e3a" : "#b8e0ef"} 25%, ${barColor} 50%, ${isDark ? "#1e1e3a" : "#b8e0ef"} 75%)`
              : barColor,
            backgroundSize: isShimmer ? "200% 100%" : undefined,
            animation: isShimmer ? "tc-shimmer 1.2s infinite" : undefined,
            transition: !isShimmer ? "width 0.35s ease" : undefined,
          }} />
        </div>
      </div>

      {f.status !== "done" && (
        <button onClick={() => onRemove(f.id)} title={isUnsupported ? "Remove unsupported file" : "Cancel"}
          style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, border: `1px solid ${cancelBord}`, background: cancelBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "all 0.12s" }}>
          <X size={11} color={cancelX} />
        </button>
      )}
    </div>
  );
}

/* ─── MsgAttachView ───────────────────────────────────── */
export function MsgAttachView({ att, isMe }) {
  const handleDownload = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    forceDownload(att.url, att.fileName);
  };

  if (isImage(att.url, att.mimeType)) {
    return (
      <div style={{ marginBottom: 6 }}>
        <img src={att.url} alt={att.fileName}
          style={{ maxWidth: 220, maxHeight: 200, borderRadius: 10, display: "block", cursor: "pointer" }}
          onClick={handleDownload} />
        <button type="button" onClick={handleDownload}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: isMe ? "rgba(255,255,255,0.70)" : "#0684BC", marginTop: 4, textDecoration: "none", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
          <Download size={11} /> Download
        </button>
      </div>
    );
  }

  const AttachIcon = attachTypeIcon(att.mimeType, att.fileName);

  return (
    <button type="button" onClick={handleDownload}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: isMe ? "rgba(255,255,255,0.15)" : "#f3f4f6", borderRadius: 10, padding: "10px 12px", textDecoration: "none", marginBottom: 6, border: isMe ? "1px solid rgba(255,255,255,0.2)" : "1px solid #e5e7eb", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <AttachIcon size={20} color={isMe ? "#b8e0ef" : "#0684BC"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: isMe ? "#fff" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {att.fileName}
        </div>
        <div style={{ fontSize: 11, color: isMe ? "rgba(255,255,255,0.60)" : "#9ca3af" }}>
          {fmtSize(att.size)} · Download
        </div>
      </div>
      <Download size={14} color={isMe ? "rgba(255,255,255,0.65)" : "#9ca3af"} />
    </button>
  );
}

/* ─── MsgBubbleActions ────────────────────────────────── */
export function MsgBubbleActions({ isMe, msg, onEdit, onDelete, isDark }) {
  if (msg.deleted) return null;
  const btnBase = { width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.12s" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, opacity: 0, transition: "opacity 0.15s" }} className="tc-msg-actions">
      {isMe && msg.text && (
        <button title="Edit" onClick={onEdit}
          style={{ ...btnBase, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", color: isDark ? "#a0a0c0" : "#888" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(6,132,188,0.18)" : "rgba(6,132,188,0.10)"; e.currentTarget.style.color = "#0684BC"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"; e.currentTarget.style.color = isDark ? "#a0a0c0" : "#888"; }}>
          <Pencil size={12} />
        </button>
      )}
      <button title="Delete" onClick={onDelete}
        style={{ ...btnBase, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", color: isDark ? "#a0a0c0" : "#888" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#ef4444"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"; e.currentTarget.style.color = isDark ? "#a0a0c0" : "#888"; }}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}
