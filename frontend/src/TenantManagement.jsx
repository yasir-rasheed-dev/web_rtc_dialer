import { useEffect, useMemo, useState } from "react";
import { ContactRound, CreditCard, Phone, Plus, RefreshCw, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import { api } from "./lib/api";

function groupPermissions(permissions) {
  return permissions.reduce((groups, item) => {
    groups[item.category] ||= [];
    groups[item.category].push(item);
    return groups;
  }, {});
}

export function UsersAdmin({ permissions = [] }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [dids, setDids] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingOwner, setEditingOwner] = useState(false);
  const [editingHasSip, setEditingHasSip] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canManage = permissions.includes("MANAGE_AGENTS");
  const empty = { name: "", email: "", password: "", roleId: "", callerIdNumber: "", generateSipAccount: true };
  const [form, setForm] = useState(empty);

  const assignableRoles = useMemo(
    () => roles.filter((role) => role.active && role.name !== "Tenant Owner"),
    [roles]
  );

  const load = async () => {
    setError("");
    try {
      const requests = [api("/users")];
      if (canManage) {
        requests.push(api("/roles"));
        requests.push(api("/dids").catch(() => ({ dids: [] })));
      }
      const [userPayload, rolePayload = { roles: [] }, didPayload = { dids: [] }] = await Promise.all(requests);
      setUsers(userPayload.users || []);
      setRoles(rolePayload.roles || []);
      setDids(didPayload.dids || []);
      if (canManage) {
        const allowedRoles = (rolePayload.roles || []).filter((role) => role.active && role.name !== "Tenant Owner");
        setForm((current) => ({
          ...current,
          roleId: current.roleId || allowedRoles.find((role) => role.name === "Agent")?.id || allowedRoles[0]?.id || ""
        }));
      }
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { load(); }, [canManage]);

  const resetForm = () => {
    setEditingUserId(null);
    setEditingOwner(false);
    setEditingHasSip(false);
    setForm(empty);
  };

  const edit = (user) => {
    if (!canManage) return;
    const owner = user.roleName === "Tenant Owner";
    setEditingUserId(user.id);
    setEditingOwner(owner);
    setEditingHasSip(Boolean(user.sipUsername));
    setForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      roleId: owner ? "" : user.roleId || "",
      callerIdNumber: owner ? "" : user.callerIdNumber || "",
      generateSipAccount: Boolean(user.sipUsername)
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canManage) return;
    setError(""); setNotice("");
    try {
      if (editingUserId) {
        const body = editingOwner
          ? { name: form.name, ...(form.password ? { password: form.password } : {}) }
          : {
              name: form.name,
              roleId: form.roleId,
              callerIdNumber: form.callerIdNumber,
              ...(form.password ? { password: form.password } : {})
            };
        await api(`/users/${editingUserId}`, { method: "PATCH", body });
        setNotice(editingOwner ? "Tenant Owner profile updated." : "User updated successfully.");
      } else {
        await api("/users", { method: "POST", body: form });
        setNotice("User created. SIP/extension allocation follows the selected provisioning option.");
      }
      resetForm();
      await load();
    } catch (e) { setError(e.message); }
  };

  const toggleActive = async (user) => {
    if (!canManage || user.roleName === "Tenant Owner") return;
    setError("");
    try {
      await api(`/users/${user.id}`, { method: "PATCH", body: { active: !user.active } });
      await load();
    } catch (e) { setError(e.message); }
  };

  const availableDids = dids.filter((did) => !did.assigned_user_id || did.assigned_user_id === editingUserId);
  const billableSeats = users.filter((user) => user.roleName !== "Tenant Owner" && user.active).length;

  return <div className="page-stack">
    <div className="page-heading"><div><span className="overline">TENANT ACCESS & PROVISIONING</span><h1>Users & Agents</h1><p>Tenant Owner is a management account and is excluded from SIP provisioning and billable seat limits.</p></div><button className="secondary-action" onClick={load}><RefreshCw size={16} />Refresh</button></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert">{notice}</div>}
    <div className={canManage ? "admin-grid" : "page-stack"}>
      {canManage && <section className="console-card"><div className="card-title"><div><h2>{editingUserId ? (editingOwner ? "Edit Tenant Owner" : "Edit user") : "New user"}</h2><p>{editingOwner ? "Management profile only — no SIP, DID or seat settings." : "Team membership is managed separately from Team Management."}</p></div><Users /></div><form className="admin-form" onSubmit={submit}>
        <label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Email<input type="email" value={form.email} disabled={Boolean(editingUserId)} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>{editingUserId ? "New password (optional)" : "App password"}<input type="password" minLength={editingUserId ? undefined : 12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editingUserId} /></label>
        {!editingOwner && <><label>Role<select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} required><option value="">Select role</option>{assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label>Assigned DID<select value={form.callerIdNumber} disabled={!editingUserId ? !form.generateSipAccount : !editingHasSip} onChange={(e) => setForm({ ...form, callerIdNumber: e.target.value })}><option value="">No DID</option>{availableDids.map((did) => <option key={did.id} value={did.number}>{did.number}{did.assigned_user_name ? ` — ${did.assigned_user_name}` : ""}</option>)}</select></label>{!editingUserId && <label className="sip-generate-option"><input type="checkbox" checked={form.generateSipAccount} onChange={(e) => setForm({ ...form, generateSipAccount: e.target.checked, callerIdNumber: e.target.checked ? form.callerIdNumber : "" })} /> Provision SIP account + next extension automatically</label>}</>}
        {editingOwner && <div className="owner-account-note full-span"><ShieldCheck size={17} /><span>Tenant Owner stays outside telephony and does not consume a paid user seat.</span></div>}
        <button className="primary-action">{editingUserId ? "Save user" : "Create user"}</button>{editingUserId && <button type="button" className="secondary-action" onClick={resetForm}>Cancel</button>}
      </form></section>}
      <section className="console-card table-card"><div className="card-title"><div><h2>Workspace Users</h2><p>{canManage ? `${users.length} accounts · ${billableSeats} active billable seats · Tenant Owner excluded` : `${users.length} visible users`}</p></div></div><div className="data-table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>DID</th><th>SIP / Ext</th><th>Teams</th><th>Status</th>{canManage && <th />}</tr></thead><tbody>{users.map((user) => {
        const owner = user.roleName === "Tenant Owner";
        const teams = Array.isArray(user.teamNames) ? user.teamNames : [];
        return <tr key={user.id}><td><strong>{user.name}</strong><small className="cell-subtitle">{user.email}</small></td><td>{user.roleName}{owner && <small className="cell-subtitle">Management account</small>}</td><td>{owner ? "—" : user.callerIdNumber || "—"}</td><td>{owner ? <span className="management-badge">No SIP seat</span> : <>{user.sipUsername || "—"}<small className="cell-subtitle">{user.extension ? `Ext ${user.extension}` : ""}</small></>}</td><td>{owner ? "—" : teams.length ? teams.join(", ") : "Unassigned"}</td><td><span className={`status-tag ${user.active ? "active" : "neutral"}`}>{user.active ? "Active" : "Disabled"}</span></td>{canManage && <td><div className="inline-actions"><button onClick={() => edit(user)}>Edit</button>{!owner && <button onClick={() => toggleActive(user)}>{user.active ? "Disable" : "Enable"}</button>}</div></td>}</tr>;
      })}</tbody></table></div></section>
    </div>
  </div>;
}

