import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, ShieldCheck } from "lucide-react";

import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Logo from "../../components/ui/Logo";
import ThemeToggle from "../../components/ui/ThemeToggle";
import { setSuperAdminToken, superApi } from "../../lib/api";
import { fieldLabelClass } from "./shared";

export default function SuperAdminLogin({ onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // "credentials" -> "2fa-setup" (first sign-in, shows a QR) or
  // "2fa-verify" (already enrolled) -> done.
  const [stage, setStage] = useState("credentials");
  const [twoFactor, setTwoFactor] = useState(null); // { pendingToken, secret?, otpauthUrl?, qr? }
  const [code, setCode] = useState("");

  const finish = (payload) => {
    setSuperAdminToken(payload.token);
    onAuthenticated(payload);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await superApi("/super-admin/auth/login", { method: "POST", body: { email, password } });
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
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitTwoFactor = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const endpoint = stage === "2fa-setup"
        ? "/super-admin/auth/2fa/setup-confirm"
        : "/super-admin/auth/2fa/verify";
      const payload = await superApi(endpoint, { method: "POST", body: { pendingToken: twoFactor.pendingToken, code } });
      finish(payload);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const backToCredentials = () => {
    setStage("credentials");
    setTwoFactor(null);
    setCode("");
    setError("");
    setPassword("");
  };

  if (stage === "2fa-setup" || stage === "2fa-verify") {
    return (
      <main className="relative grid min-h-screen place-content-center bg-bg px-6">
        <ThemeToggle className="absolute right-6 top-6 z-10" />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-card"
        >
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <ShieldCheck size={20} />
            </span>
            <div>
              <p className="text-sm font-bold text-text">
                {stage === "2fa-setup" ? "Set up two-factor authentication" : "Two-factor authentication"}
              </p>
              <p className="text-xs text-muted">
                {stage === "2fa-setup"
                  ? "Required for the Super Admin account"
                  : "Enter the code from your authenticator app"}
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
                <p className="break-all rounded-md bg-surface-3 px-2 py-1 text-center font-mono text-[11px] text-muted">
                  {twoFactor.secret}
                </p>
              )}
            </div>
          )}

          <form onSubmit={submitTwoFactor} className="flex flex-col gap-4">
            <label className={fieldLabelClass()}>
              6-digit code
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                required
                autoFocus
              />
            </label>
            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
            <Button type="submit" loading={busy} icon={ShieldCheck} className="w-full justify-center">
              {busy ? "Verifying…" : stage === "2fa-setup" ? "Confirm & sign in" : "Verify & sign in"}
            </Button>
            <button
              type="button"
              onClick={backToCredentials}
              className="text-center text-xs font-medium text-muted hover:text-text"
            >
              Back
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="relative grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-[480px_1fr]">
      <ThemeToggle className="absolute right-6 top-6 z-10" />

      <section className="flex flex-col justify-center border-b border-border bg-surface px-8 py-12 sm:px-14 lg:border-b-0 lg:border-r lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mx-auto w-full max-w-sm"
        >
          <div className="mb-9 flex items-center gap-3">
            <Logo height={30} />
            <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Product Owner
            </span>
          </div>

          <span className="text-[11px] font-extrabold tracking-[0.16em] text-accent">SUPER ADMIN</span>
          <h1 className="mt-2 text-[38px] font-bold leading-tight tracking-tight text-text">Manage every setup</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Create tenants, control plans, extension ranges, limits and workspace status.
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
            <label className={fieldLabelClass()}>
              Email
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <label className={fieldLabelClass()}>
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
              {busy ? "Signing in…" : "Super Admin Sign in"}
            </Button>
            <p className="text-center text-[11px] text-muted">Protected by two-factor authentication</p>
          </form>
        </motion.div>
      </section>

      <aside className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-surface-2 to-bg lg:flex">
        <div className="max-w-sm px-10 text-center">
          <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full bg-brand/25"
            />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-surface shadow-card">
              <Building2 size={28} className="text-brand" />
            </span>
          </div>
          <h2 className="text-2xl font-bold leading-snug text-text">
            One platform.
            <br />
            Many isolated workspaces.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Product-level control without exposing one client's data to another.
          </p>
        </div>
      </aside>
    </main>
  );
}
