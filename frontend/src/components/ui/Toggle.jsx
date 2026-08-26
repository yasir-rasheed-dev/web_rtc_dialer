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
      className={`flex h-6 w-11 shrink-0 items-center rounded-full p-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "justify-end bg-brand" : "justify-start bg-surface-3"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 32 }}
        className="h-[18px] w-[18px] rounded-full bg-white shadow"
      />
    </button>
  );
}
