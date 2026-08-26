const TONES = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  brand: "bg-brand/12 text-brand",
  neutral: "bg-surface-3 text-muted"
};

/** Replaces `.status-tag` / `.direction-tag` / `.system-pill` pill badges. */
export default function StatusBadge({ tone = "neutral", icon: Icon, children, className = "" }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold " +
        `${TONES[tone] || TONES.neutral} ${className}`
      }
    >
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
}
