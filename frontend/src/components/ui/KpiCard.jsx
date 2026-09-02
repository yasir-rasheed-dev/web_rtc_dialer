import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";

const TONE = {
  blue: { chip: "bg-brand/10 text-brand", color: "rgb(var(--rn-blue))" },
  green: { chip: "bg-success-soft text-success", color: "rgb(var(--rn-green))" },
  orange: { chip: "bg-accent-soft text-accent", color: "rgb(var(--rn-accent))" },
  purple: { chip: "bg-violet-500/10 text-violet-500", color: "rgb(139 92 246)" },
  red: { chip: "bg-danger-soft text-danger", color: "rgb(var(--rn-red))" },
  neutral: { chip: "bg-surface-2 text-muted", color: "rgb(var(--rn-muted))" }
};

/**
 * Stat tile — coloured spine + faint corner wash in the tone colour, icon
 * chip, tiny label, big number, sub-line, and an optional delta pill.
 */
export default function KpiCard({ label, value, detail, icon: Icon, tone = "blue", delta, deltaDir }) {
  const t = TONE[tone] || TONE.blue;
  const showDelta = delta !== undefined && delta !== null && delta !== "";
  const DeltaIcon = deltaDir === "down" ? TrendingDown : TrendingUp;
  const deltaClass = deltaDir === "down" ? "bg-danger-soft text-danger" : "bg-success-soft text-success";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="group relative overflow-hidden rounded-md border border-border bg-surface p-3.5 transition-all hover:-translate-y-0.5 hover:border-border-strong"
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: t.color }} />
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.08] transition-opacity group-hover:opacity-[0.14]"
        style={{ background: t.color }}
      />

      <div className="relative flex items-center justify-between">
        {Icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.chip}`}>
            <Icon size={17} />
          </span>
        )}
        {showDelta && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${deltaClass}`}>
            <DeltaIcon size={12} />
            {delta}
          </span>
        )}
      </div>

      <p className="relative mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="relative mt-1 text-[25px] font-bold leading-none tracking-tight text-text">{value}</p>
      {detail && <p className="relative mt-1.5 text-[11px] text-muted">{detail}</p>}
    </motion.div>
  );
}
