import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, ShieldCheck, UserCheck, Users, UserX } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import StatusBadge from "../../components/ui/StatusBadge";
import Toggle from "../../components/ui/Toggle";
import { api } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/toast";

// Same flat-white field look as the Roles / Team modals.
const FIELD_INPUT =
  "h-10 w-full rounded-lg border border-border-strong bg-surface px-3.5 text-sm text-text placeholder:text-muted transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:opacity-60";

// Toll-free numbers can't ring one agent's SIP endpoint — they route to a
// toll-free campaign's queue instead — so they must never be offered as a
// user's outbound caller ID / assigned DID. number_type is authoritative
// for numbers bought after that column landed; the NANP prefix check
// covers older numbers that were backfilled as LOCAL.
function isTollFreeDid(did) {
  if (did?.number_type === "TOLLFREE") return true;
  const digits = String(did?.number || "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^8(00|22|33|44|55|66|77|88)/.test(local);
}

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
    () => dids.filter((did) => !isTollFreeDid(did) && (!did.assigned_user_id || did.assigned_user_id === user?.id)),
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
          <span>
            Full name <span className="text-danger">*</span>
          </span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
            required
            placeholder="Jane Cooper"
            className={FIELD_INPUT}
          />
        </label>
        <label className={fieldLabel()}>
          <span>
            Email <span className="text-danger">*</span>
          </span>
          <input
            type="email"
            value={form.email}
            disabled={Boolean(user)}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            placeholder="jane@company.com"
            className={FIELD_INPUT}
          />
        </label>
        <label className={fieldLabel()}>
          <span>{user ? "New password (optional)" : "App password"}</span>
          <input
            type="password"
            minLength={user ? undefined : 12}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={!user}
            placeholder={user ? "Leave blank to keep current" : "At least 12 characters"}
            className={FIELD_INPUT}
          />
        </label>

        {!owner && (
          <>
            <label className={fieldLabel()}>
              <span>
                Role <span className="text-danger">*</span>
              </span>
              <Select
                options={roleOptions}
                value={roleOptions.find((option) => option.value === form.roleId) || null}
                onChange={(option) => setForm({ ...form, roleId: option?.value || "" })}
                placeholder="Select role"
              />
            </label>
            <label className={fieldLabel()}>
              <span>Assigned DID</span>
              <Select
                isDisabled={didDisabled}
                options={didOptions}
                value={didOptions.find((option) => option.value === form.callerIdNumber) || didOptions[0]}
                onChange={(option) => setForm({ ...form, callerIdNumber: option?.value || "" })}
              />
              <span className="font-normal normal-case text-[11px] text-muted">
                Local numbers only — toll-free numbers route to their campaign queue.
              </span>
            </label>
            {!user && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5">
                <span className="text-sm font-medium text-text">Auto-provision SIP account + next extension</span>
                <Toggle
                  checked={form.generateSipAccount}
                  onChange={(value) =>
                    setForm({ ...form, generateSipAccount: value, callerIdNumber: value ? form.callerIdNumber : "" })
                  }
                  label="Provision SIP account automatically"
                />
              </div>
            )}
          </>
        )}

        {owner && (
          <div className="flex items-start gap-2 rounded-lg border border-brand/25 bg-brand/5 px-3.5 py-3 text-xs text-brand">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <span>Tenant Owner stays outside telephony and does not consume a paid user seat.</span>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-3">
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
            <span>Restrict login to IP address</span>
            <input
              value={form.restrictIp}
              onChange={(e) => setForm({ ...form, restrictIp: e.target.value.trim() })}
              placeholder="Leave blank for no restriction"
              className={FIELD_INPUT}
            />
          </label>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
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

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "User",
        sortable: true,
        cellClassName: "text-text",
        cell: (u) => (
          <div className="min-w-0">
            <p className="font-medium">{u.name}</p>
            <p className="truncate text-xs text-muted">{u.email}</p>
          </div>
        )
      },
      {
        key: "roleName",
        header: "Role",
        sortable: true,
        cell: (u) =>
          u.roleName === "Tenant Owner" ? (
            <span className="text-muted">
              {u.roleName}
              <span className="block text-[11px] text-muted/70">Management account</span>
            </span>
          ) : (
            u.roleName
          )
      },
      {
        key: "callerIdNumber",
        header: "DID",
        cell: (u) => (u.roleName === "Tenant Owner" ? "—" : u.callerIdNumber || <span className="text-muted/60">—</span>)
      },
      {
        key: "sip",
        header: "SIP / Ext",
        cell: (u) =>
          u.roleName === "Tenant Owner" ? (
            <StatusBadge tone="neutral">No SIP seat</StatusBadge>
          ) : (
            <span>
              {u.sipUsername || "—"}
              {u.extension && <span className="block text-[11px] text-muted">Ext {u.extension}</span>}
            </span>
          )
      },
      {
        key: "teams",
        header: "Teams",
        cell: (u) => {
          if (u.roleName === "Tenant Owner") return "—";
          const teams = Array.isArray(u.teamNames) ? u.teamNames : [];
          return teams.length ? teams.join(", ") : <span className="text-muted/60">Unassigned</span>;
        }
      },
      {
        key: "active",
        header: "Status",
        sortable: true,
        cell: (u) => <StatusBadge tone={u.active ? "success" : "neutral"}>{u.active ? "Active" : "Disabled"}</StatusBadge>
      },
      ...(canManage
        ? [
            {
              key: "actions",
              header: "",
              align: "right",
              cell: (u) => (
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => setModalUser(u)}
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                    aria-label={`Edit ${u.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  {u.roleName !== "Tenant Owner" && (
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={togglingId === u.id}
                      className={`rounded-lg p-1.5 disabled:opacity-40 ${
                        u.active
                          ? "text-muted hover:bg-danger-soft hover:text-danger"
                          : "text-muted hover:bg-success-soft hover:text-success"
                      }`}
                      aria-label={u.active ? `Disable ${u.name}` : `Enable ${u.name}`}
                      title={u.active ? "Disable user" : "Enable user"}
                    >
                      {u.active ? <UserX size={14} /> : <UserCheck size={14} />}
                    </button>
                  )}
                </div>
              )
            }
          ]
        : [])
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, togglingId]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="TENANT ACCESS & PROVISIONING"
        title="Users & Agents"
        description={
          canManage
            ? `${users.length} accounts · ${billableSeats} active billable seats · Tenant Owner excluded`
            : "Tenant Owner is a management account, excluded from SIP provisioning and billable seats."
        }
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

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {loading || users.length ? (
        <DataTable
          columns={columns}
          data={users}
          loading={loading}
          getRowKey={(u) => u.id}
          searchKeys={["name", "email"]}
          searchPlaceholder="Filter by name or email…"
          filters={[
            {
              key: "status",
              label: "All statuses",
              getValue: (u) => (u.active ? "Active" : "Disabled"),
              options: [
                { value: "Active", label: "Active" },
                { value: "Disabled", label: "Disabled" }
              ]
            }
          ]}
          initialSort={{ key: "name", dir: "asc" }}
          pageSize={15}
          emptyState={<EmptyState icon={Users} title="No users match" />}
        />
      ) : (
        <Card animate={false}>
          <EmptyState icon={Users} title="No users yet" />
        </Card>
      )}

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
