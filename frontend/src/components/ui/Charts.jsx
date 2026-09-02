/**
 * Zero-dependency inline-SVG chart kit. Everything is theme-aware — colours
 * come from the --rn-* tokens so light/dark just work. Keep it small: only
 * the shapes the dashboards actually need (donut, horizontal bars, columns).
 */

export const CHART_COLORS = {
  blue: "rgb(var(--rn-blue))",
  accent: "rgb(var(--rn-accent))",
  green: "rgb(var(--rn-green))",
  amber: "rgb(var(--rn-amber))",
  red: "rgb(var(--rn-red))",
  muted: "rgb(var(--rn-muted) / 0.45)"
};

/* ---------------------------------------------------------------- Donut -- */

export function DonutChart({ data = [], size = 172, thickness = 20, centerLabel, centerValue }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--rn-surface-3))"
          strokeWidth={thickness}
        />
        {total > 0 &&
          data.map((d, i) => {
            const frac = (Number(d.value) || 0) / total;
            const len = frac * c;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color || CHART_COLORS.blue}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return seg;
          })}
      </svg>
      <div className="min-w-0">
        {(centerValue !== undefined || centerLabel) && (
          <div className="mb-2">
            <p className="text-2xl font-bold leading-none tracking-tight text-text">
              {centerValue ?? total}
            </p>
            {centerLabel && <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">{centerLabel}</p>}
          </div>
        )}
        <ul className="space-y-1.5">
          {data.map((d, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color || CHART_COLORS.blue }} />
              <span className="text-muted">{d.label}</span>
              <span className="ml-auto font-semibold text-text">{d.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Horizontal bars -- */

export function HBarList({ items = [], unit = "", emptyLabel = "No data" }) {
  if (!items.length) return <p className="py-6 text-center text-xs text-muted">{emptyLabel}</p>;
  const max = Math.max(1, ...items.map((it) => Number(it.max ?? it.value) || 0));

  return (
    <ul className="space-y-3">
      {items.map((it, i) => {
        const val = Number(it.value) || 0;
        const cap = Number(it.max) || 0;
        const pct = Math.min(100, (val / max) * 100);
        const over = cap > 0 && val > cap;
        return (
          <li key={i}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-text">{it.label}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {val}
                {cap ? ` / ${cap}` : ""} {unit}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(pct, val > 0 ? 4 : 0)}%`,
                  background: over ? CHART_COLORS.accent : it.color || CHART_COLORS.blue
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------- Column bars -- */

export function BarChart({ data = [], height = 160, color = CHART_COLORS.blue, valueFormat = (v) => v }) {
  if (!data.length) return <p className="py-6 text-center text-xs text-muted">No data</p>;
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));

  return (
    <div className="flex items-stretch gap-3" style={{ height }}>
      {data.map((d, i) => {
        const val = Number(d.value) || 0;
        const pct = Math.max(val > 0 ? 4 : 0, (val / max) * 100);
        return (
          <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] font-semibold tabular-nums text-text">{valueFormat(val)}</span>
            {/* fixed-height track so the bar's % resolves */}
            <div className="flex w-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-[46px] rounded-t-md transition-[height] duration-500"
                style={{ height: `${pct}%`, minHeight: val > 0 ? 3 : 0, background: d.color || color }}
              />
            </div>
            <span className="w-full truncate text-center text-[10px] text-muted" title={d.label}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
