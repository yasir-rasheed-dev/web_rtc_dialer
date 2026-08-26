import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ContactRound,
  CreditCard,
  LayoutGrid,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Table2,
  Trash2,
  UserCog,
  Users
} from "lucide-react";

import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import Input from "./components/ui/Input";
import Modal from "./components/ui/Modal";
import PageHeader from "./components/ui/PageHeader";
import { Skeleton, SkeletonTable } from "./components/ui/Skeleton";
import { confirmModal } from "./lib/modal";
import { notifyError, notifySuccess } from "./lib/toast";
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
const CONTACTS_TABLE_PAGE_SIZE = 20;
const CONTACTS_GRID_BATCH = 24;
const EMPTY_CONTACT_FORM = { firstName: "", lastName: "", company: "", phone: "", email: "", notes: "" };

function contactInitials(first, last) {
  const value = `${(first || "").charAt(0)}${(last || "").charAt(0)}`.toUpperCase();
  return value || "?";
}

function ContactFormModal({ open, onClose, contact, onSaved }) {
  const [form, setForm] = useState(EMPTY_CONTACT_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      contact
        ? {
            firstName: contact.first_name || "",
            lastName: contact.last_name || "",
            company: contact.company || "",
            phone: contact.phone || "",
            email: contact.email || "",
            notes: contact.notes || ""
          }
        : EMPTY_CONTACT_FORM
    );
  }, [open, contact]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.firstName.trim()) {
      setError("First name is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (contact) {
        await api(`/contacts/${contact.id}`, { method: "PATCH", body: form });
        notifySuccess("Contact updated.");
      } else {
        await api("/contacts", { method: "POST", body: form });
        notifySuccess("Contact added.");
      }
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={contact ? "Edit contact" : "New contact"}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
          First name
          <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoFocus required />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
          Last name
          <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium text-muted">
          Company
          <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
          Phone
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
          Email
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium text-muted">
          Notes
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
        {error && <div className="col-span-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
        <div className="col-span-2 mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={busy}>
            {contact ? "Save changes" : "Add contact"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ContactCard({ contact, canEdit, canDelete, onEdit, onDelete, deleting }) {
  return (
    <Card animate={false} className="flex flex-col gap-3 !p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
            {contactInitials(contact.first_name, contact.last_name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {contact.first_name} {contact.last_name}
            </p>
            {contact.company && <p className="truncate text-xs text-muted">{contact.company}</p>}
          </div>
        </div>
        {(canEdit || canDelete) && (
          <div className="flex shrink-0 gap-1">
            {canEdit && (
              <button
                onClick={() => onEdit(contact)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                aria-label="Edit contact"
              >
                <Pencil size={14} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete(contact)}
                disabled={deleting}
                className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                aria-label="Delete contact"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 text-xs text-muted">
        {contact.phone && (
          <span className="flex items-center gap-1.5">
            <Phone size={12} />
            {contact.phone}
          </span>
        )}
        {contact.email && (
          <span className="flex items-center gap-1.5 truncate">
            <Mail size={12} />
            {contact.email}
          </span>
        )}
        {!contact.phone && !contact.email && <span className="italic text-muted/70">No contact details</span>}
      </div>
    </Card>
  );
}

export function ContactsPage({ permissions = [] }) {
  const canCreate = permissions.includes("CREATE_CONTACTS");
  const canEdit = permissions.includes("EDIT_CONTACTS");
  const canDelete = permissions.includes("DELETE_CONTACTS");

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState(() => localStorage.getItem("ringnex.contactsView") || "grid");
  const [tablePage, setTablePage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(CONTACTS_GRID_BATCH);
  const [modalContact, setModalContact] = useState(undefined); // undefined = closed, null = new, object = editing
  const [deletingId, setDeletingId] = useState(null);
  const sentinelRef = useRef(null);
  const isFirstRun = useRef(true);

  const load = useCallback(async (term) => {
    setLoading(true);
    setError("");
    try {
      const query = term ? `?search=${encodeURIComponent(term)}` : "";
      const payload = await api(`/contacts${query}`);
      setContacts(payload.contacts || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load immediately on mount; every subsequent change to `search` debounces
  // so we don't fire a request per keystroke.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      load(search);
      return undefined;
    }
    const handle = setTimeout(() => load(search), 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    setTablePage(1);
    setVisibleCount(CONTACTS_GRID_BATCH);
  }, [contacts]);

  useEffect(() => {
    localStorage.setItem("ringnex.contactsView", view);
  }, [view]);

  useEffect(() => {
    if (view !== "grid") return undefined;
    const el = sentinelRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((count) => Math.min(contacts.length, count + CONTACTS_GRID_BATCH));
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [view, contacts.length]);

  const deleteContact = async (contact) => {
    const name = `${contact.first_name} ${contact.last_name || ""}`.trim();
    const confirmed = await confirmModal({
      title: "Delete contact",
      message: `Delete "${name}"? This cannot be undone.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    setDeletingId(contact.id);
    try {
      await api(`/contacts/${contact.id}`, { method: "DELETE" });
      notifySuccess("Contact deleted.");
      setContacts((current) => current.filter((item) => item.id !== contact.id));
    } catch (requestError) {
      notifyError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(contacts.length / CONTACTS_TABLE_PAGE_SIZE));
  const pagedContacts = contacts.slice((tablePage - 1) * CONTACTS_TABLE_PAGE_SIZE, tablePage * CONTACTS_TABLE_PAGE_SIZE);
  const visibleContacts = contacts.slice(0, visibleCount);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="TENANT CONTACTS"
        title="Contacts"
        description="This address book belongs only to the current workspace."
        actions={
          canCreate && (
            <Button icon={Plus} onClick={() => setModalContact(null)}>
              New contact
            </Button>
          )
        }
      />

      <Card animate={false}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <Search size={15} className="shrink-0 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, company, phone or email…"
              className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
            <button
              onClick={() => setView("grid")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === "grid" ? "bg-brand text-white" : "text-muted hover:text-text"
              }`}
            >
              <LayoutGrid size={14} />
              Grid
            </button>
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === "table" ? "bg-brand text-white" : "text-muted hover:text-text"
              }`}
            >
              <Table2 size={14} />
              Table
            </button>
          </div>
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => load(search)}>
            Refresh
          </Button>
        </div>
      </Card>

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {loading ? (
        view === "grid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[124px]" />
            ))}
          </div>
        ) : (
          <Card animate={false}>
            <SkeletonTable rows={8} cols={5} />
          </Card>
        )
      ) : !contacts.length ? (
        <Card animate={false}>
          <EmptyState
            icon={ContactRound}
            title={search ? "No contacts match your search" : "No contacts yet"}
            description={!search && canCreate ? "Add your first contact to build this workspace's address book." : undefined}
            action={
              !search && canCreate ? (
                <Button size="sm" icon={Plus} onClick={() => setModalContact(null)}>
                  New contact
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : view === "grid" ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleContacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={setModalContact}
                onDelete={deleteContact}
                deleting={deletingId === contact.id}
              />
            ))}
          </div>
          {visibleCount < contacts.length && <div ref={sentinelRef} className="h-8" />}
          <p className="text-center text-xs text-muted">
            Showing {visibleContacts.length} of {contacts.length} contacts
          </p>
        </>
      ) : (
        <Card animate={false} title="Workspace contacts" description={`${contacts.length} contacts`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Company</th>
                  <th className="pb-2 pr-4">Phone</th>
                  <th className="pb-2 pr-4">Email</th>
                  {(canEdit || canDelete) && <th className="pb-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pagedContacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">
                          {contactInitials(contact.first_name, contact.last_name)}
                        </span>
                        <span className="font-medium text-text">
                          {contact.first_name} {contact.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-muted">{contact.company || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{contact.phone || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{contact.email || "—"}</td>
                    {(canEdit || canDelete) && (
                      <td className="py-3">
                        <div className="flex gap-1">
                          {canEdit && (
                            <button
                              onClick={() => setModalContact(contact)}
                              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                              aria-label="Edit contact"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => deleteContact(contact)}
                              disabled={deletingId === contact.id}
                              className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                              aria-label="Delete contact"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border px-1 pt-4 text-xs text-muted">
            <Button size="sm" variant="secondary" disabled={tablePage <= 1} onClick={() => setTablePage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              Page {tablePage} of {totalPages}
            </span>
            <Button size="sm" variant="secondary" disabled={tablePage >= totalPages} onClick={() => setTablePage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </Card>
      )}

      <ContactFormModal
        open={modalContact !== undefined}
        onClose={() => setModalContact(undefined)}
        contact={modalContact}
        onSaved={() => {
          setModalContact(undefined);
          load(search);
        }}
      />
    </div>
  );
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
