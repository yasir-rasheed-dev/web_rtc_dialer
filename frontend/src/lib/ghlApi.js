import { api } from "./api";

// GoHighLevel — agent-facing (any authenticated user). All of these
// return { active: false } / empty when the tenant has no active GHL
// connection, so callers can treat "off" as a normal state.

export function getGhlAgentConfig() {
  return api("/integrations/crm/agent-config").catch(() => ({ active: false }));
}

export function getGhlCallContext(phone) {
  return api(`/integrations/crm/call-context?phone=${encodeURIComponent(phone || "")}`).catch(() => ({
    active: false,
    contact: null,
    opportunities: []
  }));
}

export function postGhlCallOutcome(body) {
  return api("/integrations/crm/call-outcome", { method: "POST", body });
}

export const OPP_STATUSES = [
  { value: "open", label: "Open" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "abandoned", label: "Abandoned" }
];
