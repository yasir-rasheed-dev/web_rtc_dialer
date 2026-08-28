import { useCallback, useEffect, useState } from "react";
import { Building2, CircleDollarSign, LogOut, RefreshCw } from "lucide-react";

import Button from "../../components/ui/Button";
import ThemeToggle from "../../components/ui/ThemeToggle";
import { getSuperAdminToken, setSuperAdminToken, superApi } from "../../lib/api";
import SuperAdminLogin from "./Login";
import SetupsPage from "./SetupsPage";
import PlansPage from "./PlansPage";

const NAV_ITEMS = [
  { id: "setups", label: "Setups", icon: Building2 },
  { id: "plans", label: "Plans", icon: CircleDollarSign }
];

export default function SuperAdminApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(getSuperAdminToken()));
  const [tab, setTab] = useState("setups");
  const [overview, setOverview] = useState({ summary: {}, tenants: [] });
  const [plans, setPlans] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setDataLoading(true);
    setError("");
    try {
      const [overviewPayload, plansPayload] = await Promise.all([superApi("/super-admin/overview"), superApi("/super-admin/plans")]);
      setOverview(overviewPayload);
      setPlans(plansPayload.plans || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getSuperAdminToken()) {
      setLoading(false);
      return;
    }
    superApi("/super-admin/auth/session")
      .then(setSession)
      .catch(() => setSuperAdminToken(""))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-content-center gap-3 justify-items-center bg-bg text-muted">
        <RefreshCw className="animate-spin text-brand" size={26} />
        <span className="text-sm">Loading Product Owner portal…</span>
      </div>
    );
  }
  if (!session) return <SuperAdminLogin onAuthenticated={setSession} />;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-blue-700 text-xs font-extrabold text-white">
              RN
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-text">Ringnex SaaS</p>
              <p className="text-[11px] text-muted">Product Owner</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-text">{session.admin?.name || session.name}</p>
              <p className="text-[11px] text-muted">SUPER ADMIN</p>
            </div>
            <Button
              variant="icon"
              size="icon"
              icon={LogOut}
              onClick={() => {
                setSuperAdminToken("");
                setSession(null);
              }}
            />
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 px-6">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`relative flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "border-brand text-brand" : "border-transparent text-muted hover:text-text"
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && <div className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
        {tab === "setups" && (
          <SetupsPage plans={plans} tenants={overview.tenants || []} summary={overview.summary || {}} loading={dataLoading} onReload={load} />
        )}
        {tab === "plans" && <PlansPage plans={plans} loading={dataLoading} onReload={load} />}
      </main>
    </div>
  );
}
