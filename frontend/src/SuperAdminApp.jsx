import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users
} from "lucide-react";
import { getSuperAdminToken, setSuperAdminToken, superApi } from "./lib/api";

function SuperAdminLogin({ onAuthenticated }) {
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

  return <main className="login-screen super-login"><section className="login-card"><div className="login-brand"><span>RN</span><div><strong>Ringnex</strong><small>Product Owner Portal</small></div></div><div className="login-copy"><span className="overline">SUPER ADMIN</span><h1>Manage every setup</h1><p>Create tenants, control plans, extension ranges, limits and workspace status.</p></div><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{error && <div className="form-error">{error}</div>}<button className="primary-action" disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <ShieldCheck size={17} />}{busy ? "Signing in…" : "Super Admin Sign in"}</button></form></section><aside className="login-visual"><Building2 size={70} /><h2>One platform.<br />Many isolated workspaces.</h2><p>Product-level control without exposing one client's data to another.</p></aside></main>;
}

const initialTenant = {
  name: "",
  workspace: "",
  ownerName: "",
  ownerEmail: "",
  ownerPassword: "",
  planId: "",
  pricePerUser: "45",
  maxUsers: "10",
  outboundMinutes: "10000",
  inboundMinutes: "10000",
  unlimitedUsers: false,
  unlimitedOutbound: false,
  unlimitedInbound: false,
  extensionStart: "1001",
  timezone: "UTC",
  country: "",
  didsText: ""
};

function SetupForm({ plans, onCreated }) {
  const [form, setForm] = useState(initialTenant);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === form.planId), [plans, form.planId]);

  const choosePlan = (planId) => {
    const plan = plans.find((item) => item.id === planId);
    setForm((current) => ({
      ...current,
      planId,
      pricePerUser: plan ? String(plan.price_per_user ?? 0) : current.pricePerUser,
      maxUsers: plan?.max_users == null ? "" : String(plan.max_users),
      outboundMinutes: plan?.outbound_minutes == null ? "" : String(plan.outbound_minutes),
      inboundMinutes: plan?.inbound_minutes == null ? "" : String(plan.inbound_minutes),
      unlimitedUsers: plan ? plan.max_users == null : current.unlimitedUsers,
      unlimitedOutbound: plan ? plan.outbound_minutes == null : current.unlimitedOutbound,
      unlimitedInbound: plan ? plan.inbound_minutes == null : current.unlimitedInbound
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await superApi("/super-admin/tenants", {
        method: "POST",
        body: {
          ...form,
          dids: form.didsText.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)
        }
      });
      setForm(initialTenant);
      onCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="console-card saas-form-card"><div className="card-title"><div><h2>Create Setup</h2><p>Provision a tenant, its owner account, plan limits and extension range.</p></div><Plus /></div>{error && <div className="alert error">{error}</div>}<form className="admin-form saas-setup-form" onSubmit={submit}><label>Company name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Workspace code<input value={form.workspace} onChange={(e) => setForm({ ...form, workspace: e.target.value.toLowerCase() })} placeholder="abc-towing" required /></label><label>Owner name<input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required /></label><label>Owner email<input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} required /></label><label>Initial owner password<input type="password" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} minLength={12} required /></label><label>Pricing plan<select value={form.planId} onChange={(e) => choosePlan(e.target.value)}><option value="">Custom</option>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><label>Price per user / month<input type="number" min="0" step="0.01" value={form.pricePerUser} onChange={(e) => setForm({ ...form, pricePerUser: e.target.value })} /></label><label>Extension start<input type="number" min="100" value={form.extensionStart} onChange={(e) => setForm({ ...form, extensionStart: e.target.value })} required /></label><label>Max users<input type="number" min="0" disabled={form.unlimitedUsers} value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} /></label><label className="inline-check"><input type="checkbox" checked={form.unlimitedUsers} onChange={(e) => setForm({ ...form, unlimitedUsers: e.target.checked })} /> Unlimited users</label><label>Outbound minutes<input type="number" min="0" disabled={form.unlimitedOutbound} value={form.outboundMinutes} onChange={(e) => setForm({ ...form, outboundMinutes: e.target.value })} /></label><label className="inline-check"><input type="checkbox" checked={form.unlimitedOutbound} onChange={(e) => setForm({ ...form, unlimitedOutbound: e.target.checked })} /> Unlimited outbound</label><label>Inbound minutes<input type="number" min="0" disabled={form.unlimitedInbound} value={form.inboundMinutes} onChange={(e) => setForm({ ...form, inboundMinutes: e.target.value })} /></label><label className="inline-check"><input type="checkbox" checked={form.unlimitedInbound} onChange={(e) => setForm({ ...form, unlimitedInbound: e.target.checked })} /> Unlimited inbound</label><label>Timezone<input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></label><label>Country<input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label><label className="full-span">DIDs (comma or new line separated)<textarea rows="3" value={form.didsText} onChange={(e) => setForm({ ...form, didsText: e.target.value })} placeholder="17722304756\n17733622102" /></label>{selectedPlan && <div className="plan-hint full-span"><CheckCircle2 size={16} /> Plan values are copied into this tenant and can be overridden without changing the original pricing card.</div>}<button className="primary-action full-span" disabled={busy}>{busy ? "Creating setup…" : "Create Setup"}</button></form></section>;
}

