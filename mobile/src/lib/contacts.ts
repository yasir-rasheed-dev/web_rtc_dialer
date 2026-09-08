import { api } from "./api";

export type ContactHit = {
  type: "agent" | "contact" | null;
  name: string | null;
  company?: string | null;
  jobTitle?: string | null;
  contactId?: string | null;
};

const cache = new Map<string, ContactHit>();

// Resolve a phone number / extension to a saved contact or agent name.
// Backed by GET /api/contacts/lookup (same endpoint the web End-Call popup
// uses). Returns null when nothing matches.
export async function lookupNumber(raw: string): Promise<ContactHit | null> {
  const num = String(raw || "").trim();
  if (num.replace(/\D/g, "").length < 3) return null;
  if (cache.has(num)) return cache.get(num) || null;
  try {
    const hit = await api<ContactHit>(`/contacts/lookup?number=${encodeURIComponent(num)}`);
    const out = hit && hit.name ? hit : null;
    cache.set(num, out as ContactHit);
    return out;
  } catch {
    return null;
  }
}

export function contactSubtitle(hit: ContactHit | null): string | null {
  if (!hit) return null;
  if (hit.type === "agent") return "Agent";
  return [hit.company, hit.jobTitle].filter(Boolean).join(" · ") || null;
}
