import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary: "bg-brand text-white hover:brightness-[1.07] disabled:hover:brightness-100",
  accent: "bg-accent text-white hover:brightness-[1.07] disabled:hover:brightness-100",
  secondary:
    "bg-surface text-text border border-border hover:bg-surface-2 hover:border-border-strong",
  ghost: "bg-transparent text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-[1.07] disabled:hover:brightness-100",
  icon: "bg-surface text-muted border border-border hover:text-text hover:bg-surface-2 hover:border-border-strong"
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
        "inline-flex items-center rounded-lg font-semibold transition-colors duration-150 " +
        "disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-none " +
        "focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 " +
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