function Plans({ plans, reload }) {
  const [form, setForm] = useState({ name: "", code: "", pricePerUser: "45", maxUsers: "10", outboundMinutes: "10000", inboundMinutes: "10000", unlimitedUsers: false, unlimitedOutbound: false, unlimitedInbound: false });
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setError("");
    try {
      await superApi("/super-admin/plans", { method: "POST", body: form });
      setForm({ name: "", code: "", pricePerUser: "45", maxUsers: "10", outboundMinutes: "10000", inboundMinutes: "10000", unlimitedUsers: false, unlimitedOutbound: false, unlimitedInbound: false });
      reload();
    } catch (e) { setError(e.message); }
  };
  return <section className="console-card table-card"><div className="card-title"><div><h2>Pricing Cards</h2><p>Reusable SaaS plans; tenant-level overrides remain independent.</p></div><CircleDollarSign /></div>{error && <div className="alert error">{error}</div>}<form className="plan-inline-form" onSubmit={submit}><input placeholder="Plan name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><input placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /><input type="number" min="0" step="0.01" placeholder="$ / user" value={form.pricePerUser} onChange={(e) => setForm({ ...form, pricePerUser: e.target.value })} /><button className="secondary-action">Add plan</button></form><div className="data-table-wrap"><table><thead><tr><th>Plan</th><th>$/user</th><th>Users</th><th>Outbound</th><th>Inbound</th><th>Status</th></tr></thead><tbody>{plans.map((plan) => <tr key={plan.id}><td><strong>{plan.name}</strong><small className="cell-subtitle">{plan.code}</small></td><td>${Number(plan.price_per_user || 0).toFixed(2)}</td><td>{plan.max_users ?? "Unlimited"}</td><td>{plan.outbound_minutes ?? "Unlimited"}</td><td>{plan.inbound_minutes ?? "Unlimited"}</td><td><span className={`status-tag ${plan.active ? "active" : "neutral"}`}>{plan.active ? "Active" : "Inactive"}</span></td></tr>)}</tbody></table></div></section>;
}

export default function SuperAdminApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(getSuperAdminToken()));
  const [overview, setOverview] = useState({ summary: {}, tenants: [] });
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const [overviewPayload, plansPayload] = await Promise.all([
        superApi("/super-admin/overview"),
        superApi("/super-admin/plans")
      ]);
      setOverview(overviewPayload);
      setPlans(plansPayload.plans || []);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => {
    if (!getSuperAdminToken()) { setLoading(false); return; }
    superApi("/super-admin/auth/session").then(setSession).then(load).catch(() => setSuperAdminToken("")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (session) load(); }, [session]);

  const setTenantStatus = async (tenant, status) => {
    await superApi(`/super-admin/tenants/${tenant.id}`, { method: "PATCH", body: { status } });
    load();
  };

  if (loading) return <div className="splash"><RefreshCw className="spin" /><span>Loading Product Owner portal…</span></div>;
  if (!session) return <SuperAdminLogin onAuthenticated={setSession} />;

  const summary = overview.summary || {};
  return <div className="super-admin-shell"><header className="super-admin-header"><div className="console-brand"><span>RN</span><div><strong>Ringnex SaaS</strong><small>Product Owner</small></div></div><div className="header-actions"><div className="user-menu"><div><strong>{session.admin?.name || session.name}</strong><small>SUPER ADMIN</small></div></div><button className="logout-button" onClick={() => { setSuperAdminToken(""); setSession(null); }}><LogOut size={18} /></button></div></header><main className="super-admin-main"><div className="page-heading"><div><span className="overline">GLOBAL OPERATIONS</span><h1>All client setups</h1><p>Create, price, activate and inspect every isolated Ringnex workspace.</p></div><button className="secondary-action" onClick={load}><RefreshCw size={16} />Refresh</button></div>{error && <div className="alert error">{error}</div>}<div className="kpi-grid"><article className="kpi-card blue"><span className="kpi-icon"><Building2 size={19} /></span><div><small>Setups</small><strong>{summary.totalTenants || 0}</strong><p>{summary.activeTenants || 0} active</p></div></article><article className="kpi-card green"><span className="kpi-icon"><Users size={19} /></span><div><small>Users</small><strong>{summary.totalUsers || 0}</strong><p>{summary.activeUsers || 0} active</p></div></article><article className="kpi-card purple"><span className="kpi-icon"><CircleDollarSign size={19} /></span><div><small>Carrier cost</small><strong>${Number(summary.carrierCost || 0).toFixed(2)}</strong><p>Current month</p></div></article></div><div className="super-admin-grid"><SetupForm plans={plans} onCreated={load} /><section className="console-card table-card"><div className="card-title"><div><h2>Client Setups</h2><p>{overview.tenants?.length || 0} workspaces</p></div></div><div className="data-table-wrap"><table><thead><tr><th>Company</th><th>Workspace</th><th>Users</th><th>Plan</th><th>Extension start</th><th>Status</th><th /></tr></thead><tbody>{(overview.tenants || []).map((tenant) => <tr key={tenant.id}><td><strong>{tenant.name}</strong></td><td>{tenant.workspace}</td><td>{tenant.active_users || tenant.users || 0}/{tenant.max_users ?? "∞"}</td><td>{tenant.plan_name || "Custom"}</td><td>{tenant.extension_start}</td><td><span className={`status-tag ${tenant.status === "ACTIVE" ? "active" : "neutral"}`}>{tenant.status}</span></td><td><select value={tenant.status} onChange={(e) => setTenantStatus(tenant, e.target.value)}><option value="TRIAL">TRIAL</option><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option><option value="SUSPENDED">SUSPENDED</option><option value="CANCELLED">CANCELLED</option></select></td></tr>)}</tbody></table></div></section></div><Plans plans={plans} reload={load} /></main></div>;
}



