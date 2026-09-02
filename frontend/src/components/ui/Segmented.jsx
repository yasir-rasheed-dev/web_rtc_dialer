/**
 * Small pill segmented control. `options` = [{ value, label }].
 * Controlled: pass `value` + `onChange(value)`.
 */
export default function Segmented({ value, onChange, options, size = "sm", className = "" }) {
  const pad = size === "md" ? "px-3.5 py-2 text-sm" : "px-3 py-1.5 text-xs";
  return (
    <div className={`inline-flex rounded-lg border border-border bg-surface-2 p-0.5 font-semibold ${className}`}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              `rounded-md transition-colors ${pad} ` +
              (active ? "bg-surface text-text ring-1 ring-border" : "text-muted hover:text-text")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
