// Admin-only project management: sub-projects, members outside the Slack
// channel, archive and delete. Self-contained (fetches its own project) so the
// sidebar and the project page can both open it by id.
// Every endpoint it calls enforces admin server-side; the callers only decide
// whether to show the entry point.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { get, post, patch, del } from "../../api/clubPmClient";

const TYPE_OPTIONS = [
  { value: "ENGINEERING", label: "Engineering" },
  { value: "RESEARCH", label: "Research" },
  { value: "HYBRID", label: "Hybrid" },
];

function refreshProjects() {
  window.dispatchEvent(new Event("pm-projects-refresh"));
}

export default function ProjectAdminModal({ projectId, onClose, onDeleted, onChanged }) {
  const [project, setProject] = useState(null);
  const [allMembers, setAllMembers] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [subName, setSubName] = useState("");
  const [subType, setSubType] = useState("ENGINEERING");
  const [memberQuery, setMemberQuery] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    try {
      const [p, members, projects] = await Promise.all([
        get(`/api/projects/${projectId}`),
        get("/api/members"),
        get("/api/projects"),
      ]);
      setProject(p);
      setAllMembers(members);
      setAllProjects(projects);
      setLoadError(null);
    } catch (err) {
      setLoadError(err?.message ?? "Failed to load project");
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Same-tick double activation is only stopped by a ref guard, not `disabled`.
  const run = useCallback(async (fn, success) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (err) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const reload = useCallback(async () => {
    await load();
    refreshProjects();
    onChanged?.();
  }, [load, onChanged]);

  const children = project?.children ?? [];
  const members = useMemo(() => project?.members ?? [], [project]);
  const memberIds = useMemo(() => new Set(members.map(pm => pm.memberId)), [members]);
  const candidates = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return allMembers
      .filter(m => !m.isBot && !memberIds.has(m.id))
      .filter(m => !q
        || (m.displayName ?? "").toLowerCase().includes(q)
        || (m.slackHandle ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [allMembers, memberIds, memberQuery]);
  // A project that has sub-projects cannot itself become one (one level only).
  const parentOptions = useMemo(
    () => allProjects.filter(p => p.id !== projectId && !p.parentId),
    [allProjects, projectId]
  );

  const addSubProject = e => {
    e.preventDefault();
    const name = subName.trim();
    if (!name) return;
    run(async () => {
      await post("/api/projects", { name, type: subType, parentId: projectId });
      setSubName("");
      await reload();
    }, "Sub-project created");
  };

  const setParent = parentId => run(async () => {
    await patch(`/api/projects/${projectId}`, { parentId: parentId || null });
    await reload();
  }, parentId ? "Moved under parent" : "Detached from parent");

  const addMember = memberId => run(async () => {
    await post(`/api/projects/${projectId}/members`, { memberId });
    setMemberQuery("");
    await reload();
  }, "Member added");

  const removeMember = memberId => run(async () => {
    await del(`/api/projects/${projectId}/members/${memberId}`);
    await reload();
  }, "Member removed");

  const toggleArchive = () => run(async () => {
    const archived = project.status === "ARCHIVED";
    await patch(`/api/projects/${projectId}`, { status: archived ? "ACTIVE" : "ARCHIVED" });
    await reload();
  }, project?.status === "ARCHIVED" ? "Project restored" : "Project archived");

  const deleteProject = () => run(async () => {
    await del(`/api/projects/${projectId}`, { confirmName });
    refreshProjects();
    onDeleted?.();
    onClose();
  }, "Project deleted");

  const archived = project?.status === "ARCHIVED";
  const isChild = !!project?.parentId;
  const nameMatches = !!project && confirmName.trim() === project.name.trim();

  return createPortal(
    <div className="cpm-proj-edit-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-proj-edit-modal cpm-proj-admin-modal" role="dialog" aria-label="Manage project">
        <div className="cpm-proj-edit-header">
          <span>
            <i className="fas fa-sliders" style={{ marginRight: 10 }} aria-hidden="true" />
            Manage{project ? ` · ${project.name}` : " project"}
          </span>
          <button onClick={onClose} aria-label="Close" className="cpm-proj-edit-close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="cpm-proj-edit-body">
          {loadError && <p className="cpm-proj-edit-error">{loadError}</p>}
          {!project && !loadError && <p className="cpm-proj-edit-hint">Loading…</p>}

          {project && (
            <>
              {/* Sub-projects */}
              <section className="cpm-proj-admin-section">
                <h3 className="cpm-proj-admin-title">Sub-projects</h3>
                {isChild ? (
                  <p className="cpm-proj-edit-hint">
                    Part of <Link to={`/clubpm/projects/${project.parent?.id}`} onClick={onClose}>{project.parent?.name}</Link>.
                    Sub-projects can't have their own sub-projects.
                  </p>
                ) : (
                  <>
                    {children.length === 0
                      ? <p className="cpm-proj-edit-hint">No sub-projects yet. A sub-project has its own tasks, chat, channel and integrations.</p>
                      : (
                        <ul className="cpm-proj-admin-list">
                          {children.map(c => (
                            <li key={c.id} className="cpm-proj-admin-row">
                              <Link to={`/clubpm/projects/${c.id}`} onClick={onClose} className="cpm-proj-admin-row-name">{c.name}</Link>
                              <span className="cpm-proj-admin-tag">{(c.status ?? "").toLowerCase()}</span>
                              <button
                                type="button"
                                className="cpm-proj-edit-cancel"
                                disabled={busy}
                                onClick={() => run(async () => {
                                  await patch(`/api/projects/${c.id}`, { parentId: null });
                                  await reload();
                                }, "Sub-project detached")}
                              >Detach</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    <form onSubmit={addSubProject} className="cpm-proj-admin-inline">
                      <input
                        type="text"
                        className="cpm-proj-edit-input"
                        placeholder="New sub-project name"
                        aria-label="New sub-project name"
                        maxLength={120}
                        value={subName}
                        onChange={e => setSubName(e.target.value)}
                      />
                      <select className="cpm-proj-edit-input" aria-label="Sub-project type" value={subType} onChange={e => setSubType(e.target.value)}>
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button type="submit" className="clubpm-btn-primary" disabled={busy || !subName.trim()}>Add</button>
                    </form>
                  </>
                )}
                {children.length === 0 && (
                  <label className="cpm-proj-edit-field">
                    <span className="cpm-proj-edit-label">Parent project</span>
                    <select
                      className="cpm-proj-edit-input"
                      value={project.parentId ?? ""}
                      disabled={busy}
                      onChange={e => setParent(e.target.value)}
                    >
                      <option value="">None (top-level)</option>
                      {parentOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                )}
              </section>

              {/* Members */}
              <section className="cpm-proj-admin-section">
                <h3 className="cpm-proj-admin-title">Members</h3>
                <p className="cpm-proj-edit-hint">
                  {project.slackChannelId
                    ? "Channel members join automatically. Add anyone else here — they get edit access without being in the channel."
                    : "No Slack channel is linked, so membership is managed here."}
                </p>
                <ul className="cpm-proj-admin-list cpm-proj-admin-list--scroll">
                  {members.map(pm => (
                    <li key={pm.memberId} className="cpm-proj-admin-row">
                      <span className="cpm-proj-admin-row-name">{pm.member?.displayName ?? pm.memberId}</span>
                      <span className="cpm-proj-admin-tag">{pm.addedManually ? "added" : "synced"}</span>
                      {pm.addedManually && (
                        <button
                          type="button"
                          className="cpm-proj-edit-cancel"
                          disabled={busy}
                          onClick={() => removeMember(pm.memberId)}
                          aria-label={`Remove ${pm.member?.displayName ?? "member"}`}
                        >Remove</button>
                      )}
                    </li>
                  ))}
                </ul>
                <input
                  type="search"
                  className="cpm-proj-edit-input"
                  placeholder="Find a member to add…"
                  aria-label="Find a member to add"
                  value={memberQuery}
                  onChange={e => setMemberQuery(e.target.value)}
                  autoComplete="off"
                />
                {memberQuery.trim() && (
                  <ul className="cpm-proj-admin-list">
                    {candidates.length === 0 && <li className="cpm-proj-edit-hint">No matching members outside this project.</li>}
                    {candidates.map(m => (
                      <li key={m.id} className="cpm-proj-admin-row">
                        <span className="cpm-proj-admin-row-name">{m.displayName}</span>
                        {m.slackHandle && <span className="cpm-proj-admin-tag">@{m.slackHandle}</span>}
                        <button type="button" className="clubpm-btn-primary" disabled={busy} onClick={() => addMember(m.id)}>Add</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Danger zone */}
              <section className="cpm-proj-admin-section cpm-proj-admin-danger">
                <h3 className="cpm-proj-admin-title">Archive or delete</h3>
                <div className="cpm-proj-admin-inline">
                  <button type="button" className="cpm-proj-edit-cancel" disabled={busy} onClick={toggleArchive}>
                    <i className={`fas ${archived ? "fa-box-open" : "fa-box-archive"}`} aria-hidden="true" /> {archived ? "Restore project" : "Archive project"}
                  </button>
                </div>
                <p className="cpm-proj-edit-hint">
                  Deleting permanently removes this project's tasks, milestones, comments, Vault records and chat archive.
                  Linked Slack channels, Drive folders and GitHub repositories are not touched. This cannot be undone.
                </p>
                {children.length > 0 ? (
                  <p className="cpm-proj-edit-error">
                    Delete or detach its {children.length} sub-project{children.length === 1 ? "" : "s"} first.
                  </p>
                ) : (
                  <label className="cpm-proj-edit-field">
                    <span className="cpm-proj-edit-label">Type “{project.name}” to confirm</span>
                    <input
                      type="text"
                      className="cpm-proj-edit-input"
                      value={confirmName}
                      onChange={e => setConfirmName(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="cpm-proj-admin-delete"
                  disabled={busy || children.length > 0 || !nameMatches}
                  onClick={deleteProject}
                >
                  <i className="fas fa-trash" aria-hidden="true" /> Delete project permanently
                </button>
              </section>
            </>
          )}

          {error && <p className="cpm-proj-edit-error">{error}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
