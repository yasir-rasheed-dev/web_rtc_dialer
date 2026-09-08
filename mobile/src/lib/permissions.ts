// Mirror of frontend/src/lib/permissions — the backend sends the flat
// permission list on the session payload; UI just checks membership.

export type Session = {
  user: { id: string; name: string; roleName?: string; email?: string };
  tenant: { id: string; name: string; workspace: string; timezone?: string };
  role?: { id: string; name: string };
  permissions: string[];
  sip?: {
    username: string;
    password: string;
    extension?: string;
    displayName?: string;
    domain: string;
    wssUrl: string;
  } | null;
  agentStatus?: string;
};

export function can(session: Session | null, perm: string): boolean {
  return Boolean(session?.permissions?.includes(perm));
}

export function hasAny(session: Session | null, perms: string[]): boolean {
  return perms.some((p) => can(session, p));
}

export function isOwner(session: Session | null): boolean {
  return session?.role?.name === "Tenant Owner" || session?.user?.roleName === "Tenant Owner";
}

/** Agents (a real SIP account) land on the dialer; everyone else on the owner home. */
export function homeRoute(session: Session | null): "/(agent)/dialer" | "/(owner)/dashboard" {
  return session?.sip?.username ? "/(agent)/dialer" : "/(owner)/dashboard";
}
