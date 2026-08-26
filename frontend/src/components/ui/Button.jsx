import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary:
    "bg-brand text-white shadow-[0_10px_24px_-6px_rgb(var(--rn-blue)/0.45)] hover:brightness-110 " +
    "disabled:hover:brightness-100",
  secondary:
    "bg-surface-2 text-text border border-border hover:border-border-strong hover:bg-surface-3",
  ghost: "bg-transparent text-brand hover:bg-brand/10 shadow-none",
  danger:
    "bg-danger text-white shadow-[0_10px_24px_-6px_rgb(var(--rn-red)/0.45)] hover:brightness-110 " +
    "disabled:hover:brightness-100",
  icon: "bg-surface-2 text-muted border border-border hover:text-text hover:border-border-strong"
};

const SIZES = {
  md: "h-10 px-4 text-sm gap-2",
  sm: "h-8 px-3 text-xs gap-1.5",
  icon: "h-9 w-9 p-0 justify-center"
};

/**
 * Shared button primitive. `loading` shows a spinner in place of the leading
 * icon and auto-disables the button — this is the standard way every
 * mutating action across the app gets a busy indicator during the redesign.
 */
const Button = forwardRef(function Button(
  { variant = "primary", size = "md", loading = false, disabled = false, icon: Icon, className = "", children, ...props },
  ref
) {
  const isIconOnly = size === "icon";
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      disabled={disabled || loading}
      className={
        "inline-flex items-center rounded-xl font-semibold transition-colors duration-150 " +
        "disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-none " +
        "focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 " +
        "focus-visible:ring-offset-bg " +
        `${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`
      }
      {...props}
    >
      {loading ? (
        <Loader2 size={isIconOnly ? 17 : 16} className="animate-spin" />
      ) : (
        Icon && <Icon size={isIconOnly ? 17 : 16} />
      )}
      {!isIconOnly && children}
    </motion.button>
  );
});

export default Button;
