import { toast } from "sonner";

// Thin wrapper so call sites import one thing and every toast in the app
// gets consistent copy/duration conventions. Replaces the `.alert`/notice
// banners that were used for transient success/error messages; persistent
// inline form-validation errors stay as inline text, not toasts.
export const notifySuccess = (message) => toast.success(message);
export const notifyError = (message) => toast.error(message);
export const notifyInfo = (message) => toast(message);
export const notifyWarning = (message) => toast.warning(message);
