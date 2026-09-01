import { motion } from "framer-motion";

/** Replaces the `page-heading` markup: eyebrow/title/description on the left, actions on the right. */
export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-wrap items-start justify-between gap-3"
    >
      <div>
        {eyebrow && <span className="text-[10px] font-bold tracking-[0.14em] text-brand">{eyebrow}</span>}
        <h1 className="mt-0.5 text-xl font-semibold leading-tight tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </motion.div>
  );
}
