import { useState } from "react";
import { motion } from "framer-motion";
import { PhoneCall, Radio, ShieldCheck, Users } from "lucide-react";

const FEATURES = [
  { icon: PhoneCall, text: "Browser calling over WSS signaling + DTLS-SRTP media" },
  { icon: Users, text: "Roles, teams and permission-based access per workspace" },
  { icon: ShieldCheck, text: "Tenant-isolated data — nothing crosses workspace lines" }
];

import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import ThemeToggle from "../../components/ui/ThemeToggle";
import { confirmModal } from "../../lib/modal";
import { api, setToken } from "../../lib/api";

export default function Login({ onAuthenticated }) {
  const [workspace, setWorkspace] = useState(localStorage.getItem("ringnex.workspace") || "legacy");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // "credentials" -> "2fa-setup" (first-ever enrollment, shows a QR to
  // scan) or "2fa-verify" (already enrolled, just needs a code) -> done.
  const [stage, setStage] = useState("credentials");
  const [twoFactor, setTwoFactor] = useState(null); // { pendingToken, secret?, otpauthUrl?, qr? }
  const [code, setCode] = useState("");

  const finish = (payload) => {
    setToken(payload.token);
    localStorage.setItem("ringnex.workspace", workspace);
    onAuthenticated(payload);
  };

  const attemptLogin = async (forceLogout = false) => {
    const payload = await api("/auth/login", { method: "POST", body: { workspace, email, password, forceLogout } });
    if (payload.requiresSetup) {
      setTwoFactor(payload);
      setStage("2fa-setup");
      return;
    }
    if (payload.requires2fa) {
      setTwoFactor(payload);
      setStage("2fa-verify");
      return;
    }
    finish(payload);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await attemptLogin(false);
    } catch (requestError) {
      if (requestError.code === "SESSION_ACTIVE") {
        const confirmed = await confirmModal({
          title: "Already signed in elsewhere",
          message: "This account is already signed in on another device or browser. Sign out that session and continue here?",
          confirmText: "Sign out other session",
          danger: true
        });
        if (confirmed) {
          try {
            await attemptLogin(true);
          } catch (retryError) {
            setError(retryError.message);
          }
        }
      } else {
        setError(requestError.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitTwoFactor = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const endpoint = stage === "2fa-setup" ? "/auth/2fa/setup-confirm" : "/auth/2fa/verify";
      const payload = await api(endpoint, { method: "POST", body: { pendingToken: twoFactor.pendingToken, code } });
      finish(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const backToCredentials = () => {
    setStage("credentials");
    setTwoFactor(null);
    setCode("");
    setError("");
  };

  if (stage === "2fa-setup" || stage === "2fa-verify") {
    return (
      <main className="grid min-h-screen place-content-center bg-bg px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-card"
        >
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <ShieldCheck size={20} />
            </span>
            <div>
              <p className="text-sm font-bold text-text">
                {stage === "2fa-setup" ? "Set up two-factor authentication" : "Two-factor authentication"}
              </p>
              <p className="text-xs text-muted">
                {stage === "2fa-setup" ? "Required by your workspace for this account" : "Enter the code from your authenticator app"}
              </p>
            </div>
          </div>

          {stage === "2fa-setup" && (
            <div className="mb-5 flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-2 p-4">
              <p className="text-center text-xs text-muted">
                Scan this with Google Authenticator (or any TOTP app), then enter the 6-digit code it shows.
              </p>
              {twoFactor?.qr && <img src={twoFactor.qr} alt="2FA QR code" className="h-40 w-40 rounded-lg bg-white p-2" />}
              {twoFactor?.secret && (
                <p className="break-all rounded-md bg-surface-3 px-2 py-1 text-center font-mono text-[11px] text-text">
                  {twoFactor.secret}
                </p>
              )}
            </div>
          )}

          <form onSubmit={submitTwoFactor} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              6-digit code
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>
            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
            <Button type="submit" loading={busy} icon={ShieldCheck} className="w-full justify-center">
              {stage === "2fa-setup" ? "Verify & enable" : "Verify"}
            </Button>
            <button type="button" onClick={backToCredentials} className="text-center text-xs font-medium text-muted hover:text-text">
              Back to sign in
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  return (
    // h-screen + overflow-hidden (not min-h-screen): this is a locked,
    // single-viewport screen by design — it must never need a page-level
    // scroll. Flexbox rather than grid here specifically because flex's
    // default `align-items: stretch` reliably fills both columns to the
    // container's full height; a grid's implicit row track sizes to
    // content (`auto`) even inside a fixed-height container, which let
    // the taller column push the whole page past the viewport. Each
    // column still gets its own overflow-y-auto as a safety net for very
    // short windows, but normal content fits without it ever engaging.
    <main className="relative flex h-screen flex-col overflow-hidden bg-bg md:flex-row">
      <ThemeToggle className="absolute right-5 top-5 z-10" />

      <section className="flex flex-1 flex-col justify-center overflow-y-auto border-b border-border bg-surface px-6 py-8 sm:px-10 md:border-b-0 md:border-r md:px-12 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mx-auto w-full max-w-sm"
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-blue-700 text-sm font-extrabold text-white shadow-[0_12px_30px_-8px_rgb(var(--rn-blue)/0.45)]">
              RN
            </span>
            <div>
              <p className="text-base font-bold text-text">Ringnex</p>
              <p className="text-xs text-muted">SaaS Contact Center</p>
            </div>
          </div>

          <span className="text-[11px] font-extrabold tracking-[0.16em] text-brand">WORKSPACE SIGN IN</span>
          <h1 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight text-text sm:text-[32px]">Welcome back</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Use the setup/workspace assigned by your Ringnex Product Owner.
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              Workspace
              <Input
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value.toLowerCase())}
                placeholder="abc-towing"
                autoComplete="organization"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              Email
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              Password
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
            <Button type="submit" loading={busy} icon={ShieldCheck} className="mt-1 w-full justify-center">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck size={16} />
            <span>Tenant-isolated session · WSS signaling · DTLS-SRTP media</span>
          </div>
        </motion.div>
      </section>

      <aside className="relative hidden flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-surface-2 to-bg px-10 md:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: "radial-gradient(circle, rgb(var(--rn-blue) / 0.14) 1px, transparent 1px)",
            backgroundSize: "26px 26px"
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut", delay: 0.1 }}
          className="relative w-full max-w-sm text-center"
        >
          <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full bg-brand/25"
            />
            <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-surface shadow-card">
              <Radio size={22} className="text-brand" />
            </span>
          </div>
          <h2 className="text-xl font-bold leading-snug text-text">
            One app. Your own workspace.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Roles, extensions, contacts, calls and DIDs are resolved after authentication.
          </p>

          <div className="mt-6 flex flex-col gap-2 text-left">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-surface/70 px-3 py-2 backdrop-blur-sm"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <Icon size={12} />
                </span>
                <p className="text-xs leading-snug text-muted">{text}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </aside>
    </main>
  );
}
