import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * General-purpose modal shell. Controlled via `open`; always mounted so
 * AnimatePresence can animate both directions. Used directly by feature
 * pages, and internally by ModalHost for the prompt/confirm dialogs that
 * replace window.prompt()/window.confirm().
 */
export default function Modal({ open, onClose, title, children, width = "max-w-md" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose?.();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={`flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-card ${width}`}
          >
            {title && (
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-text">{title}</h2>
                <button
                  type="button"
                  onClick={() => onClose?.()}
                  aria-label="Close"
                  className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-text"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
