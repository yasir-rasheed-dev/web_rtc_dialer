import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, ShieldCheck, UserCheck, Users, UserX } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Toggle from "../../components/ui/Toggle";
import { api } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/toast";

function fieldLabel() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

const EMPTY_USER_FORM = {
  name: "",
  email: "",
  password: "",
  roleId: "",
  callerIdNumber: "",
  generateSipAccount: true,
  totpRequired: false,
  restrictIp: ""
};

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
        generateSipAccount: Boolean(user.sipUsername),
        totpRequired: Boolean(user.totpRequired),
        restrictIp: user.restrictIp || ""
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
        const security = { totpRequired: form.totpRequired, restrictIp: form.restrictIp };
        const body = owner
          ? { name: form.name, ...security, ...(form.password ? { password: form.password } : {}) }
          : {
              name: form.name,
              roleId: form.roleId,
              callerIdNumber: form.callerIdNumber,
              ...security,
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

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Login security</p>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text">Require 2FA (Google Authenticator)</p>
              <p className="text-xs text-muted">
                {user?.totpRequired && !user?.totpConfirmed
                  ? "Enabled — will scan a QR code on next sign-in."
                  : user?.totpRequired
                  ? "Enabled and enrolled."
                  : "Off — password only."}
              </p>
            </div>
            <Toggle checked={form.totpRequired} onChange={(value) => setForm({ ...form, totpRequired: value })} label="Require 2FA" />
          </div>
          <label className={fieldLabel()}>
            Restrict login to IP address
            <Input
              value={form.restrictIp}
              onChange={(e) => setForm({ ...form, restrictIp: e.target.value.trim() })}
              placeholder="Leave blank for no restriction"
            />
          </label>
        </div>

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

export default function UsersAdmin({ permissions = [] }) {
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
