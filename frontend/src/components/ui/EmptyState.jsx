/** Replaces `.empty-block` / `.empty-state` placeholders. */
export default function EmptyState({ icon: Icon, title, description, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border py-6 text-center ${className}`}>
      {Icon && <Icon size={22} className="mb-0.5 text-muted" />}
      {title && <p className="text-[13px] font-medium text-text">{title}</p>}
      {description && <p className="max-w-xs text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
