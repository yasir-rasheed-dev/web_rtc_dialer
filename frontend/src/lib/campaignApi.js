import { api } from "./api";

// ---------------------------
// Campaign management
// ---------------------------

export function listCampaigns() {
  return api("/campaigns").then((payload) => payload.campaigns || []);
}

export function createCampaign(body) {
  return api("/campaigns", { method: "POST", body });
}

// The backend writes every column on update, so callers must send the whole
// record — a partial body would blank the missing fields.
export function updateCampaign(campaign) {
  return api(`/campaigns/${encodeURIComponent(campaign.id)}`, {
    method: "PATCH",
    body: {
      name: campaign.name,
      description: campaign.description ?? null,
      mode: campaign.mode,
      status: campaign.status,
      startDate: campaign.start_date || campaign.startDate || null,
      endDate: campaign.end_date || campaign.endDate || null,
      timezone: campaign.timezone || "UTC",
      maxAttempts: campaign.max_attempts ?? campaign.maxAttempts ?? 3,
      retryDelayMinutes: campaign.retry_delay_minutes ?? campaign.retryDelayMinutes ?? 30
    }
  });
}

export function deleteCampaign(id) {
  return api(`/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function uploadCampaignContacts(id, file) {
  const form = new FormData();
  form.append("file", file);
  return api(`/campaigns/${encodeURIComponent(id)}/upload`, { method: "POST", body: form });
}

export function assignCampaignAgents(id, agents, type = "ROUND_ROBIN") {
  return api(`/campaigns/${encodeURIComponent(id)}/assign`, {
    method: "POST",
    body: { agents, type }
  });
}

export function getCampaignReport(id) {
  return api(`/campaigns/${encodeURIComponent(id)}/report`);
}

// ---------------------------
// Agent dialer
// ---------------------------

export function getNextContact(campaignId) {
  return api(`/campaigns/dialer/next/${encodeURIComponent(campaignId)}`);
}

export function startContactCall(contactId, callId = null) {
  return api("/campaigns/dialer/call", { method: "POST", body: { contactId, callId } });
}

export function saveDisposition(body) {
  return api("/campaigns/dialer/disposition", { method: "PATCH", body });
}

// Outcomes the dialer endpoint accepts, in the order agents pick them.
export const DIALER_OUTCOMES = [
  { value: "CONNECTED", label: "Connected" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "BUSY", label: "Busy" },
  { value: "FAILED", label: "Failed" },
  { value: "CALLBACK", label: "Callback requested" },
  { value: "COMPLETED", label: "Completed — do not call again" },
  { value: "DNC", label: "Do not call (DNC)" }
];

// Softphone call outcomes mapped to the dialer outcome they suggest.
export function suggestOutcome(softphoneOutcome, connected) {
  if (connected) return "CONNECTED";
  if (softphoneOutcome === "failed") return "FAILED";
  return "NO_ANSWER";
}
