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

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await superApi("/super-admin/auth/login", { method: "POST", body: { email, password } });
      setSuperAdminToken(payload.token);
      onAuthenticated(payload);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

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
