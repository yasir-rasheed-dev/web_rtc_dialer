import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { api } from "./lib/api";
import { confirmModal } from "./lib/modal";

function groupedPrivileges(privileges = []) {
  return privileges
    .filter((item) => item.category !== "Monitoring")
    .reduce((groups, item) => {
      groups[item.category] ||= [];
      groups[item.category].push(item);
      return groups;
    }, {});
}

export default function TeamsAdmin() {
  const [payload, setPayload] = useState({ teams: [], supervisors: [], memberCandidates: [], teamPrivileges: [], defaultSupervisorPrivileges: {}, canManageAll: false });
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createForm, setCreateForm] = useState({ name: "", description: "", supervisorUserId: "", memberIds: [], supervisorPrivileges: {} });
  const [editForm, setEditForm] = useState(null);
  const [addMemberId, setAddMemberId] = useState("");

  const load = async () => {
    setError("");
    try {
      const next = await api("/teams");
      setPayload(next);
      setCreateForm((current) => ({
        ...current,
        supervisorUserId: current.supervisorUserId || next.supervisors?.[0]?.id || "",
        supervisorPrivileges: Object.keys(current.supervisorPrivileges || {}).length ? current.supervisorPrivileges : { ...(next.defaultSupervisorPrivileges || {}) }
      }));
      setSelectedId((current) => current && next.teams.some((team) => team.id === current) ? current : next.teams?.[0]?.id || "");
    } catch (requestError) { setError(requestError.message); }
  };

  useEffect(() => { load(); }, []);

  const selected = useMemo(() => payload.teams.find((team) => team.id === selectedId) || null, [payload.teams, selectedId]);
  const groups = useMemo(() => groupedPrivileges(payload.teamPrivileges), [payload.teamPrivileges]);

  useEffect(() => {
    if (!selected) { setEditForm(null); return; }
    setEditForm({
      name: selected.name,
      description: selected.description || "",
      active: selected.active,
      supervisorUserId: selected.supervisor?.id || "",
      supervisorPrivileges: { ...(selected.supervisorPrivileges || {}) }
    });
    setAddMemberId("");
  }, [selected]);

  const toggleCreateMember = (id) => setCreateForm((current) => ({ ...current, memberIds: current.memberIds.includes(id) ? current.memberIds.filter((item) => item !== id) : [...current.memberIds, id] }));
  const togglePrivilege = (target, key) => {
    if (target === "create") setCreateForm((current) => ({ ...current, supervisorPrivileges: { ...current.supervisorPrivileges, [key]: !current.supervisorPrivileges[key] } }));
    else setEditForm((current) => ({ ...current, supervisorPrivileges: { ...current.supervisorPrivileges, [key]: !current.supervisorPrivileges[key] } }));
  };

  const createTeam = async (event) => {
    event.preventDefault(); setError(""); setNotice("");
    try {
      await api("/teams", { method: "POST", body: createForm });
      setNotice("Team created successfully.");
      setCreateForm({ name: "", description: "", supervisorUserId: "", memberIds: [], supervisorPrivileges: { ...(payload.defaultSupervisorPrivileges || {}) } });
      await load();
    } catch (requestError) { setError(requestError.message); }
  };

  const saveTeam = async () => {
    if (!selected || !editForm) return;
    setError(""); setNotice("");
    try {
      const body = { name: editForm.name, description: editForm.description };
      if (payload.canManageAll) {
        body.active = editForm.active;
        body.supervisorUserId = editForm.supervisorUserId;
        body.supervisorPrivileges = editForm.supervisorPrivileges;
      }
      await api(`/teams/${selected.id}`, { method: "PATCH", body });
      setNotice("Team settings updated.");
      await load();
    } catch (requestError) { setError(requestError.message); }
  };

  const addMember = async () => {
    if (!selected || !addMemberId) return;
    setError("");
    try {
      await api(`/teams/${selected.id}/members`, { method: "POST", body: { userId: addMemberId } });
      setAddMemberId("");
      await load();
    } catch (requestError) { setError(requestError.message); }
  };

  const removeMember = async (userId) => {
    if (!selected) return;
    setError("");
    try {
      await api(`/teams/${selected.id}/members/${userId}`, { method: "DELETE" });
      await load();
    } catch (requestError) { setError(requestError.message); }
  };

  const deleteTeam = async () => {
    if (!selected || !payload.canManageAll) return;
    const confirmed = await confirmModal({
      title: "Delete team",
      message: `Delete team "${selected.name}"? This cannot be undone.`,
      confirmText: "Delete",
      danger: true
    });
    if (!confirmed) return;
    setError("");
    try {
      await api(`/teams/${selected.id}`, { method: "DELETE" });
      setNotice("Team deleted.");
      await load();
    } catch (requestError) { setError(requestError.message); }
  };

  const availableMembers = (payload.memberCandidates || []).filter((candidate) => !selected?.members?.some((member) => member.id === candidate.id));

  return <div className="page-stack"><div className="page-heading"><div><span className="overline">TEAM OPERATIONS</span><h1>Team Management</h1><p>One Supervisor per team, multiple teams per Supervisor, and multiple team memberships per agent.</p></div><button className="secondary-action" onClick={load}><RefreshCw size={16} />Refresh</button></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert">{notice}</div>}

    {payload.canManageAll && <section className="console-card team-create-card"><div className="card-title"><div><h2>Create team</h2><p>Assign a Supervisor, initial members and team-specific Supervisor privileges.</p></div><Plus /></div><form className="team-create-form" onSubmit={createTeam}><label>Team name<input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required /></label><label>Supervisor<select value={createForm.supervisorUserId} onChange={(e) => setCreateForm({ ...createForm, supervisorUserId: e.target.value })} required><option value="">Select Supervisor</option>{payload.supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select></label><label className="team-description">Description<textarea rows="2" value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} /></label><div className="team-create-members"><span>Initial members</span><div className="member-check-grid">{payload.memberCandidates.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={createForm.memberIds.includes(candidate.id)} onChange={() => toggleCreateMember(candidate.id)} /><span>{candidate.name}<small>{candidate.roleName}{candidate.extension ? ` · ${candidate.extension}` : ""}</small></span></label>)}</div></div><div className="team-privileges"><span>Supervisor privileges for this team</span>{Object.entries(groups).map(([category, items]) => <fieldset key={category}><legend>{category}</legend><div className="permission-grid">{items.map((item) => <label className="permission-option" key={item.key}><input type="checkbox" checked={Boolean(createForm.supervisorPrivileges[item.key])} onChange={() => togglePrivilege("create", item.key)} /><span>{item.name}</span></label>)}</div></fieldset>)}</div><button className="primary-action"><Plus size={16} />Create team</button></form></section>}

    <div className="teams-workspace"><aside className="console-card team-list-panel"><div className="card-title"><div><h2>Teams</h2><p>{payload.teams.length} visible teams</p></div><UsersRound /></div><div className="team-selector-list">{payload.teams.map((team) => <button key={team.id} className={selectedId === team.id ? "active" : ""} onClick={() => setSelectedId(team.id)}><span><strong>{team.name}</strong><small>{team.supervisor?.name || "No Supervisor"}</small></span><em>{team.memberCount}</em></button>)}{!payload.teams.length && <div className="empty-block">No teams available</div>}</div></aside>

      {selected && editForm && <section className="console-card team-detail-panel"><div className="card-title"><div><h2>{selected.name}</h2><p>Supervisor: {selected.supervisor?.name || "Not assigned"}</p></div>{payload.canManageAll && <button className="icon-action danger" onClick={deleteTeam} title="Delete team"><Trash2 size={17} /></button>}</div>
        <div className="team-settings-grid"><label>Team name<input value={editForm.name} disabled={!selected.access.canEditSettings} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label><label>Description<input value={editForm.description} disabled={!selected.access.canEditSettings} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></label>{payload.canManageAll && <><label>Supervisor<select value={editForm.supervisorUserId} onChange={(e) => setEditForm({ ...editForm, supervisorUserId: e.target.value })}><option value="">Select Supervisor</option>{payload.supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select></label><label className="inline-check team-active-check"><input type="checkbox" checked={Boolean(editForm.active)} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} /> Team active</label></>}</div>
        {payload.canManageAll && <div className="team-privileges"><div className="team-section-title"><ShieldCheck size={17} /><span>Supervisor privileges in {selected.name}</span></div>{Object.entries(groups).map(([category, items]) => <fieldset key={category}><legend>{category}</legend><div className="permission-grid">{items.map((item) => <label className="permission-option" key={item.key}><input type="checkbox" checked={Boolean(editForm.supervisorPrivileges[item.key])} onChange={() => togglePrivilege("edit", item.key)} /><span>{item.name}</span></label>)}</div></fieldset>)}</div>}
        {selected.access.canEditSettings && <button className="primary-action team-save" onClick={saveTeam}><Save size={16} />Save team settings</button>}

        <div className="team-members-section"><div className="team-section-title"><UsersRound size={17} /><div><strong>Members</strong><small>{selected.memberCount} assigned users</small></div></div>{selected.access.canAddMembers && <div className="add-member-row"><select value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)}><option value="">Select user to add</option>{availableMembers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.roleName}</option>)}</select><button className="secondary-action" disabled={!addMemberId} onClick={addMember}><UserPlus size={16} />Add member</button></div>}<div className="team-member-list">{selected.members.map((member) => <div key={member.id}><span className="avatar mini">{member.name.slice(0, 2).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.roleName}{member.extension ? ` · Ext ${member.extension}` : ""} · {member.status || "OFFLINE"}</small></div>{selected.access.canRemoveMembers && <button className="text-button danger-text" onClick={() => removeMember(member.id)}>Remove</button>}</div>)}{!selected.members.length && <div className="empty-block">No members assigned</div>}</div></div>
      </section>}
    </div>
  </div>;
}
