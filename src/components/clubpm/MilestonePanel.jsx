import React, { useState, useEffect, useCallback } from "react";
import { get, post, patch, del } from "../../api/clubPmClient";

// ── Health config ────────────────────────────────────────────

const HEALTH_META = {
  ON_TRACK:  { label: "On Track",  color: "var(--clubpm-accent-green)",  icon: "✓"  },
  AT_RISK:   { label: "At Risk",   color: "var(--clubpm-accent-yellow)", icon: "⚠"  },
  BEHIND:    { label: "Behind",    color: "#e17055",                      icon: "🚨" },
  COMPLETED: { label: "Completed", color: "var(--clubpm-accent-green)",  icon: "🎉" },
  CANCELLED: { label: "Cancelled", color: "var(--clubpm-text-muted)",    icon: "✕"  },
};

// ── ProgressRing ─────────────────────────────────────────────

function ProgressRing({ progress }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  return (
    <svg width={36} height={36} viewBox="0 0 36 36">
      <circle cx={18} cy={18} r={r} fill="none" stroke="var(--clubpm-surface-300)" strokeWidth={3} />
      <circle cx={18} cy={18} r={r} fill="none"
        stroke="var(--clubpm-accent-primary)" strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 18 18)" />
      <text x={18} y={22} textAnchor="middle" fontSize={8}
        fill="var(--clubpm-text-primary)" fontWeight={700}>
        {progress}%
      </text>
    </svg>
  );
}

// ── HealthBadge ───────────────────────────────────────────────

