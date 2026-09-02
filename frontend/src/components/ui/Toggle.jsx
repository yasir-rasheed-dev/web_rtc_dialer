import { motion } from "framer-motion";

/** Pill switch — the replacement for checkbox-based on/off privilege controls. */
export default function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full border p-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? "justify-end border-brand bg-brand"
          : "justify-start border-border-strong bg-[rgb(var(--rn-muted)/0.28)]"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 32 }}
        className={`h-[18px] w-[18px] rounded-full bg-white shadow-sm ${checked ? "" : "ring-1 ring-black/5"}`}
      />
    </button>
  );
}
