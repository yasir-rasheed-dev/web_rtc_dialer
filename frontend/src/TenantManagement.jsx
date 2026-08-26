import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  ContactRound,
  CreditCard,
  Globe,
  LayoutGrid,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Table2,
  Trash2,
  UserCheck,
  UserCog,
  Users,
  UserX,
  X
} from "lucide-react";

import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import DatePicker from "./components/ui/DatePicker";
import EmptyState from "./components/ui/EmptyState";
import Input from "./components/ui/Input";
import Modal from "./components/ui/Modal";
import Toggle from "./components/ui/Toggle";
import PageHeader from "./components/ui/PageHeader";
import Select from "./components/ui/Select";
import { Skeleton, SkeletonTable } from "./components/ui/Skeleton";
import StatusBadge from "./components/ui/StatusBadge";
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

const EMPTY_USER_FORM = { name: "", email: "", password: "", roleId: "", callerIdNumber: "", generateSipAccount: true };

function UserFormModal({ open, onClose, user, roles, dids, onSaved }) {
  const owner = user?.roleName === "Tenant Owner";
  const hasSip = Boolean(user?.sipUsername);
  const [form, setForm] = useState(EMPTY_USER_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const assignableRoles = useMemo(() => roles.filter((role) => role.active && role.name !== "Tenant Owner"), [roles]);
  const roleOptions = useMemo(() => assignableRoles.map((role) => ({ value: role.id, label: role.name })), [assignableRoles]);
  const availableDids = useMemo(
    () => dids.filter((did) => !did.assigned_user_id || did.assigned_user_id === user?.id),
    [dids, user?.id]
  );
  const didOptions = useMemo(
    () => [
      { value: "", label: "No DID" },
      ...availableDids.map((did) => ({
        value: did.number,
        label: did.assigned_user_name ? `${did.number} — ${did.assigned_user_name}` : did.number
      }))
    ],
    [availableDids]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    if (user) {
      setForm({
        name: user.name || "",
        email: user.email || "",
        password: "",
        roleId: owner ? "" : user.roleId || "",
        callerIdNumber: owner ? "" : user.callerIdNumber || "",
        generateSipAccount: Boolean(user.sipUsername)
      });
    } else {
      setForm({
        ...EMPTY_USER_FORM,
        roleId: assignableRoles.find((role) => role.name === "Agent")?.id || assignableRoles[0]?.id || ""
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (user) {
        const body = owner
          ? { name: form.name, ...(form.password ? { password: form.password } : {}) }
          : {
              name: form.name,
              roleId: form.roleId,
              callerIdNumber: form.callerIdNumber,
              ...(form.password ? { password: form.password } : {})
            };
        await api(`/users/${user.id}`, { method: "PATCH", body });
        notifySuccess(owner ? "Tenant Owner profile updated." : "User updated.");
      } else {
        await api("/users", { method: "POST", body: form });
        notifySuccess("User created. SIP/extension allocation follows the selected provisioning option.");
      }
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const didDisabled = user ? !hasSip : !form.generateSipAccount;

  return (
    <Modal open={open} onClose={onClose} title={user ? (owner ? "Edit Tenant Owner" : "Edit user") : "New user"} width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          {owner ? "Management profile only — no SIP, DID or seat settings." : "Team membership is managed separately from Team Management."}
        </p>

        <label className={fieldLabel()}>
          Full name<span className="text-danger">*</span>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
        </label>
        <label className={fieldLabel()}>
          Email<span className="text-danger">*</span>
          <Input
            type="email"
            value={form.email}
            disabled={Boolean(user)}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        <label className={fieldLabel()}>
          {user ? "New password (optional)" : "App password"}
          <Input
            type="password"
            minLength={user ? undefined : 12}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={!user}
          />
        </label>

        {!owner && (
          <>
            <label className={fieldLabel()}>
              Role<span className="text-danger">*</span>
              <Select
                options={roleOptions}
                value={roleOptions.find((option) => option.value === form.roleId) || null}
                onChange={(option) => setForm({ ...form, roleId: option?.value || "" })}
                placeholder="Select role"
              />
            </label>
            <label className={fieldLabel()}>
              Assigned DID
              <Select
                isDisabled={didDisabled}
                options={didOptions}
                value={didOptions.find((option) => option.value === form.callerIdNumber) || didOptions[0]}
                onChange={(option) => setForm({ ...form, callerIdNumber: option?.value || "" })}
              />
            </label>
            {!user && (
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={form.generateSipAccount}
                  onChange={(e) =>
                    setForm({ ...form, generateSipAccount: e.target.checked, callerIdNumber: e.target.checked ? form.callerIdNumber : "" })
                  }
                  className="h-4 w-4 shrink-0 rounded border-border-strong accent-[rgb(var(--rn-blue))]"
                />
                Provision SIP account + next extension automatically
              </label>
            )}
          </>
        )}

        {owner && (
          <div className="flex items-start gap-2 rounded-xl bg-brand/10 px-3.5 py-3 text-xs text-brand">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <span>Tenant Owner stays outside telephony and does not consume a paid user seat.</span>
          </div>
        )}

        {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
        <div className="mt-1 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={busy}>
            {user ? "Save user" : "Create user"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function UsersAdmin({ permissions = [] }) {
  const canManage = permissions.includes("MANAGE_AGENTS");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [dids, setDids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalUser, setModalUser] = useState(undefined); // undefined = closed, null = new, object = editing
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (user) => {
    setTogglingId(user.id);
    try {
      await api(`/users/${user.id}`, { method: "PATCH", body: { active: !user.active } });
      notifySuccess(user.active ? "User disabled." : "User enabled.");
      await load();
    } catch (requestError) {
      notifyError(requestError.message);
    } finally {
      setTogglingId(null);
    }
  };

  const billableSeats = users.filter((user) => user.roleName !== "Tenant Owner" && user.active).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="TENANT ACCESS & PROVISIONING"
        title="Users & Agents"
        description="Tenant Owner is a management account and is excluded from SIP provisioning and billable seat limits."
        actions={
          <>
            {canManage && (
              <Button icon={Plus} onClick={() => setModalUser(null)}>
                New user
              </Button>
            )}
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>
              Refresh
            </Button>
          </>
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card
        title="Workspace users"
        description={
          canManage
            ? `${users.length} accounts · ${billableSeats} active billable seats · Tenant Owner excluded`
            : `${users.length} visible users`
        }
        icon={Users}
      >
        {loading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : users.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">User</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">DID</th>
                  <th className="pb-2 pr-4">SIP / Ext</th>
                  <th className="pb-2 pr-4">Teams</th>
                  <th className="pb-2 pr-4">Status</th>
                  {canManage && <th className="pb-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const owner = user.roleName === "Tenant Owner";
                  const teams = Array.isArray(user.teamNames) ? user.teamNames : [];
                  return (
                    <tr key={user.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-text">{user.name}</p>
                        <p className="text-xs text-muted">{user.email}</p>
                      </td>
                      <td className="py-3 pr-4 text-muted">
                        {user.roleName}
                        {owner && <span className="block text-xs text-muted">Management account</span>}
                      </td>
                      <td className="py-3 pr-4 text-muted">{owner ? "—" : user.callerIdNumber || "—"}</td>
                      <td className="py-3 pr-4 text-muted">
                        {owner ? (
                          <StatusBadge tone="neutral">No SIP seat</StatusBadge>
                        ) : (
                          <>
                            {user.sipUsername || "—"}
                            {user.extension && <span className="block text-xs text-muted">Ext {user.extension}</span>}
                          </>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted">{owner ? "—" : teams.length ? teams.join(", ") : "Unassigned"}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge tone={user.active ? "success" : "neutral"}>{user.active ? "Active" : "Disabled"}</StatusBadge>
                      </td>
                      {canManage && (
                        <td className="py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => setModalUser(user)}
                              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                              aria-label={`Edit ${user.name}`}
                            >
                              <Pencil size={14} />
                            </button>
                            {!owner && (
                              <button
                                onClick={() => toggleActive(user)}
                                disabled={togglingId === user.id}
                                className={`rounded-lg p-1.5 disabled:opacity-40 ${
                                  user.active ? "text-muted hover:bg-danger-soft hover:text-danger" : "text-muted hover:bg-success-soft hover:text-success"
                                }`}
                                aria-label={user.active ? `Disable ${user.name}` : `Enable ${user.name}`}
                                title={user.active ? "Disable user" : "Enable user"}
                              >
                                {user.active ? <UserX size={14} /> : <UserCheck size={14} />}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No users yet" />
        )}
      </Card>

      {canManage && (
        <UserFormModal
          open={modalUser !== undefined}
          onClose={() => setModalUser(undefined)}
          user={modalUser}
          roles={roles}
          dids={dids}
          onSaved={() => {
            setModalUser(undefined);
            load();
          }}
        />
      )}
    </div>
  );
}

function RoleFormModal({ open, onClose, role, grouped, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({
      name: role?.name || "",
      description: role?.description || "",
      permissions: Array.isArray(role?.permissions) ? [...role.permissions] : []
    });
    setError("");
  }, [open, role]);

  if (!form) return <Modal open={false} />;

  const togglePermission = (key) =>
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter((item) => item !== key)
        : [...current.permissions, key]
    }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Role name is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (role) {
        await api(`/roles/${role.id}`, { method: "PATCH", body: form });
        notifySuccess("Role updated.");
      } else {
        await api("/roles", { method: "POST", body: form });
        notifySuccess("Role created.");
      }
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={role ? `Edit ${role.name}` : "New role"} width="max-w-2xl">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Role name<span className="text-danger">*</span>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Description
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
        </div>

        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-brand">{category}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((permission) => (
                  <div key={permission.key} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                    <span className="text-sm font-medium text-text">{permission.name}</span>
                    <Toggle
                      checked={form.permissions.includes(permission.key)}
                      onChange={() => togglePermission(permission.key)}
                      label={permission.name}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
        <div className="mt-1 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" icon={Plus} loading={busy}>
            {role ? "Save changes" : "Create role"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RolesAdmin({ permissions = [] }) {
  const canManage = permissions.includes("MANAGE_ROLES");
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalRole, setModalRole] = useState(undefined); // undefined = closed, null = new, object = editing
  const [deletingId, setDeletingId] = useState(null);

  const grouped = useMemo(() => groupPermissions(allPermissions), [allPermissions]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rolePayload, permissionPayload] = await Promise.all([api("/roles"), api("/permissions")]);
      setRoles(rolePayload.roles || []);
      setAllPermissions(permissionPayload.permissions || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deleteRole = async (role) => {
    const confirmed = await confirmModal({
      title: "Delete role",
      message: `Delete role "${role.name}"? Users assigned to it will need a new role. This cannot be undone.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    setDeletingId(role.id);
    try {
      await api(`/roles/${role.id}`, { method: "DELETE" });
      notifySuccess("Role deleted.");
      await load();
    } catch (requestError) {
      notifyError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="ROLE-BASED ACCESS CONTROL"
        title="Roles & Privileges"
        description="Create tenant-specific roles and assign exactly what each user can see or do."
        actions={
          canManage && (
            <Button icon={Plus} onClick={() => setModalRole(null)}>
              New role
            </Button>
          )
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card title="Current roles" description="System roles are protected; custom roles can be edited or removed." icon={UserCog}>
        {loading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : roles.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Privileges</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text">{role.name}</p>
                      {role.description && <p className="max-w-xs truncate text-xs text-muted">{role.description}</p>}
                    </td>
                    <td className="py-3 pr-4 text-muted">{role.permissions?.length || 0}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={role.is_system ? "neutral" : "brand"}>{role.is_system ? "System" : "Custom"}</StatusBadge>
                    </td>
                    <td className="py-3">
                      {role.is_system ? (
                        <span className="text-xs text-muted">Protected</span>
                      ) : (
                        canManage && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => setModalRole(role)}
                              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                              aria-label={`Edit ${role.name}`}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => deleteRole(role)}
                              disabled={deletingId === role.id}
                              className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                              aria-label={`Delete ${role.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={UserCog} title="No roles yet" />
        )}
      </Card>

      <RoleFormModal
        open={modalRole !== undefined}
        onClose={() => setModalRole(undefined)}
        role={modalRole}
        grouped={grouped}
        onSaved={() => {
          setModalRole(undefined);
          load();
        }}
      />
    </div>
  );
}
const CONTACTS_TABLE_PAGE_SIZE = 20;
const CONTACTS_GRID_BATCH = 24;

const EMPTY_PHONE = { number: "", label: "MOBILE" };
const EMPTY_ADDRESS = { label: "OTHER", line1: "", line2: "", city: "", state: "", postalCode: "", country: "" };
const EMPTY_CONTACT_FORM = {
  firstName: "",
  lastName: "",
  nickname: "",
  email: "",
  company: "",
  jobTitle: "",
  birthdate: "",
  website: "",
  source: "OTHER",
  phones: [{ ...EMPTY_PHONE }],
  addresses: [],
  notes: ""
};

const PHONE_LABEL_OPTIONS = [
  { value: "MOBILE", label: "Mobile" },
  { value: "HOME", label: "Home" },
  { value: "WORK", label: "Work" },
  { value: "OTHER", label: "Other" }
];
const ADDRESS_LABEL_OPTIONS = [
  { value: "HOME", label: "Home" },
  { value: "WORK", label: "Work" },
  { value: "OTHER", label: "Other" }
];
const SOURCE_OPTIONS = [
  { value: "OTHER", label: "Other" },
  { value: "REFERRAL", label: "Referral" },
  { value: "WEBSITE", label: "Website" },
  { value: "ADVERTISEMENT", label: "Advertisement" },
  { value: "SOCIAL_MEDIA", label: "Social media" },
  { value: "EVENT", label: "Event" },
  { value: "IMPORT", label: "Import" }
];

function contactInitials(first, last) {
  const value = `${(first || "").charAt(0)}${(last || "").charAt(0)}`.toUpperCase();
  return value || "?";
}

function fieldLabel() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

function sectionHeading(icon, text) {
  return (
    <div className="col-span-2 mt-1 flex items-center gap-2 border-b border-border pb-2 text-[11px] font-extrabold uppercase tracking-wide text-brand first:mt-0">
      {icon}
      {text}
    </div>
  );
}

function ContactFormModal({ open, onClose, contact, onSaved }) {
  const [form, setForm] = useState(EMPTY_CONTACT_FORM);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");

    if (!contact) {
      setForm(EMPTY_CONTACT_FORM);
      return;
    }

    setDetailLoading(true);
    api(`/contacts/${contact.id}`)
      .then((payload) => {
        const c = payload.contact;
        setForm({
          firstName: c.first_name || "",
          lastName: c.last_name || "",
          nickname: c.nickname || "",
          email: c.email || "",
          company: c.company || "",
          jobTitle: c.job_title || "",
          birthdate: c.birthdate ? String(c.birthdate).slice(0, 10) : "",
          website: c.website || "",
          source: c.source || "OTHER",
          phones: (payload.phones || []).length
            ? payload.phones.map((phone) => ({ number: phone.number, label: phone.label }))
            : [{ ...EMPTY_PHONE }],
          addresses: (payload.addresses || []).map((address) => ({
            label: address.label,
            line1: address.line1 || "",
            line2: address.line2 || "",
            city: address.city || "",
            state: address.state || "",
            postalCode: address.postal_code || "",
            country: address.country || ""
          })),
          notes: c.notes || ""
        });
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setDetailLoading(false));
  }, [open, contact]);

  const updatePhone = (index, patch) =>
    setForm((current) => ({ ...current, phones: current.phones.map((phone, i) => (i === index ? { ...phone, ...patch } : phone)) }));
  const addPhone = () => setForm((current) => ({ ...current, phones: [...current.phones, { ...EMPTY_PHONE }] }));
  const removePhone = (index) => setForm((current) => ({ ...current, phones: current.phones.filter((_, i) => i !== index) }));

  const updateAddress = (index, patch) =>
    setForm((current) => ({
      ...current,
      addresses: current.addresses.map((address, i) => (i === index ? { ...address, ...patch } : address))
    }));
  const addAddress = () => setForm((current) => ({ ...current, addresses: [...current.addresses, { ...EMPTY_ADDRESS }] }));
  const removeAddress = (index) =>
    setForm((current) => ({ ...current, addresses: current.addresses.filter((_, i) => i !== index) }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.firstName.trim()) {
      setError("First name is required");
      return;
    }
    const phones = form.phones.filter((phone) => phone.number.trim());
    if (!phones.length) {
      setError("At least one phone number is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = { ...form, phones };
      if (contact) {
        await api(`/contacts/${contact.id}`, { method: "PATCH", body });
        notifySuccess("Contact updated.");
      } else {
        await api("/contacts", { method: "POST", body });
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
    <Modal open={open} onClose={onClose} title={contact ? "Edit contact" : "New contact"} width="max-w-2xl">
      {detailLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-[52px]" />
          ))}
        </div>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          {sectionHeading(<ContactRound size={13} />, "Personal information")}

          <label className={fieldLabel()}>
            First name<span className="text-danger">*</span>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoFocus required />
          </label>
          <label className={fieldLabel()}>
            Last name
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </label>
          <label className={fieldLabel()}>
            Nickname
            <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
          </label>
          <label className={fieldLabel()}>
            Email
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className={`${fieldLabel()} col-span-2`}>
            Company
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </label>
          <label className={fieldLabel()}>
            <span className="flex items-center gap-1.5">
              <Briefcase size={12} />
              Job title
            </span>
            <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          </label>
          <label className={fieldLabel()}>
            Birthdate
            <DatePicker value={form.birthdate} onChange={(value) => setForm({ ...form, birthdate: value })} placeholder="Select date" />
          </label>
          <label className={`${fieldLabel()} col-span-2`}>
            <span className="flex items-center gap-1.5">
              <Globe size={12} />
              Website
            </span>
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" />
          </label>

          {sectionHeading(
            <Phone size={13} />,
            <>
              Phone numbers<span className="text-danger">*</span>
            </>
          )}
          <div className="col-span-2 flex flex-col gap-2">
            {form.phones.map((phone, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={phone.number}
                  onChange={(e) => updatePhone(index, { number: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="flex-1"
                />
                <Select
                  className="w-32 shrink-0"
                  isSearchable={false}
                  options={PHONE_LABEL_OPTIONS}
                  value={PHONE_LABEL_OPTIONS.find((option) => option.value === phone.label) || PHONE_LABEL_OPTIONS[0]}
                  onChange={(option) => updatePhone(index, { label: option.value })}
                />
                <button
                  type="button"
                  onClick={() => removePhone(index)}
                  disabled={form.phones.length <= 1}
                  className="shrink-0 rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                  aria-label="Remove phone number"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={addPhone} className="self-start">
              Add another number
            </Button>
          </div>

          {sectionHeading(<MapPin size={13} />, "Addresses")}
          <div className="col-span-2 flex flex-col gap-3">
            {form.addresses.map((address, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Select
                    className="w-32"
                    isSearchable={false}
                    options={ADDRESS_LABEL_OPTIONS}
                    value={ADDRESS_LABEL_OPTIONS.find((option) => option.value === address.label) || ADDRESS_LABEL_OPTIONS[0]}
                    onChange={(option) => updateAddress(index, { label: option.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeAddress(index)}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                    aria-label="Remove address"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <Input
                  value={address.line1}
                  onChange={(e) => updateAddress(index, { line1: e.target.value })}
                  placeholder="Address line 1"
                />
                <Input
                  value={address.line2}
                  onChange={(e) => updateAddress(index, { line2: e.target.value })}
                  placeholder="Address line 2 (optional)"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={address.city} onChange={(e) => updateAddress(index, { city: e.target.value })} placeholder="City" />
                  <Input value={address.state} onChange={(e) => updateAddress(index, { state: e.target.value })} placeholder="State" />
                  <Input
                    value={address.postalCode}
                    onChange={(e) => updateAddress(index, { postalCode: e.target.value })}
                    placeholder="Postal code"
                  />
                  <Input
                    value={address.country}
                    onChange={(e) => updateAddress(index, { country: e.target.value })}
                    placeholder="Country"
                  />
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={addAddress} className="self-start">
              Add address
            </Button>
          </div>

          {sectionHeading(null, "Source")}
          <label className="col-span-2">
            <Select
              isSearchable={false}
              options={SOURCE_OPTIONS}
              value={SOURCE_OPTIONS.find((option) => option.value === form.source) || SOURCE_OPTIONS[0]}
              onChange={(option) => setForm({ ...form, source: option.value })}
            />
          </label>

          {sectionHeading(null, "Notes")}
          <label className="col-span-2">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any additional notes…"
              className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          {error && <div className="col-span-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}

          <div className="col-span-2 mt-1 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" icon={Plus} loading={busy}>
              {contact ? "Save changes" : "Save contact"}
            </Button>
          </div>
        </form>
      )}
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
            {(contact.job_title || contact.company) && (
              <p className="truncate text-xs text-muted">
                {contact.job_title}
                {contact.job_title && contact.company ? " · " : ""}
                {contact.company}
              </p>
            )}
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
