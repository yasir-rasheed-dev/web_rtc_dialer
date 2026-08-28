export function fieldLabelClass() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

export const STATUS_OPTIONS = [
  { value: "TRIAL", label: "Trial" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CANCELLED", label: "Cancelled" }
];
export const DESTRUCTIVE_STATUSES = new Set(["SUSPENDED", "CANCELLED", "INACTIVE"]);

export function statusTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "TRIAL") return "brand";
  if (DESTRUCTIVE_STATUSES.has(status)) return "danger";
  return "neutral";
}
