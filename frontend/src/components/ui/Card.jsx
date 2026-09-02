import { motion } from "framer-motion";

/**
 * shadcn-style card: 1px border, hairline shadow, medium radius. `title` +
 * `description` + `icon` reproduce the old `card-title` header row; anything
 * else goes in `children`. `actions` sit on the right of the header.
 */
export default function Card({
  title,
  description,
  icon: Icon,
  actions,
  animate = true,
  compact = false,
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
        "rounded-xl border border-border bg-surface " +
        (compact ? "p-4 " : "p-5 sm:p-6 ") +
        className
      }
    >
      {hasHeader && (
        <div className={(compact ? "mb-3" : "mb-5") + " flex items-start justify-between gap-4"}>
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
