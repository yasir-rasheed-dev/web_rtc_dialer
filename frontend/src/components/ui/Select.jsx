import ReactSelect from "react-select";

// Colors reference the --rn-* CSS custom properties directly (as plain CSS
// strings, e.g. "rgb(var(--rn-surface))") rather than reading them via
// getComputedStyle, so the dropdown re-themes instantly when data-theme
// flips — no re-render or JS theme subscription needed.
const baseStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "rgb(var(--rn-surface-2))",
    borderColor: state.isFocused ? "rgb(var(--rn-blue))" : "var(--rn-border)",
    boxShadow: state.isFocused ? "0 0 0 3px rgb(var(--rn-blue) / 0.2)" : "none",
    ":hover": { borderColor: state.isFocused ? "rgb(var(--rn-blue))" : "var(--rn-border-strong)" }
  }),
  menu: (base) => ({
    ...base,
    zIndex: 30,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgb(var(--rn-surface))",
    border: "1px solid var(--rn-border)",
    boxShadow: "0 24px 64px rgba(0, 0, 0, 0.28)"
  }),
  menuList: (base) => ({ ...base, padding: 4 }),
  option: (base, state) => ({
    ...base,
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: state.isSelected
      ? "rgb(var(--rn-blue) / 0.16)"
      : state.isFocused
        ? "rgb(var(--rn-surface-2))"
        : "transparent",
    color: "rgb(var(--rn-text))",
    cursor: "pointer"
  }),
  singleValue: (base) => ({ ...base, color: "rgb(var(--rn-text))" }),
  input: (base) => ({ ...base, color: "rgb(var(--rn-text))" }),
  placeholder: (base) => ({ ...base, color: "rgb(var(--rn-muted))" }),
  indicatorSeparator: (base) => ({ ...base, backgroundColor: "var(--rn-border)" }),
  dropdownIndicator: (base) => ({ ...base, color: "rgb(var(--rn-muted))" }),
  clearIndicator: (base) => ({ ...base, color: "rgb(var(--rn-muted))" }),
  multiValue: (base) => ({ ...base, borderRadius: 8, backgroundColor: "rgb(var(--rn-blue) / 0.14)" }),
  multiValueLabel: (base) => ({ ...base, color: "rgb(var(--rn-text))" })
};

/**
 * Themed react-select wrapper — the drop-in replacement for native
 * `<select>`. Pass the same `options`/`value`/`onChange` shape react-select
 * expects: options = [{ value, label }], onChange receives the option (or
 * null when cleared), not a raw string.
 */
export default function Select({ className = "", styles, ...props }) {
  return (
    <ReactSelect
      classNamePrefix="rn-select"
      className={className}
      styles={styles ? { ...baseStyles, ...styles } : baseStyles}
      {...props}
    />
  );
}
