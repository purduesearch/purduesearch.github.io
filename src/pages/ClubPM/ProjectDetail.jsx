import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { get, post, patch, del } from "../../api/clubPmClient";
import MemberBadge from "../../components/clubpm/MemberBadge";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import TaskModal from "../../components/clubpm/TaskModal";
import CalendarView from "../../components/clubpm/CalendarView";
import ProjectActivity from "../../components/clubpm/ProjectActivity";
import ReportingView from "../../components/clubpm/ReportingView";
import MilestonePanel from "../../components/clubpm/MilestonePanel";
import GanttChart from "../../components/clubpm/GanttChart";
import { PriorityBars, AvatarStack } from "../../components/clubpm/TaskPrimitives";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Constants ────────────────────────────────────────────────

const BINS = [
  { id: "TODO",        label: "Not Started", color: "var(--clubpm-text-secondary)" },
  { id: "IN_PROGRESS", label: "In Progress", color: "var(--clubpm-accent-yellow)" },
  { id: "DONE",        label: "Completed",   color: "var(--clubpm-accent-green)" },
];

const NAV_TABS = [
  { id: "tasks",      label: "Tasks",      icon: "📋" },
  { id: "calendar",   label: "Calendar",   icon: "📅" },
  { id: "milestones", label: "Milestones", icon: "🎯" },
  { id: "activity",   label: "Activity",   icon: "📜" },
  { id: "reports",    label: "Reports",    icon: "📊" },
  { id: "updates",    label: "Updates",    icon: "📝" },
];

const STATUS_BADGE = {
  ACTIVE: "clubpm-badge-active",
  PAUSED: "clubpm-badge-paused",
  COMPLETED: "clubpm-badge-completed",
  ARCHIVED: "clubpm-badge-archived",
};

const PROJECT_DOT_CLASS = {
  ACTIVE: "cpm-dot-active",
  PAUSED: "cpm-dot-paused",
  COMPLETED: "cpm-dot-done",
  ARCHIVED: "cpm-dot-muted",
};

// ── Project Sidebar (left column) ────────────────────────────

function ProjectSidebar({ project, allProjects, activeTab, onTabChange }) {
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const currentDotClass = PROJECT_DOT_CLASS[project.status] ?? "cpm-dot-muted";

  return (
    <aside className="cpm-project-sidebar">
      <div className="cpm-proj-sidebar-header">
        <Link
          to="/clubpm"
          style={{
            fontSize: 11,
            color: "var(--clubpm-text-muted)",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 10,
          }}
        >
          ← Dashboard
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`cpm-status-dot ${currentDotClass}`} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--clubpm-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={project.name}
          >
            {project.name}
          </span>
        </div>
      </div>

      <div style={{ padding: "8px 0", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`cpm-proj-nav-item${activeTab === tab.id ? " active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span style={{ marginRight: 8 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div
        style={{
          marginTop: 8,
          paddingTop: 12,
          borderTop: "1px solid var(--clubpm-border)",
        }}
      >
        <button
          onClick={() => setProjectsCollapsed((c) => !c)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            padding: "6px 16px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--clubpm-text-muted)",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          <i className={`fas fa-chevron-${projectsCollapsed ? "right" : "down"}`} style={{ fontSize: 9 }} />
          Projects
        </button>
        {!projectsCollapsed && (
          <div style={{ display: "flex", flexDirection: "column", padding: "4px 0" }}>
            {allProjects.length === 0 ? (
              <p style={{ padding: "8px 16px", fontSize: 12, color: "var(--clubpm-text-muted)" }}>
                No projects
              </p>
            ) : (
              allProjects.map((p) => (
                <SidebarProjectItem key={p.id} project={p} isCurrent={p.id === project.id} />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function SidebarProjectItem({ project, isCurrent }) {
  const dotClass = PROJECT_DOT_CLASS[project.status] ?? "cpm-dot-muted";
  return (
    <Link
      to={`/clubpm/projects/${project.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 16px",
        fontSize: 13,
        color: isCurrent ? "var(--clubpm-text-primary)" : "var(--clubpm-text-secondary)",
        background: isCurrent ? "var(--clubpm-surface-300)" : "transparent",
        textDecoration: "none",
        borderLeft: isCurrent ? "2px solid var(--clubpm-accent-primary)" : "2px solid transparent",
      }}
    >
      <span className={`cpm-status-dot ${dotClass}`} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {project.name}
      </span>
    </Link>
  );
}

