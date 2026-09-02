import { motion } from "framer-motion";

/**
 * Flat card — 1px border, no shadow. When a header (`title` / `description`
 * / `icon` / `actions`) is present it gets a full-bleed hairline divider so
 * the card reads as a proper panel instead of loose text in a box.
 */
export default function Card({
  title,
  description,
  icon: Icon,
  actions,
  animate = true,
  compact = false,
  interactive = false,
  className = "",
  children
}) {
  const Wrapper = animate ? motion.section : "section";
  const motionProps = animate
    ? { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" } }
    : {};
  const hasHeader = title || description || Icon || actions;

  return (
    <Wrapper
      {...motionProps}
      className={
        "rounded-xl border border-border bg-surface transition-colors " +
        (compact ? "p-4 " : "p-5 sm:p-6 ") +
        (interactive ? "hover:border-border-strong " : "") +
        className
      }
    >
      {hasHeader && (
        <div
          className={
            "flex items-start justify-between gap-4 border-b border-border " +
            (compact ? "-mx-4 mb-4 px-4 pb-3" : "-mx-5 mb-5 px-5 pb-4 sm:-mx-6 sm:px-6")
          }
        >
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight text-text">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : (
            Icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                <Icon size={16} />
              </span>
            )
          )}
        </div>
      )}
      {children}
    </Wrapper>
  );
}
