/** Replaces `.empty-block` / `.empty-state` placeholders. */
export default function EmptyState({ icon: Icon, title, description, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center ${className}`}>
      {Icon && <Icon size={26} className="mb-1 text-muted" />}
      {title && <p className="text-sm font-medium text-text">{title}</p>}
      {description && <p className="max-w-xs text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
