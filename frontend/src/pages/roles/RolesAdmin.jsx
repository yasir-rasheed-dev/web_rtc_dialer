import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, UserCog } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Toggle from "../../components/ui/Toggle";
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";
import { api } from "../../lib/api";

// Mirrors permissions.js's own key list per Super Admin-controlled
// tenant-wide feature (see backend/src/saas.js's requireTenantFeature) —
// when a tenant doesn't have one of these features at all, granting an
// agent the permission for it here wouldn't do anything (the backend
// blocks it regardless), so these are hidden from the role editor rather
// than shown as a toggle that can never actually take effect. Doesn't
// touch a role's already-saved permissions — only what's offered to
// grant/revoke here — so nothing is silently stripped if the tenant's
// flag is re-enabled later.
const FEATURE_PERMISSION_KEYS = {
  canPurchaseNumbers: ["PURCHASE_DIDS"],
  canUseAutoDialer: [
    "VIEW_CAMPAIGNS", "CREATE_CAMPAIGNS", "MANAGE_CAMPAIGNS", "UPLOAD_CONTACTS",
    "ASSIGN_CONTACTS", "USE_AUTO_DIALER", "SKIP_CONTACT", "VIEW_CAMPAIGN_REPORTS", "EXPORT_CAMPAIGN_REPORTS"
  ],
  canUseTollFree: ["VIEW_TOLL_FREE", "MANAGE_TOLL_FREE_CAMPAIGNS"],
  // MANAGE_DISPOSITIONS is deliberately NOT listed here — the disposition
  // picklist it manages is shared with the Auto Dialer (backend leaves
  // that route ungated by can_use_leads for exactly this reason), so
  // hiding it whenever Leads is off would break disposition management
  // for a tenant that only has Auto Dialer enabled.
  canUseLeads: ["VIEW_LEADS", "MANAGE_LEADS", "SHOW_END_CALL_POPUP"]
};

function groupPermissions(permissions, tenant = {}) {
  const hiddenKeys = new Set(
    Object.entries(FEATURE_PERMISSION_KEYS)
      .filter(([flag]) => tenant[flag] === false)
      .flatMap(([, keys]) => keys)
  );
  return permissions
    .filter((item) => !hiddenKeys.has(item.key))
    .reduce((groups, item) => {
      groups[item.category] ||= [];
      groups[item.category].push(item);
      return groups;
    }, {});
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

export default function RolesAdmin({ permissions = [], tenant = {} }) {
  const canManage = permissions.includes("MANAGE_ROLES");
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalRole, setModalRole] = useState(undefined); // undefined = closed, null = new, object = editing
  const [deletingId, setDeletingId] = useState(null);

  const grouped = useMemo(() => groupPermissions(allPermissions, tenant), [allPermissions, tenant]);

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
