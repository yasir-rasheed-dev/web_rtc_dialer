import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Plus, RefreshCw, Trash2, UserPlus, UsersRound, X } from "lucide-react";

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
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";

// Same flat-white field look used across the redesigned modals (Roles etc).
const FIELD_INPUT =
  "h-10 w-full rounded-lg border border-border-strong bg-surface px-3.5 text-sm text-text placeholder:text-muted transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:opacity-60";
const TEXTAREA_CLASS =
  "w-full rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";

function fieldLabel() {
  return "flex flex-col gap-1.5 text-xs font-medium text-muted";
}

// Same set of privileges shown in the app today (Monitoring-category items
// are intentionally excluded here, matching the existing behavior) — only
// the checkbox -> toggle widget changed, not which privileges appear.
function groupedPrivileges(privileges = []) {
  return privileges
    .filter((item) => item.category !== "Monitoring")
    .reduce((groups, item) => {
      groups[item.category] ||= [];
      groups[item.category].push(item);
      return groups;
    }, {});
}

function PrivilegeToggleGroups({ groups, values, onToggle, onToggleAll, disabled = false }) {
  return (
    <div className="flex max-h-[42vh] flex-col gap-5 overflow-y-auto pr-1">
      {Object.entries(groups).map(([category, items]) => {
        const on = items.filter((i) => values[i.key]).length;
        const all = on === items.length && items.length > 0;
        return (
          <div key={category}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-brand">{category}</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] tabular-nums text-muted">
                  {on}/{items.length}
                </span>
                {!disabled && onToggleAll && (
                  <button
                    type="button"
                    onClick={() => onToggleAll(items, !all)}
                    className="text-[11px] font-semibold text-brand hover:underline"
                  >
                    {all ? "Clear all" : "Select all"}
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
                >
                  <span className="text-[13px] font-medium text-text">{item.name}</span>
                  <Toggle
                    checked={Boolean(values[item.key])}
                    onChange={() => onToggle(item.key)}
                    disabled={disabled}
                    label={item.name}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!Object.keys(groups).length && <p className="text-xs text-muted">No privileges configured.</p>}
    </div>
  );
}

function CreateTeamModal({ open, onClose, payload, onCreated }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({
      name: "",
      description: "",
      supervisorUserId: payload.supervisors?.[0]?.id || "",
      memberIds: [],
      supervisorPrivileges: { ...(payload.defaultSupervisorPrivileges || {}) }
    });
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups = useMemo(() => groupedPrivileges(payload.teamPrivileges), [payload.teamPrivileges]);
  const supervisorOptions = useMemo(
    () => (payload.supervisors || []).map((supervisor) => ({ value: supervisor.id, label: supervisor.name })),
    [payload.supervisors]
  );
  const memberOptions = useMemo(
    () =>
      (payload.memberCandidates || []).map((c) => ({
        value: c.id,
        label: c.roleName ? `${c.name} · ${c.roleName}` : c.name
      })),
    [payload.memberCandidates]
  );

  if (!form) return <Modal open={false} />;

  const togglePrivilege = (key) =>
    setForm((current) => ({ ...current, supervisorPrivileges: { ...current.supervisorPrivileges, [key]: !current.supervisorPrivileges[key] } }));
  const toggleAllPrivileges = (items, value) =>
    setForm((current) => {
      const next = { ...current.supervisorPrivileges };
      items.forEach((i) => (next[i.key] = value));
      return { ...current, supervisorPrivileges: next };
    });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Team name is required");
      return;
    }
    if (!form.supervisorUserId) {
      setError("Select a supervisor");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/teams", { method: "POST", body: form });
      notifySuccess("Team created.");
      onCreated();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New team" width="max-w-2xl">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={fieldLabel()}>
            <span>
              Team name <span className="text-danger">*</span>
            </span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              required
              placeholder="e.g. West Coast Sales"
              className={FIELD_INPUT}
            />
          </label>
          <label className={fieldLabel()}>
            <span>
              Supervisor <span className="text-danger">*</span>
            </span>
            <Select
              options={supervisorOptions}
              value={supervisorOptions.find((option) => option.value === form.supervisorUserId) || null}
              onChange={(option) => setForm({ ...form, supervisorUserId: option?.value || "" })}
              placeholder="Select supervisor"
            />
          </label>
          <label className={`${fieldLabel()} sm:col-span-2`}>
            <span>Description</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional"
              className={TEXTAREA_CLASS}
            />
          </label>
          <label className={`${fieldLabel()} sm:col-span-2`}>
            <span>Initial members</span>
            <Select
              isMulti
              isSearchable
              options={memberOptions}
              value={memberOptions.filter((o) => form.memberIds.includes(o.value))}
              onChange={(vals) => setForm({ ...form, memberIds: (vals || []).map((o) => o.value) })}
              placeholder={memberOptions.length ? "Search agents to add…" : "No members available"}
              isDisabled={!memberOptions.length}
              closeMenuOnSelect={false}
            />
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Supervisor privileges for this team</p>
          <PrivilegeToggleGroups
            groups={groups}
            values={form.supervisorPrivileges}
            onToggle={togglePrivilege}
            onToggleAll={toggleAllPrivileges}
          />
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
            Create team
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditTeamModal({ open, onClose, team, payload, refresh }) {
  const [form, setForm] = useState(null);
  const [addMemberId, setAddMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const [memberBusy, setMemberBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !team) return;
    setForm({
      name: team.name,
      description: team.description || "",
      active: team.active,
      supervisorUserId: team.supervisor?.id || "",
      supervisorPrivileges: { ...(team.supervisorPrivileges || {}) }
    });
    setAddMemberId("");
    setError("");
    // Deliberately keyed on team.id, not the whole team object: a background
    // reload (after adding/removing a member) must not wipe in-progress
    // edits to name/description/privileges in this form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team?.id]);

  const groups = useMemo(() => groupedPrivileges(payload.teamPrivileges), [payload.teamPrivileges]);
  const supervisorOptions = useMemo(
    () => (payload.supervisors || []).map((supervisor) => ({ value: supervisor.id, label: supervisor.name })),
    [payload.supervisors]
  );
  const addMemberOptions = useMemo(
    () =>
      (payload.memberCandidates || [])
        .filter((candidate) => !team?.members?.some((member) => member.id === candidate.id))
        .map((candidate) => ({ value: candidate.id, label: `${candidate.name} · ${candidate.roleName}` })),
    [payload.memberCandidates, team?.members]
  );

  if (!team || !form) return <Modal open={false} />;

  const togglePrivilege = (key) =>
    setForm((current) => ({ ...current, supervisorPrivileges: { ...current.supervisorPrivileges, [key]: !current.supervisorPrivileges[key] } }));
  const toggleAllPrivileges = (items, value) =>
    setForm((current) => {
      const next = { ...current.supervisorPrivileges };
      items.forEach((i) => (next[i.key] = value));
      return { ...current, supervisorPrivileges: next };
    });

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { name: form.name, description: form.description };
      if (payload.canManageAll) {
        body.active = form.active;
        body.supervisorUserId = form.supervisorUserId;
        body.supervisorPrivileges = form.supervisorPrivileges;
      }
      await api(`/teams/${team.id}`, { method: "PATCH", body });
      notifySuccess("Team settings updated.");
      await refresh();
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const addMember = async () => {
    if (!addMemberId) return;
    setMemberBusy("add");
    try {
      await api(`/teams/${team.id}/members`, { method: "POST", body: { userId: addMemberId } });
      setAddMemberId("");
      await refresh();
    } catch (requestError) {
      notifyError(requestError.message);
    } finally {
      setMemberBusy(null);
    }
  };

  const removeMember = async (userId) => {
    setMemberBusy(userId);
    try {
      await api(`/teams/${team.id}/members/${userId}`, { method: "DELETE" });
      await refresh();
    } catch (requestError) {
      notifyError(requestError.message);
    } finally {
      setMemberBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${team.name}`} width="max-w-2xl">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={fieldLabel()}>
            <span>Team name</span>
            <input
              value={form.name}
              disabled={!team.access.canEditSettings}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={FIELD_INPUT}
            />
          </label>
          <label className={fieldLabel()}>
            <span>Description</span>
            <input
              value={form.description}
              disabled={!team.access.canEditSettings}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional"
              className={FIELD_INPUT}
            />
          </label>
          {payload.canManageAll && (
            <>
              <label className={fieldLabel()}>
                <span>Supervisor</span>
                <Select
                  options={supervisorOptions}
                  value={supervisorOptions.find((option) => option.value === form.supervisorUserId) || null}
                  onChange={(option) => setForm({ ...form, supervisorUserId: option?.value || "" })}
                  placeholder="Select supervisor"
                />
              </label>
              <div className="flex items-center justify-between gap-3 self-end rounded-lg border border-border bg-surface-2 px-3.5 py-2.5">
                <span className="text-sm font-medium text-text">Team active</span>
                <Toggle checked={Boolean(form.active)} onChange={(value) => setForm({ ...form, active: value })} />
              </div>
            </>
          )}
        </div>

        {payload.canManageAll && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Supervisor privileges in {team.name}</p>
            <PrivilegeToggleGroups
              groups={groups}
              values={form.supervisorPrivileges}
              onToggle={togglePrivilege}
              onToggleAll={toggleAllPrivileges}
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </div>
        )}
        {team.access.canEditSettings && (
          <div className="flex justify-end border-b border-border pb-4">
            <Button type="submit" size="sm" loading={busy}>
              Save team settings
            </Button>
          </div>
        )}

        {team.access.canViewMembers && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted">Members · {team.memberCount} assigned</p>
            </div>
            {team.access.canAddMembers && (
              <div className="flex items-center gap-2">
                <Select
                  className="flex-1"
                  options={addMemberOptions}
                  value={addMemberOptions.find((option) => option.value === addMemberId) || null}
                  onChange={(option) => setAddMemberId(option?.value || "")}
                  placeholder="Select user to add"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={UserPlus}
                  disabled={!addMemberId}
                  loading={memberBusy === "add"}
                  onClick={addMember}
                >
                  Add
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {(team.members || []).map((member) => (
                <div key={member.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{member.name}</p>
                    <p className="truncate text-xs text-muted">
                      {member.roleName}
                      {member.extension ? ` · Ext ${member.extension}` : ""} · {member.status || "OFFLINE"}
                    </p>
                  </div>
                  {team.access.canRemoveMembers && (
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      disabled={memberBusy === member.id}
                      className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                      aria-label={`Remove ${member.name}`}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
              {!team.members?.length && <p className="text-xs text-muted">No members assigned.</p>}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function ViewTeamModal({ open, onClose, team, payload }) {
  const groups = useMemo(() => groupedPrivileges(payload.teamPrivileges), [payload.teamPrivileges]);
  if (!team) return <Modal open={false} />;

  return (
    <Modal open={open} onClose={onClose} title={team.name} width="max-w-2xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={team.active ? "success" : "neutral"}>{team.active ? "Active" : "Inactive"}</StatusBadge>
          <StatusBadge tone="brand">{team.memberCount} member{team.memberCount === 1 ? "" : "s"}</StatusBadge>
        </div>

        {team.description && <p className="text-sm leading-relaxed text-muted">{team.description}</p>}

        <div>
          <p className="mb-1 text-xs font-semibold text-muted">Supervisor</p>
          <p className="text-sm text-text">{team.supervisor?.name || "Not assigned"}</p>
        </div>

        {team.access.canViewMembers && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Members</p>
            <div className="flex flex-col gap-1.5">
              {(team.members || []).map((member) => (
                <div key={member.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{member.name}</p>
                    <p className="truncate text-xs text-muted">{member.roleName}</p>
                  </div>
                </div>
              ))}
              {!team.members?.length && <p className="text-xs text-muted">No members assigned.</p>}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Supervisor privileges</p>
          <PrivilegeToggleGroups groups={groups} values={team.supervisorPrivileges || {}} onToggle={() => {}} disabled />
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function TeamsAdmin() {
  const [payload, setPayload] = useState({
    teams: [],
    supervisors: [],
    memberCandidates: [],
    teamPrivileges: [],
    defaultSupervisorPrivileges: {},
    canManageAll: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayload(await api("/teams"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const viewTeam = useMemo(() => payload.teams.find((team) => team.id === viewId) || null, [payload.teams, viewId]);
  const editTeam = useMemo(() => payload.teams.find((team) => team.id === editId) || null, [payload.teams, editId]);

  const deleteTeam = async (team) => {
    const confirmed = await confirmModal({
      title: "Delete team",
      message: `Delete team "${team.name}"? This cannot be undone.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    setDeletingId(team.id);
    try {
      await api(`/teams/${team.id}`, { method: "DELETE" });
      notifySuccess("Team deleted.");
      await load();
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
        header: "Team",
        sortable: true,
        cellClassName: "text-text",
        cell: (t) => (
          <div className="min-w-0">
            <p className="font-medium">{t.name}</p>
            {t.description && <p className="max-w-xs truncate text-xs text-muted">{t.description}</p>}
          </div>
        )
      },
      {
        key: "supervisor",
        header: "Supervisor",
        sortable: true,
        sortValue: (t) => t.supervisor?.name || "",
        cell: (t) => t.supervisor?.name || <span className="text-muted/60">Not assigned</span>
      },
      {
        key: "memberCount",
        header: "Members",
        align: "right",
        sortable: true,
        cell: (t) => <span className="tabular-nums">{t.memberCount}</span>
      },
      {
        key: "active",
        header: "Status",
        sortable: true,
        cell: (t) => <StatusBadge tone={t.active ? "success" : "neutral"}>{t.active ? "Active" : "Inactive"}</StatusBadge>
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (t) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setViewId(t.id)}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              aria-label={`View ${t.name}`}
            >
              <Eye size={14} />
            </button>
            {t.access?.canEditSettings && (
              <button
                onClick={() => setEditId(t.id)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                aria-label={`Edit ${t.name}`}
              >
                <Pencil size={14} />
              </button>
            )}
            {payload.canManageAll && (
              <button
                onClick={() => deleteTeam(t)}
                disabled={deletingId === t.id}
                className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                aria-label={`Delete ${t.name}`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payload.canManageAll, deletingId]
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="TEAM OPERATIONS"
        title="Team Management"
        description="One Supervisor per team, multiple teams per Supervisor, and multiple team memberships per agent."
        actions={
          <>
            {payload.canManageAll && (
              <Button icon={Plus} onClick={() => setCreateOpen(true)}>
                New team
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

      {loading || payload.teams.length ? (
        <DataTable
          columns={columns}
          data={payload.teams}
          loading={loading}
          getRowKey={(t) => t.id}
          searchKeys={["name", "description"]}
          searchPlaceholder="Filter teams…"
          filters={[
            {
              key: "status",
              label: "All statuses",
              getValue: (t) => (t.active ? "Active" : "Inactive"),
              options: [
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" }
              ]
            }
          ]}
          initialSort={{ key: "name", dir: "asc" }}
          pageSize={15}
          emptyState={<EmptyState icon={UsersRound} title="No teams match" />}
        />
      ) : (
        <Card animate={false}>
          <EmptyState
            icon={UsersRound}
            title="No teams yet"
            description={payload.canManageAll ? "Create a team to assign a Supervisor and members." : undefined}
            action={
              payload.canManageAll ? (
                <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
                  New team
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      <CreateTeamModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        payload={payload}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />
      <EditTeamModal open={Boolean(editTeam)} onClose={() => setEditId(null)} team={editTeam} payload={payload} refresh={load} />
      <ViewTeamModal open={Boolean(viewTeam)} onClose={() => setViewId(null)} team={viewTeam} payload={payload} />
    </div>
  );
}
