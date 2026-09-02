import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, UserCog } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
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

function CategoryBlock({ category, items, selected, onToggle, onToggleAll }) {
  const on = items.filter((i) => selected.has(i.key)).length;
  const all = on === items.length && items.length > 0;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-text">{category}</span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-muted">
            {on}/{items.length}
          </span>
          <button
            type="button"
            onClick={() => onToggleAll(items, !all)}
            className="text-[11px] font-semibold text-brand hover:underline"
          >
            {all ? "Clear" : "Select all"}
          </button>
        </div>
      </div>
      <div className="divide-y divide-border">
        {items.map((p) => (
          <label key={p.key} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
            <span className="text-[13px] text-text">{p.name}</span>
            <Toggle checked={selected.has(p.key)} onChange={() => onToggle(p.key)} label={p.name} />
          </label>
        ))}
      </div>
    </div>
  );
}

function RoleFormModal({ open, onClose, role, grouped, onSaved }) {
  const [form, setForm] = useState(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({
      name: role?.name || "",
      description: role?.description || "",
      permissions: Array.isArray(role?.permissions) ? [...role.permissions] : []
    });
    setQuery("");
    setError("");
  }, [open, role]);

  const selected = useMemo(() => new Set(form?.permissions || []), [form]);
  const totalCount = useMemo(() => Object.values(grouped).reduce((n, arr) => n + arr.length, 0), [grouped]);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(grouped)
      .map(([cat, items]) => [cat, q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items])
      .filter(([, items]) => items.length);
  }, [grouped, query]);

  if (!form) return <Modal open={false} />;

  const togglePermission = (key) =>
    setForm((cur) => ({
      ...cur,
      permissions: cur.permissions.includes(key)
        ? cur.permissions.filter((k) => k !== key)
        : [...cur.permissions, key]
    }));

  const toggleAll = (items, value) =>
    setForm((cur) => {
      const keys = items.map((i) => i.key);
      const next = new Set(cur.permissions);
      keys.forEach((k) => (value ? next.add(k) : next.delete(k)));
      return { ...cur, permissions: [...next] };
    });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Role name is required.");
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Role name<span className="text-danger">*</span>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Description
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter privileges…"
              className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-text placeholder:text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-muted">
            {form.permissions.length} / {totalCount} selected
          </span>
        </div>

        <div className="flex max-h-[46vh] flex-col gap-3 overflow-y-auto pr-1">
          {filteredCategories.length ? (
            filteredCategories.map(([category, items]) => (
              <CategoryBlock
                key={category}
                category={category}
                items={items}
                selected={selected}
                onToggle={togglePermission}
                onToggleAll={toggleAll}
              />
            ))
          ) : (
            <p className="py-8 text-center text-xs text-muted">No privileges match “{query}”.</p>
          )}
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
      message: `Delete "${role.name}"? Users on this role keep their account but lose its privileges.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    setDeletingId(role.id);
    try {
      await api(`/roles/${role.id}`, { method: "DELETE" });
      setRoles((current) => current.filter((r) => r.id !== role.id));
      notifySuccess("Role deleted.");
    } catch (requestError) {
      notifyError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Role",
        sortable: true,
        cellClassName: "text-text",
        cell: (r) => (
          <div className="min-w-0">
            <p className="font-medium">{r.name}</p>
            {r.description && <p className="max-w-xs truncate text-xs text-muted">{r.description}</p>}
          </div>
        )
      },
      {
        key: "privileges",
        header: "Privileges",
        align: "right",
        sortable: true,
        sortValue: (r) => r.permissions?.length || 0,
        cell: (r) => <span className="tabular-nums">{r.permissions?.length || 0}</span>
      },
      {
        key: "is_system",
        header: "Type",
        sortable: true,
        cell: (r) => (
          <StatusBadge tone={r.is_system ? "neutral" : "brand"}>{r.is_system ? "System" : "Custom"}</StatusBadge>
        )
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (r) =>
          r.is_system ? (
            <span className="text-xs text-muted">Protected</span>
          ) : canManage ? (
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => setModalRole(r)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                aria-label={`Edit ${r.name}`}
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => deleteRole(r)}
                disabled={deletingId === r.id}
                className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                aria-label={`Delete ${r.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : null
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, deletingId]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="ROLE-BASED ACCESS CONTROL"
        title="Roles & Privileges"
        description="Create tenant-specific roles and assign exactly what each user can see or do."
        actions={
          canManage ? (
            <Button icon={Plus} onClick={() => setModalRole(null)}>
              New role
            </Button>
          ) : null
        }
      />

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {loading || roles.length ? (
        <DataTable
          columns={columns}
          data={roles}
          loading={loading}
          getRowKey={(r) => r.id}
          searchKeys={["name", "description"]}
          searchPlaceholder="Filter roles…"
          filters={[
            {
              key: "type",
              label: "All types",
              getValue: (r) => (r.is_system ? "System" : "Custom"),
              options: [
                { value: "Custom", label: "Custom" },
                { value: "System", label: "System" }
              ]
            }
          ]}
          initialSort={{ key: "name", dir: "asc" }}
          pageSize={15}
          emptyState={<EmptyState icon={UserCog} title="No roles match" />}
        />
      ) : (
        <Card animate={false}>
          <EmptyState
            icon={UserCog}
            title="No roles yet"
            description="Create a role, pick its privileges, then assign users to it."
            action={
              canManage ? (
                <Button size="sm" icon={Plus} onClick={() => setModalRole(null)}>
                  New role
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

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
