import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";

const TONES = {
  blue: "bg-brand/10 text-brand",
  green: "bg-success-soft text-success",
  orange: "bg-accent-soft text-accent",
  purple: "bg-violet-500/10 text-violet-500",
  red: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-muted"
};

/**
 * shadcn-style stat tile — icon chip, tiny uppercase label, big number,
 * optional sub-line and a coloured delta pill (`delta` = number or string,
 * `deltaDir` = "up" | "down").
 */
export default function KpiCard({ label, value, detail, icon: Icon, tone = "blue", delta, deltaDir }) {
  const showDelta = delta !== undefined && delta !== null && delta !== "";
  const DeltaIcon = deltaDir === "down" ? TrendingDown : TrendingUp;
  const deltaClass =
    deltaDir === "down" ? "bg-danger-soft text-danger" : "bg-success-soft text-success";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-center justify-between">
        {Icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONES[tone] || TONES.blue}`}>
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
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-text">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
    </motion.div>
  );
}