export function RolesAdmin() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    permissions: []
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const grouped = useMemo(
    () => groupPermissions(permissions),
    [permissions]
  );

  const resetForm = () => {
    setEditingRoleId(null);
    setForm({
      name: "",
      description: "",
      permissions: []
    });
  };

  const load = async () => {
    setError("");

    try {
      const [rolePayload, permissionPayload] = await Promise.all([
        api("/roles"),
        api("/permissions")
      ]);

      setRoles(rolePayload.roles || []);
      setPermissions(permissionPayload.permissions || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const togglePermission = (key) => {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter((item) => item !== key)
        : [...current.permissions, key]
    }));
  };

  const editRole = (role) => {
    if (role.is_system) return;

    setEditingRoleId(role.id);
    setForm({
      name: role.name || "",
      description: role.description || "",
      permissions: Array.isArray(role.permissions)
        ? [...role.permissions]
        : []
    });

    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      if (editingRoleId) {
        await api(`/roles/${editingRoleId}`, {
          method: "PATCH",
          body: form
        });

        setNotice("Role updated successfully.");
      } else {
        await api("/roles", {
          method: "POST",
          body: form
        });

        setNotice("Role created successfully.");
      }

      resetForm();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteRole = async (role) => {
    if (role.is_system) return;

    try {
      setError("");
      setNotice("");

      await api(`/roles/${role.id}`, {
        method: "DELETE"
      });

      if (editingRoleId === role.id) {
        resetForm();
      }

      setNotice("Role deleted successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <span className="overline">ROLE-BASED ACCESS CONTROL</span>
          <h1>Roles & Privileges</h1>
          <p>
            Create tenant-specific roles and assign exactly what each user can see or do.
          </p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert">{notice}</div>}

      <div className="roles-layout">
        <section className="console-card">
          <div className="card-title">
            <div>
              <h2>{editingRoleId ? "Edit Role" : "Add New Role"}</h2>
              <p>
                Permissions are enforced by UI, backend APIs and telephony security.
              </p>
            </div>
            <ShieldCheck />
          </div>

          <form onSubmit={submit} className="role-form">
            <label>
              Role Name
              <input
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                required
              />
            </label>

            <label>
              Description
              <textarea
                rows="3"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>

            <div className="permission-groups">
              {Object.entries(grouped).map(([category, items]) => (
                <fieldset key={category}>
                  <legend>{category}</legend>

                  <div className="permission-grid">
                    {items.map((permission) => (
                      <label
                        className="permission-option"
                        key={permission.key}
                      >
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(permission.key)}
                          onChange={() =>
                            togglePermission(permission.key)
                          }
                        />
                        <span>{permission.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            <button className="primary-action">
              <Plus size={16} />
              {editingRoleId ? "Update Role" : "Create Role"}
            </button>

            {editingRoleId && (
              <button
                type="button"
                className="secondary-action"
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </form>
        </section>

        <section className="console-card table-card">
          <div className="card-title">
            <div>
              <h2>Current Roles</h2>
              <p>
                System roles are protected; custom roles can be edited or removed.
              </p>
            </div>
            <UserCog />
          </div>

          <div className="role-list">
            {roles.map((role) => (
              <article key={role.id} className="role-card">
                <div>
                  <strong>{role.name}</strong>
                  <small>{role.description || "No description"}</small>
                </div>

                <div className="role-meta">
                  <span>{role.permissions?.length || 0} privileges</span>

                  {role.is_system ? (
                    <span className="status-tag active">System</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => editRole(role)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="icon-action danger"
                        title="Delete role"
                        onClick={() => deleteRole(role)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
export function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({ firstName: "", lastName: "", company: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const load = () => api("/contacts").then((payload) => setContacts(payload.contacts || [])).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  return <div className="page-stack"><div className="page-heading"><div><span className="overline">TENANT CONTACTS</span><h1>Contacts</h1><p>This address book belongs only to the current workspace.</p></div></div>{error && <div className="alert error">{error}</div>}<div className="admin-grid"><section className="console-card"><div className="card-title"><div><h2>New contact</h2></div><ContactRound /></div><form className="admin-form" onSubmit={async (event) => { event.preventDefault(); try { await api("/contacts", { method: "POST", body: form }); setForm({ firstName: "", lastName: "", company: "", phone: "", email: "" }); load(); } catch (e) { setError(e.message); } }}><label>First name<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label><label>Last name<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label><label>Company<input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label><label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><button className="primary-action">Add contact</button></form></section><section className="console-card table-card"><div className="card-title"><div><h2>Workspace Contacts</h2><p>{contacts.length} contacts</p></div></div><div className="data-table-wrap"><table><thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Email</th></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id}><td><strong>{contact.first_name} {contact.last_name}</strong></td><td>{contact.company || "—"}</td><td>{contact.phone || "—"}</td><td>{contact.email || "—"}</td></tr>)}</tbody></table></div></section></div></div>;
}

export function DidsPage() {
  const [dids, setDids] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api("/dids").then((payload) => setDids(payload.dids || [])).catch((e) => setError(e.message)); }, []);
  return <div className="page-stack"><div className="page-heading"><div><span className="overline">PHONE NUMBER INVENTORY</span><h1>DIDs</h1><p>Only numbers assigned to this workspace by the Product Owner are visible here.</p></div></div>{error && <div className="alert error">{error}</div>}<section className="console-card table-card"><div className="card-title"><div><h2>Assigned Numbers</h2><p>{dids.length} numbers</p></div><Phone /></div><div className="data-table-wrap"><table><thead><tr><th>Number</th><th>Label</th><th>Assigned user</th><th>Status</th></tr></thead><tbody>{dids.map((did) => <tr key={did.id}><td><strong>{did.number}</strong></td><td>{did.label || "—"}</td><td>{did.assigned_user_name || "Available"}</td><td><span className={`status-tag ${did.status === "ASSIGNED" ? "active" : "neutral"}`}>{did.status}</span></td></tr>)}</tbody></table></div></section></div>;
}

export function UsagePage() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/usage").then(setPayload).catch((e) => setError(e.message)); }, []);
  const usage = payload?.usage || {};
  const limits = payload?.limits || {};
  return <div className="page-stack"><div className="page-heading"><div><span className="overline">SUBSCRIPTION USAGE</span><h1>Usage & Billing</h1><p>Tenant-local minutes, seats and carrier reconciliation.</p></div></div>{error && <div className="alert error">{error}</div>}<div className="kpi-grid"><article className="kpi-card blue"><span className="kpi-icon"><Users size={19} /></span><div><small>Active seats</small><strong>{payload?.activeUsers || 0}</strong><p>Limit {limits.maxUsers ?? "Unlimited"} · Owner excluded</p></div></article><article className="kpi-card green"><span className="kpi-icon"><Phone size={19} /></span><div><small>Outbound minutes</small><strong>{usage.outboundMinutes || 0}</strong><p>Limit {limits.outboundMinutes ?? "Unlimited"}</p></div></article><article className="kpi-card purple"><span className="kpi-icon"><Phone size={19} /></span><div><small>Inbound minutes</small><strong>{usage.inboundMinutes || 0}</strong><p>Limit {limits.inboundMinutes ?? "Unlimited"}</p></div></article><article className="kpi-card orange"><span className="kpi-icon"><CreditCard size={19} /></span><div><small>Seat estimate</small><strong>${Number(payload?.estimatedSeatRevenue || 0).toFixed(2)}</strong><p>${Number(payload?.pricePerUser || 0).toFixed(2)} / user</p></div></article></div><section className="console-card"><div className="card-title"><div><h2>Carrier reconciliation</h2><p>Commio CDR cost rows will populate this view once the account-specific CDR adapter is configured.</p></div></div><div className="usage-summary"><div><span>Carrier billable minutes</span><strong>{usage.carrierBillableMinutes || 0}</strong></div><div><span>Carrier cost</span><strong>${Number(usage.carrierCost || 0).toFixed(2)}</strong></div><div><span>Calls</span><strong>{usage.calls || 0}</strong></div></div></section></div>;
}
