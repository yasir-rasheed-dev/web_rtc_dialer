import ReactSelect from "react-select";

// Mirrors Input.jsx's FIELD_CLASS pixel-for-pixel (12px radius, 1px
// var(--rn-border) border, rgb(var(--rn-surface-2)) background, a
// focus:border-brand + focus:ring-2 ring-brand/20 treatment) so a Select
// sitting next to a plain <input> or the DatePicker trigger is
// indistinguishable at rest and matches on focus. Colors reference the
// --rn-* CSS custom properties directly (as plain CSS strings) rather than
// getComputedStyle, so the dropdown re-themes instantly when data-theme
// flips — no re-render or JS theme subscription needed.
const baseStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    backgroundColor: "rgb(var(--rn-surface-2))",
    borderColor: state.isFocused ? "rgb(var(--rn-blue))" : "var(--rn-border)",
    boxShadow: state.isFocused ? "0 0 0 2px rgb(var(--rn-blue) / 0.2)" : "none",
    outline: "none",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
    ":hover": { borderColor: state.isFocused ? "rgb(var(--rn-blue))" : "var(--rn-border-strong)" }
  }),
  valueContainer: (base) => ({ ...base, padding: "2px 14px" }),
  indicatorsContainer: (base) => ({ ...base, paddingRight: 8 }),
  indicatorSeparator: () => ({ display: "none" }),
  menu: (base) => ({
    ...base,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgb(var(--rn-surface))",
    border: "1px solid var(--rn-border)",
    boxShadow: "0 24px 64px rgba(0, 0, 0, 0.28)"
  }),
  // Portaled to <body> (see menuPortalTarget below), so this menuPortal
  // z-index is what actually controls stacking now — without it the menu
  // would render above the page but under other portaled UI (modals,
  // toasts). Also fixes selects inside a `overflow-x-auto` table wrapper
  // (e.g. the campaigns status column): a non-portaled menu gets clipped
  // by the ancestor's overflow instead of floating above it.
  menuPortal: (base) => ({ ...base, zIndex: 65 }),
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
  dropdownIndicator: (base) => ({ ...base, color: "rgb(var(--rn-muted))", padding: 4 }),
  clearIndicator: (base) => ({ ...base, color: "rgb(var(--rn-muted))", padding: 4 }),
  multiValue: (base) => ({ ...base, borderRadius: 8, backgroundColor: "rgb(var(--rn-blue) / 0.14)" }),
  multiValueLabel: (base) => ({ ...base, color: "rgb(var(--rn-text))" })
};

/**
 * Themed react-select wrapper — the drop-in replacement for native
 * `<select>`. Pass the same `options`/`value`/`onChange` shape react-select
 * expects: options = [{ value, label }], onChange receives the option (or
 * null when cleared), not a raw string.
 */
export default function Select({ className = "", styles, menuPortalTarget, ...props }) {
  return (
    <ReactSelect
      classNamePrefix="rn-select"
      className={className}
      styles={styles ? { ...baseStyles, ...styles } : baseStyles}
      menuPortalTarget={menuPortalTarget === undefined ? (typeof document !== "undefined" ? document.body : undefined) : menuPortalTarget}
      {...props}
    />
  );
}
