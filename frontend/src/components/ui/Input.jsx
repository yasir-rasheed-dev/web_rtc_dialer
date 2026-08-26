import { forwardRef } from "react";

// Single source of truth for "field" styling — every text input, the
// DatePicker trigger, and react-select's control (Select.jsx) all resolve
// to this exact border/radius/background/focus treatment so the system
// has one consistent field look instead of three slightly different ones.
export const FIELD_CLASS =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20";

const Input = forwardRef(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`${FIELD_CLASS} ${className}`} {...props} />;
});

export default Input;
