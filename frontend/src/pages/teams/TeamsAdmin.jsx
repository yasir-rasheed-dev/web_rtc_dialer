import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Plus, RefreshCw, Trash2, UserPlus, UsersRound, X } from "lucide-react";

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
import { confirmModal } from "../../lib/modal";
import { notifyError, notifySuccess } from "../../lib/toast";

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20";

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

function PrivilegeToggleGroups({ groups, values, onToggle, disabled = false }) {
  return (
    <div className="flex flex-col gap-4">
      {Object.entries(groups).map(([category, items]) => (
        <div key={category}>
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-brand">{category}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                <span className="text-sm font-medium text-text">{item.name}</span>
                <Toggle checked={Boolean(values[item.key])} onChange={() => onToggle(item.key)} disabled={disabled} label={item.name} />
              </div>
            ))}
          </div>
        </div>
      ))}
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

  if (!form) return <Modal open={false} />;

  const togglePrivilege = (key) =>
    setForm((current) => ({ ...current, supervisorPrivileges: { ...current.supervisorPrivileges, [key]: !current.supervisorPrivileges[key] } }));
  const toggleMember = (id) =>
    setForm((current) => ({
      ...current,
      memberIds: current.memberIds.includes(id) ? current.memberIds.filter((item) => item !== id) : [...current.memberIds, id]
    }));

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
        <div className="grid grid-cols-2 gap-3">
          <label className={fieldLabel()}>
            Team name<span className="text-danger">*</span>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
          </label>
          <label className={fieldLabel()}>
            Supervisor<span className="text-danger">*</span>
            <Select
              options={supervisorOptions}
              value={supervisorOptions.find((option) => option.value === form.supervisorUserId) || null}
              onChange={(option) => setForm({ ...form, supervisorUserId: option?.value || "" })}
              placeholder="Select supervisor"
            />
          </label>
          <label className={`${fieldLabel()} col-span-2`}>
            Description
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={TEXTAREA_CLASS}
            />
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Initial members</p>
          <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-border p-3 sm:grid-cols-2">
            {(payload.memberCandidates || []).map((candidate) => (
              <label key={candidate.id} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={form.memberIds.includes(candidate.id)}
                  onChange={() => toggleMember(candidate.id)}
                  className="h-4 w-4 shrink-0 rounded border-border-strong accent-[rgb(var(--rn-blue))]"
                />
                <span className="truncate">
                  {candidate.name}
                  <span className="block text-xs text-muted">{candidate.roleName}</span>
                </span>
              </label>
            ))}
            {!payload.memberCandidates?.length && <p className="col-span-2 text-xs text-muted">No members available.</p>}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Supervisor privileges for this team</p>
          <PrivilegeToggleGroups groups={groups} values={form.supervisorPrivileges} onToggle={togglePrivilege} />
        </div>

        {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
        <div className="mt-1 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" icon={Plus} loading={busy}>
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
        <div className="grid grid-cols-2 gap-3">
          <label className={fieldLabel()}>
            Team name
            <Input
              value={form.name}
              disabled={!team.access.canEditSettings}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className={fieldLabel()}>
            Description
            <Input
              value={form.description}
              disabled={!team.access.canEditSettings}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          {payload.canManageAll && (
            <>
              <label className={fieldLabel()}>
                Supervisor
                <Select
                  options={supervisorOptions}
                  value={supervisorOptions.find((option) => option.value === form.supervisorUserId) || null}
                  onChange={(option) => setForm({ ...form, supervisorUserId: option?.value || "" })}
                  placeholder="Select supervisor"
                />
              </label>
              <div className="flex items-center justify-between gap-3 self-end rounded-xl bg-surface-2 px-4 py-3">
                <span className="text-sm font-medium text-text">Team active</span>
                <Toggle checked={Boolean(form.active)} onChange={(value) => setForm({ ...form, active: value })} />
              </div>
            </>
          )}
        </div>

        {payload.canManageAll && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Supervisor privileges in {team.name}</p>
            <PrivilegeToggleGroups groups={groups} values={form.supervisorPrivileges} onToggle={togglePrivilege} />
          </div>
        )}

        {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{error}</div>}
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
                <div key={member.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
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
                <div key={member.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
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

  return (
    <div className="flex flex-col gap-6">
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

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card title="Teams" description={`${payload.teams.length} visible teams`} icon={UsersRound}>
        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : payload.teams.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Team</th>
                  <th className="pb-2 pr-4">Supervisor</th>
                  <th className="pb-2 pr-4">Members</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payload.teams.map((team) => (
                  <tr key={team.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text">{team.name}</p>
                      {team.description && <p className="max-w-xs truncate text-xs text-muted">{team.description}</p>}
                    </td>
                    <td className="py-3 pr-4 text-muted">{team.supervisor?.name || "Not assigned"}</td>
                    <td className="py-3 pr-4 text-muted">{team.memberCount}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={team.active ? "success" : "neutral"}>{team.active ? "Active" : "Inactive"}</StatusBadge>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setViewId(team.id)}
                          className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                          aria-label={`View ${team.name}`}
                        >
                          <Eye size={14} />
                        </button>
                        {team.access.canEditSettings && (
                          <button
                            onClick={() => setEditId(team.id)}
                            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                            aria-label={`Edit ${team.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {payload.canManageAll && (
                          <button
                            onClick={() => deleteTeam(team)}
                            disabled={deletingId === team.id}
                            className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                            aria-label={`Delete ${team.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="No teams yet"
            description={payload.canManageAll ? "Create a team to start assigning a Supervisor and members." : undefined}
            action={
              payload.canManageAll ? (
                <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
                  New team
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

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