// ── Progress Bar (top of tasks tab) ──────────────────────────

function ProgressBar({ tasks }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "BLOCKED").length;
  const todo = Math.max(total - done - inProgress, 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className="cpm-proj-progress-row">
        <div className="cpm-progress-bar-track">
          <div
            className="cpm-progress-bar-segment"
            style={{ width: "100%", background: "var(--clubpm-surface-400)" }}
          />
        </div>
        <span className="cpm-proj-progress-pct">0%</span>
        <span className="cpm-proj-progress-stats">
          <span style={{ color: "var(--clubpm-text-muted)" }}>No tasks yet</span>
        </span>
      </div>
    );
  }

  return (
    <div className="cpm-proj-progress-row">
      <div className="cpm-progress-bar-track">
        <div
          className="cpm-progress-bar-segment"
          style={{ width: `${(done / total) * 100}%`, background: "var(--clubpm-accent-green)" }}
        />
        <div
          className="cpm-progress-bar-segment"
          style={{ width: `${(inProgress / total) * 100}%`, background: "var(--clubpm-accent-yellow)" }}
        />
        <div
          className="cpm-progress-bar-segment"
          style={{ width: `${(todo / total) * 100}%`, background: "var(--clubpm-surface-400)" }}
        />
      </div>
      <span className="cpm-proj-progress-pct">{pct}%</span>
      <span className="cpm-proj-progress-stats">
        <span style={{ color: "var(--clubpm-accent-green)" }}>■ {done}</span>
        <span style={{ color: "var(--clubpm-accent-yellow)" }}>■ {inProgress}</span>
        <span style={{ color: "var(--clubpm-text-muted)" }}>■ {todo}</span>
      </span>
    </div>
  );
}

// ── Status Bin (collapsible droppable section) ───────────────

