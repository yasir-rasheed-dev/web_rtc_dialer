import { create } from "zustand";

import { api, refreshSession } from "@/lib/api";
import { clearAuth, getAccessToken, getRefreshToken, loadTokens, setAuthTokens } from "@/lib/auth";
import type { Session } from "@/lib/permissions";

type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; needs2fa: "setup" | "verify"; tempToken?: string; qr?: string }
  | { ok: false; error: string; code?: string };

type SessionState = {
  session: Session | null;
  status: "boot" | "authed" | "guest";
  bootstrap: () => Promise<void>;
  login: (workspace: string, email: string, password: string, forceLogout?: boolean) => Promise<LoginResult>;
  verify2fa: (stage: "setup" | "verify", code: string) => Promise<LoginResult>;
  refreshSessionData: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  status: "boot",

  async bootstrap() {
    await loadTokens();
    if (!getAccessToken() && !getRefreshToken()) {
      set({ status: "guest" });
      return;
    }
    try {
      if (!getAccessToken()) await refreshSession();
      const session = await api<Session>("/auth/session");
      set({ session, status: "authed" });
    } catch {
      await clearAuth();
      set({ session: null, status: "guest" });
    }
  },

  async login(workspace, email, password, forceLogout = false) {
    try {
      const payload = await api<any>("/auth/login", {
        method: "POST",
        body: { workspace, email, password, forceLogout }
      });
      // Backend may respond with a 2FA challenge instead of tokens.
      if (payload?.twoFactor || payload?.needs2fa) {
        return {
          ok: false,
          needs2fa: payload.twoFactorSetup || payload.stage === "setup" ? "setup" : "verify",
          tempToken: payload.tempToken || payload.token,
          qr: payload.qr || payload.otpauthUrl
        };
      }
      await setAuthTokens(payload);
      const session = await api<Session>("/auth/session");
      set({ session, status: "authed" });
      return { ok: true, session };
    } catch (e: any) {
      return { ok: false, error: e.message || "Login failed", code: e.code };
    }
  },

  async verify2fa(stage, code) {
    try {
      const endpoint = stage === "setup" ? "/auth/2fa/setup-confirm" : "/auth/2fa/verify";
      const payload = await api<any>(endpoint, { method: "POST", body: { code } });
      await setAuthTokens(payload);
      const session = await api<Session>("/auth/session");
      set({ session, status: "authed" });
      return { ok: true, session };
    } catch (e: any) {
      return { ok: false, error: e.message || "Invalid code", code: e.code };
    }
  },

  async refreshSessionData() {
    try {
      const session = await api<Session>("/auth/session");
      set({ session });
    } catch {
      /* keep the stale session; api() handles hard failures */
    }
  },

  async logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* best effort */
    }
    await clearAuth();
    set({ session: null, status: "guest" });
  }
}));
