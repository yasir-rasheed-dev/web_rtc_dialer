import { motion } from "framer-motion";

/**
 * Replaces the `console-card` / `panel` / `table-card` CSS classes. `title`
 * + `description` + `icon` reproduce the old `card-title` header row;
 * anything else goes in `children`.
 */
export default function Card({ title, description, icon: Icon, actions, animate = true, compact = false, className = "", children }) {
  const Wrapper = animate ? motion.section : "section";
  const motionProps = animate
    ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease: "easeOut" } }
    : {};

  return (
    <Wrapper
      {...motionProps}
      className={`rounded-2xl border border-border bg-surface ${compact ? "p-4" : "p-5 sm:p-6"} ` + className}
    >
      {(title || description || Icon || actions) && (
        <div className={(compact ? "mb-3" : "mb-4") + " flex items-start justify-between gap-4"}>
          <div>
            {title && <h2 className="text-[13px] font-semibold text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
          </div>
          {actions || (Icon && <Icon size={18} className="shrink-0 text-muted" />)}
        </div>
      )}
      {children}
    </Wrapper>
  );
}