function StatusBin({ bin, tasks, subtasksByParent, expandedParents, onToggleParent, isOver, onTaskClick, onAddTask, canEdit = true }) {
  const [collapsed, setCollapsed] = useState(false);
  const { setNodeRef } = useDroppable({ id: bin.id });

  return (
    <div
      ref={setNodeRef}
      className={`cpm-status-bin${isOver ? " cpm-status-bin--over" : ""}`}
    >
      <div className="cpm-status-bin-header">
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: bin.color,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <i
            className={`fas fa-chevron-${collapsed ? "right" : "down"}`}
            style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}
          />
          <span>{bin.label}</span>
          <span style={{ color: "var(--clubpm-text-muted)", fontWeight: 400 }}>
            {tasks.length}
          </span>
        </button>
        {canEdit && (
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--clubpm-text-muted)",
              fontSize: 12,
              padding: "2px 8px",
            }}
            title="Add task"
            onClick={(e) => { e.stopPropagation(); onAddTask?.(bin.id); }}
          >
            <i className="fas fa-plus" /> Add Task
          </button>
        )}
      </div>

      {!collapsed && (
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {tasks.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  fontSize: 12,
                  color: "var(--clubpm-text-muted)",
                  fontStyle: "italic",
                }}
              >
                Drop tasks here
              </div>
            ) : (
              tasks.map((task) => {
                const subs = subtasksByParent?.get(task.id) ?? [];
                const isExpanded = expandedParents?.has(task.id) ?? false;
                return (
                  <React.Fragment key={task.id}>
                    <CompactTaskRow
                      task={task}
                      onClick={onTaskClick}
                      subtaskCount={subs.length}
                      isExpanded={isExpanded}
                      onToggleExpand={() => onToggleParent?.(task.id)}
                    />
                    {isExpanded && subs.map((sub) => (
                      <KanbanSubtaskRow key={sub.id} subtask={sub} onClick={onTaskClick} />
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// ── Compact Task Row ─────────────────────────────────────────

function CompactTaskRow({ task, onClick, subtaskCount = 0, isExpanded = false, onToggleExpand }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="cpm-task-row-compact"
      onClick={() => {
        if (!isDragging) onClick(task);
      }}
    >
      <i
        {...listeners}
        className="fas fa-grip-vertical"
        style={{
          color: "var(--clubpm-text-muted)",
          fontSize: 11,
          cursor: "grab",
          flexShrink: 0,
        }}
      />
      <span
        className={`cpm-kanban-progress ${
          task.status === "DONE"
            ? "cpm-kanban-progress--done"
            : task.status === "IN_PROGRESS" || task.status === "BLOCKED"
            ? "cpm-kanban-progress--in"
            : "cpm-kanban-progress--none"
        }`}
        style={{ flexShrink: 0 }}
      >
        {task.status === "DONE" && <i className="fas fa-check" style={{ fontSize: 6 }} />}
      </span>
      <PriorityBars priority={task.priority} />
      <span className="cpm-task-row-compact-name">{task.title}</span>
      {subtaskCount > 0 && (
        <button
          onClick={e => { e.stopPropagation(); onToggleExpand?.(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--clubpm-text-muted)", fontSize: 10, padding: "2px 4px",
            display: "flex", alignItems: "center", gap: 3, flexShrink: 0,
          }}
          title={isExpanded ? "Collapse subtasks" : "Expand subtasks"}
        >
          <i className={`fas fa-chevron-${isExpanded ? "up" : "down"}`} />
          {subtaskCount}
        </button>
      )}
      <AvatarStack assignees={task.assignees} />
      {task.dueDate && (
        <span
          style={{
            fontSize: 11,
            color: "var(--clubpm-text-muted)",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {new Date(task.dueDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      )}
    </div>
  );
}

// ── Kanban Subtask Row (non-draggable, indented) ─────────────

function KanbanSubtaskRow({ subtask, onClick }) {
  return (
    <div
      className="cpm-task-row-compact"
      style={{ paddingLeft: 24, cursor: "pointer" }}
      onClick={() => onClick(subtask)}
    >
      <span
        className={`cpm-kanban-progress ${
          subtask.status === "DONE"
            ? "cpm-kanban-progress--done"
            : subtask.status === "IN_PROGRESS" || subtask.status === "BLOCKED"
            ? "cpm-kanban-progress--in"
            : "cpm-kanban-progress--none"
        }`}
        style={{ flexShrink: 0 }}
      >
        {subtask.status === "DONE" && <i className="fas fa-check" style={{ fontSize: 6 }} />}
      </span>
      <PriorityBars priority={subtask.priority} />
      <span className="cpm-task-row-compact-name" style={{ color: "var(--clubpm-text-secondary)" }}>
        {subtask.title}
      </span>
      <AvatarStack assignees={subtask.assignees} />
      {subtask.dueDate && (
        <span style={{ fontSize: 11, color: "var(--clubpm-text-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
          {new Date(subtask.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
    </div>
  );
}

// ── Assignee Panel (right column) ────────────────────────────

function AssigneePanel({ members, channelMemberSlackIds = [], hasLinkedChannel = false, onAssign }) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = members;

    if (hasLinkedChannel && channelMemberSlackIds.length > 0) {
      const idSet = new Set(channelMemberSlackIds);
      list = list.filter(pm => idSet.has(pm.member?.slackId));
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((pm) =>
      (pm.member?.displayName ?? "").toLowerCase().includes(q)
    );
  }, [members, channelMemberSlackIds, hasLinkedChannel, search]);

  return (
    <aside className="cpm-assignee-panel">
      <div className="cpm-assignee-panel-header">
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--clubpm-text-primary)" }}>
          Members
        </span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--clubpm-text-muted)",
            padding: 4,
          }}
          aria-label="Toggle members panel"
        >
          <i
            className={`fas fa-chevron-${collapsed ? "left" : "right"}`}
            style={{ fontSize: 11 }}
          />
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: "8px 12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--clubpm-text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Assignees
          </div>
          {hasLinkedChannel && (
            <div style={{ fontSize: 10, color: "var(--clubpm-text-muted)", padding: "0 0 4px" }}>
              Showing channel members only
            </div>
          )}
          <input
            type="text"
            className="cpm-assignee-search"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--clubpm-text-muted)", padding: "4px 0" }}>
                No members
              </p>
            ) : (
              filtered.map((pm) => (
                <DraggableMemberChip key={pm.memberId} pm={pm} />
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function DraggableMemberChip({ pm }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${pm.memberId}`,
    data: { type: "member", memberId: pm.memberId },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cpm-assignee-chip"
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: "grab",
      }}
    >
      <MemberBadge member={pm.member} size="sm" />
      <span className="cpm-assignee-chip-name">{pm.member.displayName}</span>
    </div>
  );
}

// ── Add Task Modal (project-scoped) ──────────────────────────

const PRIORITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function AddProjectTaskModal({ projectId, initialStatus, projectMembers, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [milestoneId, setMilestoneId] = useState("");
  const [milestones, setMilestones] = useState([]);

  useEffect(() => {
    get(`/api/milestones/project/${projectId}`)
      .then(ms => setMilestones(
        ms.filter(m => m.status !== "COMPLETED" && m.status !== "CANCELLED")
      ))
      .catch(() => {});
  }, [projectId]);

  const inputStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
    background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
    color: "var(--clubpm-text-primary)", outline: "none", boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 600, color: "var(--clubpm-text-muted)",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5,
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const newTask = await post(`/api/projects/${projectId}/tasks`, {
        title: title.trim(),
        priority,
        status: initialStatus,
        dueDate: dueDate || undefined,
        milestoneId: milestoneId || undefined,
      });
      onCreated(newTask);
      onClose();
    } catch (err) {
      setError(err.message ?? "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "var(--clubpm-surface-100)", borderRadius: 12, width: "min(480px, 94vw)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: "1px solid var(--clubpm-border)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid var(--clubpm-border)", background: "var(--clubpm-surface-200)" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--clubpm-text-primary)" }}>
            <i className="fas fa-plus" style={{ marginRight: 8, color: "var(--clubpm-accent-primary)" }} />
            New Task
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer",
            color: "var(--clubpm-text-muted)", fontSize: 16, padding: "2px 6px" }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Task Title *</label>
              <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                placeholder="What needs to be done?" style={inputStyle} required />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}>
                  {PRIORITY_LEVELS.map(p => (
                    <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  style={inputStyle} />
              </div>
            </div>
            {milestones.length > 0 && (
              <div>
                <label style={labelStyle}>Milestone</label>
                <select value={milestoneId} onChange={e => setMilestoneId(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">— None —</option>
                  {milestones.map(m => (
                    <option key={m.id} value={m.id}>
                      🎯 {m.title} ({(m.status ?? "ON_TRACK").replace("_", " ")})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {error && (
              <p style={{ fontSize: 12, color: "#e17055", background: "rgba(225,112,85,0.1)",
                borderRadius: 6, padding: "6px 10px", margin: 0 }}>{error}</p>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8,
            padding: "12px 20px", background: "var(--clubpm-surface-200)", borderTop: "1px solid var(--clubpm-border)" }}>
            <button type="button" onClick={onClose} style={{ padding: "7px 16px", borderRadius: 7,
              border: "1px solid var(--clubpm-border)", background: "none",
              color: "var(--clubpm-text-secondary)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: "7px 18px", borderRadius: 7,
              border: "none", cursor: "pointer", background: "var(--clubpm-accent-primary)",
              color: "#fff", fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Slack Channel Picker ─────────────────────────────────────

function SlackChannelPicker({ project, channels, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(project.slackChannelId ?? "");

  const handleChange = async (e) => {
    const channelId = e.target.value;
    setSelected(channelId);
    setSaving(true);
    try {
      const ch = channels.find(c => c.id === channelId);
      await patch(`/api/projects/${project.id}`, {
        slackChannelId:   channelId || null,
        slackChannelName: ch?.name  || null,
      });
      onSaved();
    } catch (err) {
      console.error("Failed to save linked channel", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <i className="fab fa-slack" style={{ fontSize: 12, color: "var(--clubpm-text-muted)" }} />
      <select
        value={selected}
        onChange={handleChange}
        disabled={saving}
        style={{
          fontSize: 11,
          padding: "3px 6px",
          borderRadius: 5,
          background: "var(--clubpm-surface-300)",
          border: "1px solid var(--clubpm-border)",
          color: selected ? "var(--clubpm-text-primary)" : "var(--clubpm-text-muted)",
          cursor: "pointer",
        }}
      >
        <option value="">— Link Slack channel —</option>
        {channels.map(ch => (
          <option key={ch.id} value={ch.id}>#{ch.name}</option>
        ))}
      </select>
      {saving && <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>Saving…</span>}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  // member used for auto-assign on IN_PROGRESS
  const { member } = useClubPmAuth();

  const [project, setProject] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [slackChannels, setSlackChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks");
  const [activeTask, setActiveTask] = useState(null);     // For DragOverlay
  const [selectedTask, setSelectedTask] = useState(null); // For TaskModal
  const [overBin, setOverBin] = useState(null);
  const [assigneePanelOpen] = useState(true); // reserved for future toggle UX
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskInitialStatus, setAddTaskInitialStatus] = useState("TODO");
  const navigate = useNavigate();
  const [expandedParents, setExpandedParents] = useState(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchProject = useCallback(() => {
    if (!id) return;
    get(`/api/projects/${id}`)
      .then(setProject)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    get("/api/projects")
      .then(setAllProjects)
      .catch(console.error);
  }, []);

  useEffect(() => {
    get("/api/slack/channels")
      .then(setSlackChannels)
      .catch(() => {});
  }, []);

  useEffect(() => {
    get("/api/members")
      .then(members => setAllMembers(members.map(m => ({ memberId: m.id, member: m }))))
      .catch(console.error);
  }, []);

  const taskIdFromParam = searchParams.get("task");
  useEffect(() => {
    if (!taskIdFromParam || !project) return;
    const found = project.tasks.find(t => t.id === taskIdFromParam);
    if (found && !selectedTask) setSelectedTask(found);
  }, [taskIdFromParam, project]);

  const handleDragStart = (event) => {
    const { active } = event;
    // Only treat task drags as active task drags (member chips have ids prefixed "member-")
    if (typeof active.id === "string" && active.id.startsWith("member-")) {
      setActiveTask(null);
      return;
    }
    const task = project?.tasks.find((t) => t.id === active.id);
    setActiveTask(task ?? null);
  };

  const handleDragOver = (event) => {
    const { over } = event;
    if (over && BINS.some((b) => b.id === over.id)) {
      setOverBin(over.id);
    } else {
      setOverBin(null);
    }
  };

  const handleDragEnd = async (event) => {
    setActiveTask(null);
    setOverBin(null);
    if (!canEdit) return;
    const { active, over } = event;
    if (!over || !project) return;

    const taskId = active.id;
    const newStatus = over.id;

    if (!BINS.some((b) => b.id === newStatus)) return;

    const task = project.tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Build patch body
    const patchBody = { status: newStatus };

    // Auto-assign current user when moving to IN_PROGRESS
    if (newStatus === "IN_PROGRESS" && member) {
      const alreadyAssigned = (task.assignees ?? []).some(a => a.id === member.id);
      if (!alreadyAssigned) {
        patchBody.assigneeIds = [...(task.assignees ?? []).map(a => a.id), member.id];
      }
    }

    const previousTasks = project.tasks;

    // Optimistic update
    setProject(prev => ({
      ...prev,
      tasks: prev.tasks.map(t =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              assignees: newStatus === "IN_PROGRESS" && member && !(t.assignees ?? []).some(a => a.id === member.id)
                ? [...(t.assignees ?? []), member]
                : t.assignees,
            }
          : t
      ),
    }));

    try {
      const updated = await patch(`/api/tasks/${taskId}`, patchBody);
      setProject(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, ...updated } : t),
      }));
    } catch {
      setProject(prev => ({ ...prev, tasks: previousTasks }));
    }
  };

  const handleProgressChange = async (taskId, newProgress) => {
    // Optimistic update
    setProject(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, progress: newProgress } : t)
    }));

    try {
      const patchBody = { progress: newProgress };
      if (newProgress === "IN_PROGRESS" && member) {
        const task = project.tasks.find(t => t.id === taskId);
        const alreadyAssigned = (task?.assignees ?? []).some(a => a.id === member.id);
        if (!alreadyAssigned) {
          patchBody.assigneeIds = [...(task?.assignees ?? []).map(a => a.id), member.id];
        }
      }
      const updated = await patch(`/api/tasks/${taskId}`, patchBody);
      setProject(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, ...updated } : t)
      }));
    } catch {
      fetchProject();
    }
  };

  const handleTaskUpdate = (updatedTask) => {
    setProject((p) =>
      p
        ? {
            ...p,
            tasks: p.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
          }
        : p
    );
    setSelectedTask(updatedTask);
  };

  const handleTaskDelete = (deletedTask) => {
    setProject(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== deletedTask.id),
    }));
    setSelectedTask(null);
  };

  const handleTaskCreated = (newTask) => {
    if (newTask.projectId === project?.id) {
      setProject(prev => ({
        ...prev,
        tasks: [...(prev.tasks ?? []), newTask],
      }));
    }
  };

  if (loading) {
    return (
      <div
        className="clubpm-app"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "2px solid var(--clubpm-accent-primary)",
            borderTopColor: "transparent",
            animation: "clubpm-spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="clubpm-app" style={{ minHeight: "100vh", padding: "48px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--clubpm-text-muted)", fontSize: 16 }}>Project not found</p>
        <Link
          to="/clubpm"
          style={{
            color: "var(--clubpm-accent-primary)",
            fontSize: 13,
            marginTop: 8,
            display: "inline-block",
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const subtasksByParent = new Map();
  project.tasks.forEach(t => {
    if (t.parentTaskId) {
      if (!subtasksByParent.has(t.parentTaskId)) subtasksByParent.set(t.parentTaskId, []);
      subtasksByParent.get(t.parentTaskId).push(t);
    }
  });

  const tasksByBin = BINS.map((b) => ({
    ...b,
    tasks: project.tasks.filter(
      (t) =>
        !t.parentTaskId && (
          t.status === b.id ||
          (b.id === "IN_PROGRESS" && t.status === "BLOCKED")
        )
    ),
  }));

  const canEdit =
    !project.slackChannelId ||
    (project.channelMemberSlackIds ?? []).includes(member?.slackId);

  return (
    <div className="clubpm-app">
    <div className="cpm-project-layout">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <ProjectSidebar
          project={project}
          allProjects={allProjects}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <main className="cpm-project-main">
          <header className="cpm-proj-main-header">
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--clubpm-text-primary)",
                  margin: 0,
                }}
              >
                {project.name}
              </h1>
              <span className={`clubpm-badge ${STATUS_BADGE[project.status] ?? ""}`}>
                {project.status}
              </span>
              <span className={`clubpm-badge clubpm-badge-${project.type.toLowerCase()}`}>
                {project.type}
              </span>
              <SlackChannelPicker
                project={project}
                channels={slackChannels}
                onSaved={fetchProject}
              />
              {project.slackChannelId && !canEdit && (
                <span style={{ fontSize: 11, color: "var(--clubpm-accent-yellow)", display: "flex", alignItems: "center", gap: 4 }}>
                  <i className="fas fa-lock" style={{ fontSize: 10 }} />
                  View only — join #{project.slackChannelName} to edit
                </span>
              )}
            </div>
            {activeTab === "tasks" && <ProgressBar tasks={project.tasks} />}
          </header>

          {activeTab === "tasks" && (
            <div className="cpm-proj-main-body" style={{ padding: "16px 0 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 12px" }}>
                {tasksByBin.map((bin) => (
                  <StatusBin
                    key={bin.id}
                    bin={bin}
                    tasks={bin.tasks}
                    subtasksByParent={subtasksByParent}
                    expandedParents={expandedParents}
                    onToggleParent={(parentId) => setExpandedParents(prev => {
                      const next = new Set(prev);
                      if (next.has(parentId)) next.delete(parentId);
                      else next.add(parentId);
                      return next;
                    })}
                    isOver={overBin === bin.id}
                    onTaskClick={setSelectedTask}
                    onAddTask={(status) => { setAddTaskInitialStatus(status); setShowAddTask(true); }}
                    canEdit={canEdit}
                  />
                ))}
              </div>

              <div style={{ padding: "24px 0 0" }}>
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--clubpm-text-secondary)",
                    padding: "0 12px 12px",
                    margin: 0,
                  }}
                >
                  Timeline
                </h3>
                <div
                  className="clubpm-glass-card"
                  style={{ margin: "0 12px 24px", overflow: "hidden" }}
                >
                  <GanttChart tasks={project.tasks} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "calendar" && (
            <div className="cpm-proj-main-body" style={{ padding: "24px" }}>
              <CalendarView tasks={project.tasks} onTaskClick={setSelectedTask} />
            </div>
          )}

          {activeTab === "milestones" && (
            <div className="cpm-proj-main-body" style={{ padding: "24px" }}>
              <MilestonePanel
                projectId={project.id}
                project={project}
                onRefresh={fetchProject}
              />
            </div>
          )}

          {activeTab === "activity" && (
            <div className="cpm-proj-main-body" style={{ padding: "24px" }}>
              <ProjectActivity projectId={project.id} />
            </div>
          )}

          {activeTab === "reports" && (
            <div className="cpm-proj-main-body" style={{ padding: "24px" }}>
              <ReportingView projectId={project.id} />
            </div>
          )}

          {activeTab === "updates" && (
            <div className="cpm-proj-main-body" style={{ padding: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
                {(!project.updates || project.updates.length === 0) ? (
                  <p style={{ color: "var(--clubpm-text-muted)", fontSize: 13 }}>
                    No updates yet
                  </p>
                ) : (
                  project.updates.map((update) => (
                    <div key={update.id} className="clubpm-glass-card" style={{ padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: "var(--clubpm-accent-primary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "white",
                          }}
                        >
                          U
                        </div>
                        <span style={{ fontSize: 11, color: "var(--clubpm-text-muted)" }}>
                          {new Date(update.postedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--clubpm-text-secondary)",
                          whiteSpace: "pre-wrap",
                          margin: 0,
                        }}
                      >
                        {update.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>

        {activeTab === "tasks" && assigneePanelOpen && (
          <AssigneePanel
            members={allMembers.length > 0 ? allMembers : (project.members || [])}
            channelMemberSlackIds={project.channelMemberSlackIds ?? []}
            hasLinkedChannel={!!project.slackChannelId}
            onAssign={async (memberId, taskId) => {
              try {
                const task = project.tasks.find((t) => t.id === taskId);
                if (!task) return;
                const existing = (task.assignees || []).map((a) => a.id);
                if (existing.includes(memberId)) return;
                const next = [...existing, memberId];
                await patch(`/api/tasks/${taskId}`, { assigneeIds: next });
                fetchProject();
              } catch (err) {
                console.error("Failed to assign member", err);
              }
            }}
          />
        )}

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div
              style={{
                opacity: 0.95,
                cursor: "grabbing",
                transform: "scale(1.02)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                background: "var(--clubpm-surface-200)",
                border: "1px solid var(--clubpm-border)",
                borderRadius: 6,
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                maxWidth: 480,
              }}
            >
              <PriorityBars priority={activeTask.priority} />
              <span
                style={{
                  fontSize: 13,
                  color: "var(--clubpm-text-primary)",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeTask.title}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          readOnly={!canEdit}
          onClose={() => {
            setSelectedTask(null);
            navigate(`/clubpm/projects/${id}`, { replace: true });
          }}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
          onTaskCreated={handleTaskCreated}
        />
      )}

      {showAddTask && project && canEdit && (
        <AddProjectTaskModal
          projectId={project.id}
          initialStatus={addTaskInitialStatus}
          projectMembers={(project.members ?? []).map(pm => pm.member ?? pm)}
          onClose={() => setShowAddTask(false)}
          onCreated={handleTaskCreated}
        />
      )}
    </div>
    </div>
  );
}
