import { api, getToken } from "./api";
import { API_BASE } from "./apiConfig";

// ---------------------------
// Dispositions — the one shared, tenant-wide, colored picklist (used by
// the Auto Dialer, Leads, and the End Call popup alike).
// ---------------------------

export function getDispositions(includeInactive = false) {
  const query = includeInactive ? "?includeInactive=1" : "";
  return api(`/dispositions${query}`).then((payload) => payload.dispositions || []);
}

export function createDisposition(body) {
  return api("/dispositions", { method: "POST", body });
}

export function updateDisposition(id, body) {
  return api(`/dispositions/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function deleteDisposition(id) {
  return api(`/dispositions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---------------------------
// Leads
// ---------------------------

export function getLeads(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  return api(`/leads?${query.toString()}`);
}

export function getLead(id) {
  return api(`/leads/${encodeURIComponent(id)}`);
}

// The End Call popup's "End & Save" — returns { leadId, interactionId }.
export function saveLeadFromCall(body) {
  return api("/leads/from-call", { method: "POST", body });
}

export function uploadLeadAttachment(interactionId, file) {
  const form = new FormData();
  form.append("file", file);
  return api(`/leads/interactions/${encodeURIComponent(interactionId)}/attachments`, { method: "POST", body: form });
}

export async function leadAttachmentBlob(attachmentId) {
  const response = await fetch(`${API_BASE}/api/leads/attachments/${encodeURIComponent(attachmentId)}`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) throw new Error("Could not load attachment");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// ---------------------------
// Follow-ups
// ---------------------------

export function getFollowUps(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  return api(`/leads/follow-ups?${query.toString()}`);
}

export function getFollowUpKpis() {
  return api("/leads/follow-ups/kpis");
}

export function completeFollowUp(interactionId) {
  return api(`/leads/follow-ups/${encodeURIComponent(interactionId)}/complete`, { method: "POST" });
}
