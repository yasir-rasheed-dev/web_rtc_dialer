import { useCallback, useEffect, useState } from "react";
import { Building2, CircleDollarSign, ClipboardList, LayoutDashboard, LogOut, RefreshCw } from "lucide-react";

import Button from "../../components/ui/Button";
import Logo from "../../components/ui/Logo";
import ThemeToggle from "../../components/ui/ThemeToggle";
import { getSuperAdminToken, setSuperAdminToken, superApi } from "../../lib/api";
import SuperAdminLogin from "./Login";
import OverviewPage from "./OverviewPage";
import SetupsPage from "./SetupsPage";
import PlansPage from "./PlansPage";
import OnboardingPage from "./OnboardingPage";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "onboarding", label: "Onboarding", icon: ClipboardList },
  { id: "setups", label: "Setups", icon: Building2 },
  { id: "plans", label: "Plans", icon: CircleDollarSign }
];

export default function SuperAdminApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(getSuperAdminToken()));
  const [tab, setTab] = useState("overview");
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
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Logo height={24} />
            <span className="hidden rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted sm:inline">
              Product Owner
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-text">{session.admin?.name || session.name}</p>
              <p className="text-[11px] text-muted">Super Admin</p>
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
                className={`relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "border-brand text-text" : "border-transparent text-muted hover:text-text"
                }`}
              >
                <Icon size={15} className={active ? "text-brand" : ""} />
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
        {tab === "overview" && (
          <OverviewPage summary={overview.summary || {}} tenants={overview.tenants || []} loading={dataLoading} onReload={load} />
        )}
        {tab === "onboarding" && (
          <OnboardingPage plans={plans} tenants={overview.tenants || []} onReload={load} />
        )}
        {tab === "setups" && (
          <SetupsPage plans={plans} tenants={overview.tenants || []} summary={overview.summary || {}} loading={dataLoading} onReload={load} />
        )}
        {tab === "plans" && <PlansPage plans={plans} loading={dataLoading} onReload={load} />}
      </main>
    </div>
  );
}
