import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const LABEL_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: "long" });
// Localised abbreviated month names for the month grid.
const MONTH_SHORT = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(2020, i, 1))
);
const YEARS_PER_PAGE = 12;

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
 * popover. The header month and year are each their own button — clicking
 * the month drops to a month grid, clicking the year drops to a paged year
 * grid — so jumping to (say) 1997 is two clicks, not thirty "prev" presses,
 * the same reach as a native <input type="date">. Value/onChange use the
 * same "YYYY-MM-DD" string the native input produced.
 */
export default function DatePicker({ value, onChange, placeholder = "Pick a date", className = "" }) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseValue(value), [value]);
  const [viewDate, setViewDate] = useState(() => selected || new Date());
  // "days" (day grid) | "months" (month grid) | "years" (paged year grid)
  const [view, setView] = useState("days");
  // start year of the currently shown year page
  const [yearStart, setYearStart] = useState(() => (selected || new Date()).getFullYear() - 5);
  const rootRef = useRef(null);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    if (selected) setViewDate(selected);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always reopen on the day grid — nobody expects last time's drill-down.
  useEffect(() => {
    if (!open) setView("days");
  }, [open]);

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

  const goPrev = () => {
    if (view === "days") setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    else if (view === "months") setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1));
    else setYearStart((s) => s - YEARS_PER_PAGE);
  };
  const goNext = () => {
    if (view === "days") setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    else if (view === "months") setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1));
    else setYearStart((s) => s + YEARS_PER_PAGE);
  };

  const navBtn = "rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text";
  const headBtn = "rounded-lg px-2 py-1 text-sm font-semibold text-text transition-colors hover:bg-surface-2";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        // h-10 explicit: the global `button { padding: 0 }` reset wins over
        // padding utilities on a <button>, so height can't ride on padding
        // the way Input/Select do it.
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-3.5 text-left text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
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
              <button type="button" onClick={goPrev} className={navBtn} aria-label="Previous">
                <ChevronLeft size={16} />
              </button>

              {view === "days" && (
                <span className="flex items-center gap-0.5">
                  <button type="button" className={headBtn} onClick={() => setView("months")}>
                    {MONTH_LONG.format(viewDate)}
                  </button>
                  <button
                    type="button"
                    className={headBtn}
                    onClick={() => {
                      setYearStart(viewDate.getFullYear() - 5);
                      setView("years");
                    }}
                  >
                    {viewDate.getFullYear()}
                  </button>
                </span>
              )}
              {view === "months" && (
                <button
                  type="button"
                  className={headBtn}
                  onClick={() => {
                    setYearStart(viewDate.getFullYear() - 5);
                    setView("years");
                  }}
                >
                  {viewDate.getFullYear()}
                </button>
              )}
              {view === "years" && (
                <span className="px-2 py-1 text-sm font-semibold text-text">
                  {yearStart} – {yearStart + YEARS_PER_PAGE - 1}
                </span>
              )}

              <button type="button" onClick={goNext} className={navBtn} aria-label="Next">
                <ChevronRight size={16} />
              </button>
            </div>

            {view === "days" && (
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
            )}

            {view === "months" && (
              <div className="grid grid-cols-3 gap-2 px-1 pb-1 pt-1">
                {MONTH_SHORT.map((name, idx) => {
                  const isSelected =
                    selected && selected.getFullYear() === viewDate.getFullYear() && selected.getMonth() === idx;
                  const isCurrent = today.getFullYear() === viewDate.getFullYear() && today.getMonth() === idx;
                  return (
                    <button
                      type="button"
                      key={name}
                      onClick={() => {
                        setViewDate(new Date(viewDate.getFullYear(), idx, 1));
                        setView("days");
                      }}
                      className={`flex h-10 items-center justify-center rounded-lg text-[13px] transition-colors ${
                        isSelected
                          ? "bg-brand font-semibold text-white"
                          : isCurrent
                            ? "font-semibold text-brand ring-1 ring-inset ring-brand/40"
                            : "text-text hover:bg-surface-2"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}

            {view === "years" && (
              <div className="grid grid-cols-3 gap-2 px-1 pb-1 pt-1">
                {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearStart + i).map((year) => {
                  const isSelected = selected && selected.getFullYear() === year;
                  const isCurrent = today.getFullYear() === year;
                  return (
                    <button
                      type="button"
                      key={year}
                      onClick={() => {
                        setViewDate(new Date(year, viewDate.getMonth(), 1));
                        setView("months");
                      }}
                      className={`flex h-10 items-center justify-center rounded-lg text-[13px] transition-colors ${
                        isSelected
                          ? "bg-brand font-semibold text-white"
                          : isCurrent
                            ? "font-semibold text-brand ring-1 ring-inset ring-brand/40"
                            : "text-text hover:bg-surface-2"
                      }`}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