function HealthBadge({ status }) {
  const meta = HEALTH_META[status] ?? HEALTH_META.ON_TRACK;
  return (
    <span className="cpm-milestone-badge" style={{ background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}55` }}>
      {meta.icon} {meta.label}
    </span>
  );
}

// ── MilestoneRoadmap ──────────────────────────────────────────

function MilestoneRoadmap({ milestones, onSelectMilestone }) {
  const now = new Date();

  if (milestones.length === 0) {
    return (
      <div className="cpm-milestone-roadmap-empty">
        <p>No milestones yet — add one below to see the roadmap.</p>
      </div>
    );
  }

  const dates = milestones.filter(m => m.dueDate).map(m => new Date(m.dueDate).getTime());
  const minTs = Math.min(...dates) - 7 * 86400000;
  const maxTs = Math.max(...dates) + 14 * 86400000;
  const totalMs = maxTs - minTs;

  const svgWidth = 680;
  const svgHeight = 100;
  const padLeft = 20;
  const padRight = 20;
  const trackWidth = svgWidth - padLeft - padRight;
  const diamondY = 55;
  const diamondSize = 9;

  const tsToX = (ts) => padLeft + ((ts - minTs) / totalMs) * trackWidth;
  const todayX = tsToX(now.getTime());

  const HEALTH_COLORS = {
    ON_TRACK:  "var(--clubpm-accent-primary)",
    AT_RISK:   "var(--clubpm-accent-yellow)",
    BEHIND:    "#e17055",
    COMPLETED: "var(--clubpm-accent-green)",
    CANCELLED: "var(--clubpm-text-muted)",
  };

  return (
    <div className="cpm-milestone-roadmap-wrap">
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ overflow: "visible" }}>
        {/* Track line */}
        <line x1={padLeft} y1={diamondY} x2={svgWidth - padRight} y2={diamondY}
          stroke="var(--clubpm-border)" strokeWidth={1.5} />

        {/* Today marker */}
        {todayX >= padLeft && todayX <= svgWidth - padRight && (
          <>
            <line x1={todayX} y1={diamondY - 30} x2={todayX} y2={diamondY + 25}
              stroke="var(--clubpm-accent-primary)" strokeWidth={1.5} strokeDasharray="4,3" />
            <text x={todayX} y={diamondY - 34} textAnchor="middle" fontSize={9}
              fill="var(--clubpm-accent-primary)" fontWeight={600}>Today</text>
          </>
        )}

        {/* Milestone diamonds */}
        {milestones.filter(m => m.dueDate).map((m) => {
          const x = tsToX(new Date(m.dueDate).getTime());
          const color = HEALTH_COLORS[m.status] ?? HEALTH_COLORS.ON_TRACK;
          const s = diamondSize;
          const pts = `${x},${diamondY - s} ${x + s},${diamondY} ${x},${diamondY + s} ${x - s},${diamondY}`;
          return (
            <g key={m.id} style={{ cursor: "pointer" }} onClick={() => onSelectMilestone(m.id)}>
              <polygon points={pts} fill={color} stroke="var(--clubpm-surface-100)" strokeWidth={1.5} />
              <text x={x} y={diamondY - s - 6} textAnchor="middle" fontSize={9}
                fill="var(--clubpm-text-secondary)"
                style={{ transform: `rotate(-35deg)`, transformOrigin: `${x}px ${diamondY - s - 6}px` }}>
                {m.title.length > 14 ? m.title.slice(0, 13) + "…" : m.title}
              </text>
              <text x={x} y={diamondY + s + 13} textAnchor="middle" fontSize={8}
                fill="var(--clubpm-text-muted)">
                {new Date(m.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── MilestoneCard ─────────────────────────────────────────────

function MilestoneCard({ milestone, projectTasks, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [linkingTasks, setLinkingTasks] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState(
    milestone.tasks ? milestone.tasks.map(t => t.id) : []
  );
  const [saving, setSaving] = useState(false);

  const linkedTaskIds = milestone.tasks ? milestone.tasks.map(t => t.id) : [];
  const availableTasks = (projectTasks ?? []).filter(t => !t.parentTaskId);

  const handleStatusChange = async (newStatus) => {
    await patch(`/api/milestones/${milestone.id}`, { status: newStatus });
    onUpdate();
  };

  const handleSaveTasks = async () => {
    setSaving(true);
    try {
      await patch(`/api/milestones/${milestone.id}`, { milestoneTaskIds: selectedTaskIds });
      onUpdate();
      setLinkingTasks(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = (taskId) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  return (
    <div className="cpm-milestone-card clubpm-glass-card">
      <div className="cpm-milestone-card-header">
        <div className="cpm-milestone-card-left">
          <ProgressRing progress={milestone.progress ?? 0} />
          <div className="cpm-milestone-card-info">
            <div className="cpm-milestone-card-title">{milestone.title}</div>
            {milestone.dueDate && (
              <div className="cpm-milestone-card-date">
                📅 {new Date(milestone.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>
        </div>
        <div className="cpm-milestone-card-right">
          <HealthBadge status={milestone.status ?? "ON_TRACK"} />
          {milestone.owner && (
            <span className="cpm-milestone-owner" title={milestone.owner.displayName}>
              {milestone.owner.avatarUrl
                ? <img src={milestone.owner.avatarUrl} alt="" className="cpm-milestone-avatar" />
                : <span className="cpm-milestone-avatar-initials">{milestone.owner.displayName[0]}</span>
              }
            </span>
          )}
          <button className="cpm-milestone-expand-btn" onClick={() => setExpanded(v => !v)}>
            {expanded ? "▲" : "▼"}
          </button>
          <button className="cpm-milestone-del-btn" onClick={() => onDelete(milestone.id)} title="Delete">🗑️</button>
        </div>
      </div>

      {expanded && (
        <div className="cpm-milestone-card-body">
          {milestone.description && (
            <div className="cpm-milestone-criteria">
              <div className="cpm-milestone-criteria-label">Acceptance Criteria</div>
              <p className="cpm-milestone-criteria-text">{milestone.description}</p>
            </div>
          )}

          <div className="cpm-milestone-tasks-header">
            <span className="cpm-milestone-tasks-label">
              Linked Tasks ({milestone.tasks?.length ?? 0})
            </span>
            <button className="cpm-milestone-link-btn" onClick={() => {
              setSelectedTaskIds(linkedTaskIds);
              setLinkingTasks(v => !v);
            }}>
              {linkingTasks ? "Cancel" : "Edit Tasks"}
            </button>
          </div>

          {linkingTasks ? (
            <div className="cpm-milestone-task-picker">
              {availableTasks.length === 0
                ? <p className="cpm-milestone-no-tasks">No tasks in this project yet.</p>
                : availableTasks.map(t => (
                    <label key={t.id} className="cpm-milestone-task-option">
                      <input type="checkbox"
                        checked={selectedTaskIds.includes(t.id)}
                        onChange={() => toggleTask(t.id)} />
                      <span className="cpm-milestone-task-option-text">{t.title}</span>
                      <span className="cpm-milestone-task-option-status">{t.status}</span>
                    </label>
                  ))
              }
              <div className="cpm-milestone-task-picker-actions">
                <button className="clubpm-btn-primary cpm-milestone-save-tasks-btn"
                  onClick={handleSaveTasks} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="cpm-milestone-linked-tasks">
              {(milestone.tasks ?? []).length === 0
                ? <p className="cpm-milestone-no-tasks">No tasks linked. Click "Edit Tasks" to link.</p>
                : milestone.tasks.map(t => (
                    <div key={t.id} className="cpm-milestone-linked-task">
                      <span className="cpm-milestone-task-status-dot"
                        style={{ background: t.status === "DONE" ? "var(--clubpm-accent-green)"
                          : t.status === "IN_PROGRESS" ? "var(--clubpm-accent-cyan)"
                          : t.status === "BLOCKED" ? "#e17055"
                          : "var(--clubpm-text-muted)" }} />
                      <span className="cpm-milestone-linked-task-title">{t.title}</span>
                      <span className="cpm-milestone-task-status-label">{t.status.replace("_", " ")}</span>
                    </div>
                  ))
              }
            </div>
          )}

          <div className="cpm-milestone-status-row">
            <span className="cpm-milestone-status-label">Status:</span>
            <select className="cpm-milestone-status-select"
              value={milestone.status ?? "ON_TRACK"}
              onChange={e => handleStatusChange(e.target.value)}>
              {Object.keys(HEALTH_META).map(s => (
                <option key={s} value={s}>{HEALTH_META[s].label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AddMilestoneForm ──────────────────────────────────────────

function AddMilestoneForm({ projectId, projectMembers, onCreated }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [showCriteria, setShowCriteria] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const members = projectMembers ?? [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    setSaving(true);
    setError(null);
    try {
      await post("/api/milestones", {
        title: title.trim(),
        projectId,
        dueDate,
        description: description || undefined,
        ownerId: ownerId || undefined,
      });
      setTitle(""); setDueDate(""); setOwnerId(""); setDescription(""); setShowCriteria(false);
      onCreated();
    } catch (err) {
      setError(err.message ?? "Failed to create milestone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="cpm-milestone-add-form clubpm-glass-card">
      <div className="cpm-milestone-add-form-title">+ New Milestone</div>
      <div className="cpm-milestone-add-row">
        <input className="clubpm-input cpm-milestone-input-title"
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Milestone name *" required />
        <input type="date" className="clubpm-input"
          value={dueDate} onChange={e => setDueDate(e.target.value)} required />
        {members.length > 0 && (
          <select className="clubpm-input" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
            <option value="">— Owner (optional) —</option>
            {members.map(pm => (
              <option key={pm.member.id} value={pm.member.id}>{pm.member.displayName}</option>
            ))}
          </select>
        )}
      </div>
      <button type="button" className="cpm-milestone-criteria-toggle"
        onClick={() => setShowCriteria(v => !v)}>
        {showCriteria ? "▲ Hide" : "▼ Add"} acceptance criteria
      </button>
      {showCriteria && (
        <textarea className="clubpm-input cpm-milestone-criteria-input"
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="What does done look like for this milestone?"
          rows={3} />
      )}
      {error && <p className="cpm-milestone-error">{error}</p>}
      <div className="cpm-milestone-add-form-footer">
        <button type="submit" className="clubpm-btn-primary" disabled={saving || !title.trim() || !dueDate}>
          {saving ? "Creating…" : "Create Milestone"}
        </button>
      </div>
    </form>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function MilestonePanel({ projectId, project, onRefresh }) {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("roadmap");
  const [selectedId, setSelectedId] = useState(null);

  const fetchMilestones = useCallback(() => {
    setLoading(true);
    get(`/api/milestones/project/${projectId}`)
      .then(setMilestones)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchMilestones(); }, [fetchMilestones]);

  const handleCreated = () => { fetchMilestones(); onRefresh?.(); };
  const handleUpdate = () => { fetchMilestones(); onRefresh?.(); };
  const handleDelete = async (id) => {
    await del(`/api/milestones/${id}`);
    fetchMilestones();
    onRefresh?.();
  };

  const handleSelectMilestone = (id) => {
    setView("list");
    setSelectedId(id);
  };

  const projectTasks = project?.tasks ?? [];
  const projectMembers = project?.members ?? [];

  if (loading) return (
    <div className="cpm-milestone-loading">
      <div className="clubpm-spinner" />
    </div>
  );

  return (
    <div className="cpm-milestone-panel clubpm-animate-fade-in">
      <div className="cpm-milestone-view-toggle">
        <button className={`cpm-milestone-toggle-btn${view === "roadmap" ? " active" : ""}`}
          onClick={() => setView("roadmap")}>🗺 Roadmap</button>
        <button className={`cpm-milestone-toggle-btn${view === "list" ? " active" : ""}`}
          onClick={() => setView("list")}>📋 List</button>
      </div>

      {view === "roadmap" && (
        <MilestoneRoadmap milestones={milestones} onSelectMilestone={handleSelectMilestone} />
      )}

      {view === "list" && (
        <div className="cpm-milestone-list">
          {milestones.length === 0 ? (
            <div className="cpm-milestone-empty">
              <p className="cpm-milestone-empty-icon">🎯</p>
              <p className="cpm-milestone-empty-text">No milestones yet. Create one below.</p>
            </div>
          ) : (
            milestones.map(m => (
              <MilestoneCard
                key={m.id}
                milestone={m}
                projectTasks={projectTasks}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}

      <AddMilestoneForm
        projectId={projectId}
        projectMembers={projectMembers}
        onCreated={handleCreated}
      />
    </div>
  );
}
