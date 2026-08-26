import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const LABEL_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function parseValue(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return Boolean(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
}

function buildMonthGrid(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const startOffset = new Date(year, month, 1).getDay();
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/**
 * Dependency-free calendar date picker in the shadcn date-picker style: a
 * field-styled trigger button (matches Input/Select exactly) opening a
 * popover with month navigation and a day grid. Value/onChange use the same
 * "YYYY-MM-DD" string the native <input type="date"> produced, so call
 * sites only need their onChange handler adjusted, not their state shape.
 */
export default function DatePicker({ value, onChange, placeholder = "Pick a date", className = "" }) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseValue(value), [value]);
  const [viewDate, setViewDate] = useState(() => selected || new Date());
  const rootRef = useRef(null);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    if (selected) setViewDate(selected);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const days = useMemo(() => buildMonthGrid(viewDate), [viewDate]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        // h-[42px] (not just py-2.5) because this trigger is a <button>: the
        // global `button { padding: 0 }` reset (kills native OS button
        // chrome elsewhere) wins over the padding utilities here, so height
        // can't be left to padding alone the way Input/Select do it — an
        // explicit height is the only thing nothing else contests.
        className="flex h-[42px] w-full items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 text-left text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
      >
        <CalendarIcon size={15} className="shrink-0 text-muted" />
        <span className={selected ? "text-text" : "text-muted"}>{selected ? LABEL_FORMAT.format(selected) : placeholder}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-30 mt-2 w-[280px] rounded-2xl border border-border bg-surface p-3 shadow-card"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-text">{MONTH_FORMAT.format(viewDate)}</span>
              <button
                type="button"
                onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 px-1">
              {WEEKDAYS.map((day) => (
                <span key={day} className="flex h-8 items-center justify-center text-[11px] font-medium text-muted">
                  {day}
                </span>
              ))}
              {days.map((date) => {
                const outside = date.getMonth() !== viewDate.getMonth();
                const isSelected = isSameDay(date, selected);
                const isToday = isSameDay(date, today);
                return (
                  <button
                    type="button"
                    key={date.toISOString()}
                    onClick={() => {
                      onChange(toValue(date));
                      setOpen(false);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-[13px] transition-colors ${
                      isSelected
                        ? "bg-brand font-semibold text-white"
                        : outside
                          ? "text-muted/50 hover:bg-surface-2 hover:text-text"
                          : isToday
                            ? "font-semibold text-brand ring-1 ring-inset ring-brand/40"
                            : "text-text hover:bg-surface-2"
                    }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
