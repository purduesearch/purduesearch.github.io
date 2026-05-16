import React, { useState, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { createPortal } from "react-dom";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { get, post, patch, del } from "../../api/clubPmClient";
import MemberBadge from "../../components/clubpm/MemberBadge";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import { useProjectNav } from "../../clubpm/ProjectNavContext";
import TaskModal from "../../components/clubpm/TaskModal";
import CalendarView from "../../components/clubpm/CalendarView";
import ProjectActivity from "../../components/clubpm/ProjectActivity";
import ActivityFeed from "../../components/clubpm/ActivityFeed";
import ReportingView from "../../components/clubpm/ReportingView";
import ProjectAnalytics from "../../components/clubpm/ProjectAnalytics";
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
  { id: "BLOCKED",     label: "Blocked",     color: "var(--clubpm-accent-red, #e17055)" },
  { id: "DONE",        label: "Completed",   color: "var(--clubpm-accent-green)" },
];

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const NAV_TABS = [
  { id: "tasks",      label: "Tasks",      icon: "📋" },
  { id: "calendar",   label: "Calendar",   icon: "📅" },
  { id: "milestones", label: "Milestones", icon: "🎯" },
  { id: "activity",   label: "Activity",   icon: "📜" },
  { id: "reports",    label: "Reports",    icon: "📊" },
  { id: "updates",    label: "Updates",    icon: "📝" },
  { id: "ai",         label: "AI",         icon: "🤖" },
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
  const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const todo = Math.max(total - done - blocked - inProgress, 0);
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
          style={{ width: `${(blocked / total) * 100}%`, background: "var(--clubpm-accent-red, #e17055)" }}
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
        {blocked > 0 && <span style={{ color: "var(--clubpm-accent-red, #e17055)" }}>■ {blocked}</span>}
        <span style={{ color: "var(--clubpm-text-muted)" }}>■ {todo}</span>
      </span>
    </div>
  );
}

// ── Status Bin (collapsible droppable section) ───────────────

function StatusBin({ bin, tasks, subtasksByParent, expandedParents, onToggleParent, isOver, overTaskId, onTaskClick, onAddTask, canEdit = true }) {
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
                      isDropTarget={overTaskId === task.id}
                    />
                    {isExpanded && subs.map((sub) => (
                      <KanbanSubtaskRow key={sub.id} subtask={sub} onClick={onTaskClick} isDropTarget={overTaskId === sub.id} />
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

function CompactTaskRow({ task, onClick, subtaskCount = 0, isExpanded = false, onToggleExpand, isDropTarget = false }) {
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
      {...listeners}
      className={`cpm-task-row-compact${isDropTarget ? " cpm-task-row-compact--member-target" : ""}`}
      onClick={() => {
        if (!isDragging) onClick(task);
      }}
    >
      <i
        className="fas fa-grip-vertical"
        style={{
          color: "var(--clubpm-text-muted)",
          fontSize: 11,
          flexShrink: 0,
          pointerEvents: "none",
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

function KanbanSubtaskRow({ subtask, onClick, isDropTarget = false }) {
  const { setNodeRef } = useDroppable({ id: subtask.id });
  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      <div style={{ width: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4 }}>
        <div style={{ width: 1, height: "100%", background: "var(--clubpm-border)", position: "relative" }}>
          <div style={{ position: "absolute", bottom: "50%", left: 0, width: 16, height: 1, background: "var(--clubpm-border)" }} />
        </div>
      </div>
    <div
      ref={setNodeRef}
      className={`cpm-task-row-compact${isDropTarget ? " cpm-task-row-compact--member-target" : ""}`}
      style={{ flex: 1, paddingLeft: 8, cursor: "pointer" }}
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
          <div style={{ display: "flex", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--clubpm-border)" }}>
            <DraggableSpecialChip
              id="special-everyone"
              label="Everyone"
              iconClass="fas fa-users"
              accentColor="var(--clubpm-accent-primary)"
            />
            <DraggableSpecialChip
              id="special-nobody"
              label="Nobody"
              iconClass="fas fa-ban"
              accentColor="var(--pm-accent-coral)"
            />
          </div>
          <input
            type="text"
            className="cpm-assignee-search"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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

function ChipAvatar({ member }) {
  const initials = (member?.displayName ?? "?")
    .split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return member?.avatarUrl ? (
    <img
      src={member.avatarUrl}
      alt={member.displayName}
      style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }}
    />
  ) : (
    <div
      style={{
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700,
        color: "white", background: "linear-gradient(135deg, var(--clubpm-accent-primary), var(--clubpm-accent-pink))",
      }}
    >
      {initials}
    </div>
  );
}

function DraggableSpecialChip({ id, label, iconClass, accentColor }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: "special", specialId: id },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cpm-assignee-chip"
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderColor: accentColor,
        background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
      }}
    >
      <i className={iconClass} style={{ fontSize: 11, color: accentColor, flexShrink: 0 }} aria-hidden="true" />
      <span className="cpm-assignee-chip-name" style={{ color: accentColor }}>{label}</span>
    </div>
  );
}

function DraggableMemberChip({ pm }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${pm.memberId}`,
    data: { type: "member", memberId: pm.memberId },
  });

  const isAdmin = pm.member?.isAdmin || pm.isAdmin;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cpm-assignee-chip"
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderColor: isAdmin ? "#f9ca24" : undefined,
      }}
    >
      <ChipAvatar member={pm.member} />
      <span className="cpm-assignee-chip-name">
        {pm.member.displayName}
        {isAdmin && " 👑"}
      </span>
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
  const [tags, setTags]               = useState([]);
  const [projectTags, setProjectTags] = useState([]);
  const [newTagName, setNewTagName]   = useState("");
  const [newTagColor, setNewTagColor] = useState("#6c5ce7");
  const [creatingTag, setCreatingTag] = useState(false);

  useEffect(() => {
    get(`/api/milestones/project/${projectId}`)
      .then(ms => setMilestones(
        ms.filter(m => m.status !== "COMPLETED" && m.status !== "CANCELLED")
      ))
      .catch(() => {});
    get(`/api/projects/${projectId}/tags`).then(setProjectTags).catch(() => {});
  }, [projectId]);

  function addTag(tag) {
    if (!tag) return;
    setTags(prev => {
      if (prev.length >= 5 || prev.some(t => t.id === tag.id)) return prev;
      return [...prev, tag];
    });
  }
  function removeTag(tagId) {
    setTags(prev => prev.filter(t => t.id !== tagId));
  }
  async function createTag() {
    if (!newTagName.trim() || creatingTag) return;
    setCreatingTag(true);
    try {
      const tag = await post(`/api/projects/${projectId}/tags`, { name: newTagName.trim(), color: newTagColor });
      setProjectTags(prev => [...prev, tag]);
      addTag(tag);
      setNewTagName("");
    } catch (err) {
      console.error("Failed to create tag:", err);
    } finally { setCreatingTag(false); }
  }

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
        tagIds: tags.map(t => t.id),
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
            <div>
              <label style={labelStyle}>
                Tags {tags.length > 0 && (
                  <span style={{ color: "var(--clubpm-text-muted)", fontWeight: 400, textTransform: "none" }}>({tags.length}/5)</span>
                )}
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
                {tags.map(tag => (
                  <span key={tag.id} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 8px", borderRadius: 10, fontSize: 11,
                    background: tag.color + "22", border: `1px solid ${tag.color}`, color: tag.color,
                  }}>
                    {tag.name}
                    <button type="button" onClick={() => removeTag(tag.id)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: tag.color, fontSize: 12, padding: 0, lineHeight: 1,
                    }}>×</button>
                  </span>
                ))}
              </div>
              {tags.length < 5 && (
                <>
                  {projectTags.filter(pt => !tags.some(t => t.id === pt.id)).length > 0 && (
                    <select
                      value=""
                      onChange={e => { const t = projectTags.find(x => x.id === e.target.value); if (t) addTag(t); }}
                      style={{ ...inputStyle, cursor: "pointer", marginBottom: 6 }}
                    >
                      <option value="">+ Add existing tag</option>
                      {projectTags.filter(pt => !tags.some(t => t.id === pt.id))
                        .map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                    </select>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="text" placeholder="New tag name" value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && createTag()}
                      style={{ ...inputStyle, flex: 1 }} />
                    <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
                      style={{ width: 38, padding: 2, borderRadius: 6, cursor: "pointer",
                        border: "1px solid var(--clubpm-border)", background: "transparent" }} />
                    <button type="button" onClick={createTag} disabled={!newTagName.trim() || creatingTag}
                      style={{ padding: "7px 14px", borderRadius: 7, border: "none",
                        background: "var(--clubpm-accent-primary)", color: "#fff", fontSize: 13,
                        cursor: newTagName.trim() && !creatingTag ? "pointer" : "default",
                        opacity: newTagName.trim() && !creatingTag ? 1 : 0.5 }}>
                      {creatingTag ? "…" : "Create"}
                    </button>
                  </div>
                </>
              )}
              {tags.length >= 5 && (
                <span style={{ fontSize: 11, color: "var(--clubpm-text-muted)" }}>Max 5 tags</span>
              )}
            </div>
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

// ── Suggested Task Card ───────────────────────────────────────

const SUGGESTED_PRIORITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function SuggestedTaskCard({ task, projectId, onAccepted, onDismiss }) {
  const [title, setTitle] = useState(task.title ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.split("T")[0] : "");
  const [saving, setSaving] = useState(false);

  const fieldStyle = {
    width: "100%", padding: "6px 8px", borderRadius: 5, fontSize: 12,
    background: "var(--clubpm-surface-200)", border: "1px solid var(--clubpm-border)",
    color: "var(--clubpm-text-primary)", outline: "none", boxSizing: "border-box",
  };

  async function handleAccept() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await post(`/api/projects/${projectId}/parse-drive/confirm`, {
        tasks: [{
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          dueDate: dueDate || undefined,
          suggestedAssigneeName: task.suggestedAssigneeName ?? task.assigneeName ?? undefined,
        }],
      });
      onAccepted();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  return (
    <div style={{
      background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
      borderRadius: 8, padding: 12, marginBottom: 10,
    }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Task title"
          style={{ ...fieldStyle, flex: 1, fontWeight: 600 }}
        />
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer",
            color: "var(--clubpm-text-muted)", fontSize: 18, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
          title="Dismiss suggestion"
        >×</button>
      </div>
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        style={{ ...fieldStyle, resize: "vertical", marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select value={priority} onChange={e => setPriority(e.target.value)}
          style={{ ...fieldStyle, flex: 1, cursor: "pointer" }}>
          {SUGGESTED_PRIORITY_LEVELS.map(p => (
            <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          style={{ ...fieldStyle, flex: 1 }} />
      </div>
      {(task.suggestedAssigneeName || task.assigneeName) && (
        <div style={{ fontSize: 11, color: "var(--clubpm-text-muted)", marginBottom: 8 }}>
          Suggested assignee: {task.suggestedAssigneeName ?? task.assigneeName}
        </div>
      )}
      <button
        onClick={handleAccept}
        disabled={saving || !title.trim()}
        className="clubpm-btn-primary"
        style={{ fontSize: 12, padding: "5px 14px", opacity: !title.trim() ? 0.6 : 1 }}
      >
        {saving ? "Adding…" : "Accept"}
      </button>
    </div>
  );
}

// ── AI Panel ─────────────────────────────────────────────────

function AiPanel({ project }) {
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState(null);
  const [qaLoading, setQaLoading] = useState(false);

  const [driveUrl, setDriveUrl] = useState(project.driveLink ?? "");
  const [driveLoading, setDriveLoading] = useState(false);
  const [drivePreview, setDrivePreview] = useState(null);
  const [driveError, setDriveError] = useState(null);
  const [driveSuggestedCount, setDriveSuggestedCount] = useState(5);

  const [meetingNotes, setMeetingNotes] = useState("");
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingPreview, setMeetingPreview] = useState(null);
  const [meetingExpanded, setMeetingExpanded] = useState(false);
  const [meetingSuggestedCount, setMeetingSuggestedCount] = useState(5);

  const [riskData, setRiskData] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const [sprintData, setSprintData] = useState(null);
  const [sprintLoading, setSprintLoading] = useState(false);

  const [capacityData, setCapacityData] = useState(null);
  const [capacityLoading, setCapacityLoading] = useState(false);

  async function handleQa(e) {
    e.preventDefault();
    if (!qaQuestion.trim()) return;
    setQaLoading(true);
    setQaAnswer(null);
    try {
      const data = await post(`/api/projects/${project.id}/ask`, { question: qaQuestion });
      setQaAnswer(data.answer);
    } catch (err) { setQaAnswer("❌ Failed to get answer."); }
    finally { setQaLoading(false); }
  }

  async function handleParseDrive() {
    if (!driveUrl.trim()) return;
    setDriveLoading(true);
    setDrivePreview(null);
    setDriveError(null);
    try {
      const data = await post(`/api/projects/${project.id}/parse-drive`, {
        driveUrl,
        suggestedTaskCount: driveSuggestedCount,
      });
      setDrivePreview(data);
    } catch (err) {
      setDriveError(err.message ?? "Failed to parse Drive file");
    } finally { setDriveLoading(false); }
  }

  async function handleParseMeeting() {
    if (!meetingNotes.trim()) return;
    setMeetingLoading(true);
    setMeetingPreview(null);
    try {
      const data = await post(`/api/projects/${project.id}/parse-meeting-notes`, {
        notes: meetingNotes,
        suggestedTaskCount: meetingSuggestedCount,
      });
      setMeetingPreview(data);
    } catch (err) { console.error(err); }
    finally { setMeetingLoading(false); }
  }

  const cardStyle = {
    background: "var(--clubpm-surface-200)",
    border: "1px solid var(--clubpm-border)",
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
  };

  const inputStyle = {
    width: "100%",
    background: "var(--clubpm-surface-300)",
    border: "1px solid var(--clubpm-border)",
    borderRadius: 6,
    color: "var(--clubpm-text-primary)",
    fontSize: 13,
    padding: "8px 10px",
    boxSizing: "border-box",
  };

  const sectionLabelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--clubpm-text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 8,
  };

  const countInputStyle = {
    width: 64, padding: "6px 8px", borderRadius: 5, fontSize: 12, textAlign: "center",
    background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
    color: "var(--clubpm-text-primary)", outline: "none",
  };

  return (
    <div className="cpm-proj-main-body" style={{ padding: "24px", maxWidth: 780 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--clubpm-text-primary)", marginBottom: 20 }}>
        🤖 AI Assistant
      </h3>

      {/* Section 1: Project Q&A */}
      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Project Assistant</div>
        <form onSubmit={handleQa} style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={qaQuestion}
            onChange={e => setQaQuestion(e.target.value)}
            placeholder='Ask anything: "Who is working on auth?" or "What are we behind on?"'
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="submit" disabled={qaLoading || !qaQuestion.trim()} className="clubpm-btn-primary"
            style={{ fontSize: 13, padding: "7px 16px", whiteSpace: "nowrap" }}>
            {qaLoading ? "…" : "Ask"}
          </button>
        </form>
        {qaAnswer && (
          <div style={{ marginTop: 12, padding: 12, background: "var(--clubpm-surface-300)", borderRadius: 8,
                        fontSize: 13, color: "var(--clubpm-text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {qaAnswer}
          </div>
        )}
      </div>

      {/* Section 2: Document Intelligence */}
      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Document Intelligence</div>

        {/* Drive parsing */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clubpm-text-primary)", marginBottom: 8 }}>
            Parse Drive Document
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={driveUrl}
              onChange={e => setDriveUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: "var(--clubpm-text-muted)", whiteSpace: "nowrap" }}>
              Suggested tasks:
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={driveSuggestedCount}
              onChange={e => setDriveSuggestedCount(Math.max(1, parseInt(e.target.value) || 1))}
              style={countInputStyle}
            />
            <button
              onClick={handleParseDrive}
              disabled={driveLoading || !driveUrl.trim()}
              className="clubpm-btn-primary"
              style={{ fontSize: 13, padding: "7px 16px", whiteSpace: "nowrap" }}
            >
              {driveLoading ? "Parsing…" : "Parse"}
            </button>
          </div>
          {driveError && (
            <p style={{ fontSize: 12, color: "#e17055", background: "rgba(225,112,85,0.1)", borderRadius: 6, padding: "6px 10px", marginTop: 8 }}>
              {driveError}
            </p>
          )}
          {drivePreview?.tasks?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginBottom: 10 }}>
                Found {drivePreview.tasks.length} suggested task(s) from <strong>{drivePreview.sourceFileName}</strong>. Edit and accept each one:
              </div>
              {drivePreview.tasks.map((task, i) => (
                <SuggestedTaskCard
                  key={i}
                  task={task}
                  projectId={project.id}
                  onAccepted={() => setDrivePreview(prev => ({
                    ...prev,
                    tasks: prev.tasks.filter((_, idx) => idx !== i),
                  }))}
                  onDismiss={() => setDrivePreview(prev => ({
                    ...prev,
                    tasks: prev.tasks.filter((_, idx) => idx !== i),
                  }))}
                />
              ))}
              {drivePreview.tasks.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)" }}>All suggestions handled.</div>
              )}
            </div>
          )}
        </div>

        {/* Meeting notes (collapsible) */}
        <div>
          <button onClick={() => setMeetingExpanded(p => !p)}
            style={{ background: "none", border: "none", fontSize: 13, fontWeight: 600,
                     color: "var(--clubpm-accent-primary)", cursor: "pointer", padding: 0 }}>
            {meetingExpanded ? "▼" : "▶"} Paste Meeting Notes
          </button>
          {meetingExpanded && (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={meetingNotes}
                onChange={e => setMeetingNotes(e.target.value)}
                placeholder="Paste meeting notes here…"
                rows={6}
                style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: "var(--clubpm-text-muted)", whiteSpace: "nowrap" }}>
                  Suggested tasks:
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={meetingSuggestedCount}
                  onChange={e => setMeetingSuggestedCount(Math.max(1, parseInt(e.target.value) || 1))}
                  style={countInputStyle}
                />
                <button
                  onClick={handleParseMeeting}
                  disabled={meetingLoading || !meetingNotes.trim()}
                  className="clubpm-btn-primary"
                  style={{ fontSize: 13, padding: "7px 16px", whiteSpace: "nowrap" }}
                >
                  {meetingLoading ? "Parsing…" : "Extract Action Items"}
                </button>
              </div>
              {meetingPreview?.tasks?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {meetingPreview.summary && (
                    <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--clubpm-text-muted)", marginBottom: 10 }}>
                      {meetingPreview.summary}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginBottom: 10 }}>
                    {meetingPreview.tasks.length} suggested task(s). Edit and accept each one:
                  </div>
                  {meetingPreview.tasks.map((task, i) => (
                    <SuggestedTaskCard
                      key={i}
                      task={task}
                      projectId={project.id}
                      onAccepted={() => setMeetingPreview(prev => ({
                        ...prev,
                        tasks: prev.tasks.filter((_, idx) => idx !== i),
                      }))}
                      onDismiss={() => setMeetingPreview(prev => ({
                        ...prev,
                        tasks: prev.tasks.filter((_, idx) => idx !== i),
                      }))}
                    />
                  ))}
                  {meetingPreview.tasks.length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)" }}>All suggestions handled.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Section 3: AI Insights Dashboard */}
      <div style={sectionLabelStyle}>AI Insights</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        {/* Risk Card */}
        <div style={{ ...cardStyle, flex: "1 1 220px", marginBottom: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--clubpm-text-primary)" }}>🔴 Risk Analysis</div>
          {riskData ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: riskData.overallRisk === "CRITICAL" ? "#e17055" : riskData.overallRisk === "HIGH" ? "#fdcb6e" : riskData.overallRisk === "MEDIUM" ? "#74b9ff" : "#55efc4" }}>
                {riskData.overallRisk} — {riskData.riskScore}/100
              </div>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginTop: 4 }}>{riskData.topRecommendation}</div>
              {riskData.risks?.slice(0, 3).map((r, i) => (
                <div key={i} style={{ fontSize: 11, marginTop: 6, color: "var(--clubpm-text-secondary)" }}>• {r.description}</div>
              ))}
            </div>
          ) : (
            <button onClick={async () => { setRiskLoading(true); try { const d = await post(`/api/projects/${project.id}/ai-risks`, {}); setRiskData(d); } catch (e) { console.error(e); } finally { setRiskLoading(false); } }}
              disabled={riskLoading} className="clubpm-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}>
              {riskLoading ? "Analyzing…" : "Run Risk Analysis"}
            </button>
          )}
        </div>

        {/* Sprint Plan Card */}
        <div style={{ ...cardStyle, flex: "1 1 220px", marginBottom: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--clubpm-text-primary)" }}>🏃 Sprint Plan</div>
          {sprintData ? (
            <div>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginBottom: 6 }}>{sprintData.focusTheme}</div>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-secondary)" }}>{sprintData.totalPoints} pts • {sprintData.sprintTasks?.length ?? 0} tasks</div>
              {sprintData.risksInPlan?.length > 0 && (
                <div style={{ fontSize: 11, color: "#fdcb6e", marginTop: 4 }}>⚠️ {sprintData.risksInPlan[0]}</div>
              )}
            </div>
          ) : (
            <button onClick={async () => { setSprintLoading(true); try { const d = await post(`/api/projects/${project.id}/sprint-plan`, {}); setSprintData(d); } catch (e) { console.error(e); } finally { setSprintLoading(false); } }}
              disabled={sprintLoading} className="clubpm-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}>
              {sprintLoading ? "Planning…" : "Generate Sprint Plan"}
            </button>
          )}
        </div>

        {/* Capacity Card */}
        <div style={{ ...cardStyle, flex: "1 1 220px", marginBottom: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--clubpm-text-primary)" }}>⚖️ Capacity</div>
          {capacityData ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: capacityData.balanceScore >= 75 ? "#55efc4" : capacityData.balanceScore >= 50 ? "#fdcb6e" : "#e17055" }}>
                Balance: {capacityData.balanceScore}/100
              </div>
              <div style={{ fontSize: 12, color: "var(--clubpm-text-muted)", marginTop: 4 }}>{capacityData.summary}</div>
              {capacityData.overloaded?.slice(0, 2).map((o, i) => (
                <div key={i} style={{ fontSize: 11, color: "#e17055", marginTop: 4 }}>⚠️ {o.member}</div>
              ))}
            </div>
          ) : (
            <button onClick={async () => { setCapacityLoading(true); try { const d = await post(`/api/projects/${project.id}/capacity-analysis`, {}); setCapacityData(d); } catch (e) { console.error(e); } finally { setCapacityLoading(false); } }}
              disabled={capacityLoading} className="clubpm-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}>
              {capacityLoading ? "Analyzing…" : "Analyze Capacity"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { member } = useClubPmAuth();
  const { setProjectNav, clearProjectNav } = useProjectNav();

  const [project, setProject] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [slackChannels, setSlackChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks");
  const [activeTask, setActiveTask] = useState(null);     // For DragOverlay
  const [selectedTask, setSelectedTask] = useState(null); // For TaskModal
  const [overBin, setOverBin] = useState(null);
  const [overTaskId, setOverTaskId] = useState(null);
  const [activeMember, setActiveMember] = useState(null);
  const [assigneePanelOpen] = useState(true); // reserved for future toggle UX
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskInitialStatus, setAddTaskInitialStatus] = useState("TODO");
  const navigate = useNavigate();
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [sortBy, setSortBy] = useState("priority");
  const [newUpdateContent, setNewUpdateContent] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [pinned, setPinned] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('pm-starred-projects') || '[]');
      return stored.includes(id);
    } catch { return false; }
  });
  const [viewMode, setViewMode] = useState("list");

  const tasksByBin = useMemo(() => {
    if (!project) return BINS.map(b => ({ ...b, tasks: [] }));
    const sorted = (arr) => [...arr].sort((a, b) => {
      if (sortBy === "priority") return (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
      if (sortBy === "dueDate")  return (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity);
      if (sortBy === "status")   return (a.status ?? "").localeCompare(b.status ?? "");
      if (sortBy === "created")  return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === "title")    return a.title.localeCompare(b.title);
      return 0;
    });
    return BINS.map((b) => ({
      ...b,
      tasks: sorted(project.tasks.filter(
        (t) => !t.parentTaskId && t.status === b.id
      )),
    }));
  }, [project, sortBy]);

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

  // Auto-expand all parent tasks that have subtasks by default
  useEffect(() => {
    if (!project) return;
    setExpandedParents(prev => {
      const next = new Set(prev);
      project.tasks.forEach(t => {
        if (t.subtasks && t.subtasks.length > 0) next.add(t.id);
      });
      return next;
    });
  }, [project?.id]);

  useEffect(() => {
    if (!project) return;
    setProjectNav({
      projectName: project.name,
      tabs: NAV_TABS,
      activeTab,
      onTabChange: setActiveTab,
    });
  }, [project?.name, activeTab, setProjectNav]);

  useEffect(() => {
    return () => clearProjectNav();
  }, [clearProjectNav]);

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
    if (typeof active.id === "string" && (active.id.startsWith("member-") || active.id === "special-everyone" || active.id === "special-nobody")) {
      setActiveTask(null);
      if (active.id.startsWith("member-")) {
        const memberId = active.data.current?.memberId;
        const pm = allMembers.find(m => m.memberId === memberId);
        setActiveMember(pm ?? null);
      } else {
        // Use a synthetic pm object for the overlay
        setActiveMember({ memberId: active.id, member: { displayName: active.id === "special-everyone" ? "Everyone" : "Nobody" } });
      }
      return;
    }
    setActiveMember(null);
    const task = project?.tasks.find((t) => t.id === active.id);
    setActiveTask(task ?? null);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (over && BINS.some((b) => b.id === over.id)) {
      setOverBin(over.id);
    } else {
      setOverBin(null);
    }
    const isMemberDrag = typeof active?.id === "string" && (active.id.startsWith("member-") || active.id === "special-everyone" || active.id === "special-nobody");
    if (isMemberDrag) {
      const overId = over?.id;
      const isTopLevel = overId && project?.tasks.some(t => t.id === overId);
      const isSubtask = !isTopLevel && overId && project?.tasks.some(t => (t.subtasks ?? []).some(s => s.id === overId));
      setOverTaskId(isTopLevel || isSubtask ? overId : null);
    } else {
      setOverTaskId(null);
    }
  };

  const handleDragEnd = async (event) => {
    setActiveTask(null);
    setActiveMember(null);
    setOverBin(null);
    setOverTaskId(null);
    if (!canEdit) return;
    const { active, over } = event;
    if (!over || !project) return;

    // Helper: find a task by ID across top-level tasks and their embedded subtasks
    const findTask = (id) => {
      const top = project.tasks.find(t => t.id === id);
      if (top) return { task: top, parentTask: null };
      for (const t of project.tasks) {
        const sub = (t.subtasks ?? []).find(s => s.id === id);
        if (sub) return { task: sub, parentTask: t };
      }
      return null;
    };

    // Helper: apply optimistic assignee update to state (handles subtasks)
    const applyAssigneeUpdate = (taskId, parentTaskId, newAssignees) => {
      setProject(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => {
          if (parentTaskId) {
            if (t.id !== parentTaskId) return t;
            return { ...t, subtasks: (t.subtasks ?? []).map(s => s.id === taskId ? { ...s, assignees: newAssignees } : s) };
          }
          return t.id === taskId ? { ...t, assignees: newAssignees } : t;
        }),
      }));
    };

    // Special chips: Everyone or Nobody
    if (active.id === "special-everyone" || active.id === "special-nobody") {
      const found = findTask(over.id);
      if (!found) return;
      const { task, parentTask } = found;
      const everyone = active.id === "special-everyone";
      const memberIds = everyone ? allMembers.map(m => m.memberId) : [];
      const memberObjs = everyone ? allMembers.map(m => m.member).filter(Boolean) : [];
      applyAssigneeUpdate(task.id, parentTask?.id ?? null, memberObjs);
      try {
        const updated = await patch(`/api/tasks/${task.id}`, { assigneeIds: memberIds });
        applyAssigneeUpdate(task.id, parentTask?.id ?? null, updated.assignees ?? memberObjs);
      } catch {
        fetchProject();
      }
      return;
    }

    // Member chip dropped onto a task row → assign member
    if (typeof active.id === "string" && active.id.startsWith("member-")) {
      const memberId = active.data.current?.memberId;
      if (!memberId) return;
      const found = findTask(over.id);
      if (!found) return;
      const { task, parentTask } = found;
      const alreadyAssigned = (task.assignees ?? []).some(a => a.id === memberId);
      if (alreadyAssigned) return;
      const memberObj = allMembers.find(m => m.memberId === memberId)?.member;
      const newAssigneeIds = [...(task.assignees ?? []).map(a => a.id), memberId];
      if (memberObj) {
        applyAssigneeUpdate(task.id, parentTask?.id ?? null, [...(task.assignees ?? []), memberObj]);
      }
      try {
        const updated = await patch(`/api/tasks/${task.id}`, { assigneeIds: newAssigneeIds });
        applyAssigneeUpdate(task.id, parentTask?.id ?? null, updated.assignees ?? []);
      } catch {
        fetchProject();
      }
      return;
    }

    const taskId = active.id;
    const newStatus = over.id;

    if (!BINS.some((b) => b.id === newStatus)) return;

    const task = project.tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    if (newStatus === "DONE") {
      const openBlockers = (task.blockedBy ?? []).filter(d => d.blockingTask?.status !== "DONE");
      if (openBlockers.length > 0) {
        const names = openBlockers.map(d => d.blockingTask.title).join(", ");
        alert(`Cannot complete "${task.title}" — the following blockers are not done yet:\n\n${names}`);
        return;
      }
    }

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
    } catch (err) {
      setProject(prev => ({ ...prev, tasks: previousTasks }));
      if (err?.message) alert(err.message);
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

  // Build subtask map from embedded subtasks (project fetches top-level only, subtasks are nested)
  const subtasksByParent = new Map();
  project.tasks.forEach(t => {
    if (t.subtasks && t.subtasks.length > 0) {
      subtasksByParent.set(t.id, t.subtasks);
    }
  });

  const HEALTH_COLOR_MAP = {
    ACTIVE: 'var(--pm-accent-teal)',
    PAUSED: 'var(--pm-accent-amber)',
    COMPLETED: 'var(--pm-accent-violet)',
    ARCHIVED: 'var(--pm-text-muted)',
  };
  const healthColor = HEALTH_COLOR_MAP[project.status] ?? 'var(--pm-text-muted)';

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
        <main className="cpm-project-main">
          <header className="pm-proj-hero">
            {/* Breadcrumb */}
            <div className="pm-proj-breadcrumb">
              <Link to="/clubpm" style={{ color: 'var(--pm-text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>
                Dashboard
              </Link>
              <span style={{ color: 'var(--pm-text-muted)', margin: '0 6px', fontSize: '0.8rem' }}>›</span>
              <span style={{ color: 'var(--pm-text-secondary)', fontSize: '0.8rem' }}>{project.name}</span>
            </div>

            {/* Hero row */}
            <div className="pm-proj-hero-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="pm-proj-title">{project.name}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="pm-proj-health-chip" style={{ color: healthColor, borderColor: `${healthColor}40`, background: `${healthColor}12` }}>
                    {project.status}
                  </span>
                  <span className="pm-proj-type-chip">{project.type}</span>
                  <SlackChannelPicker project={project} channels={slackChannels} onSaved={fetchProject} />
                  {project.slackChannelId && !canEdit && (
                    <span style={{ fontSize: 11, color: 'var(--pm-accent-amber)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="fas fa-lock" style={{ fontSize: 10 }} /> View only
                    </span>
                  )}
                </div>
              </div>
              <button
                className={`pm-pin-btn${pinned ? ' active' : ''}`}
                onClick={() => setPinned(p => {
                  const next = !p;
                  try {
                    const stored = JSON.parse(localStorage.getItem('pm-starred-projects') || '[]');
                    const updated = next
                      ? [...stored.filter(x => x !== id), id]
                      : stored.filter(x => x !== id);
                    localStorage.setItem('pm-starred-projects', JSON.stringify(updated));
                    window.dispatchEvent(new Event('pm-stars-changed'));
                  } catch {}
                  return next;
                })}
                title={pinned ? 'Unpin project' : 'Pin project'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
            </div>

            {/* Progress bar */}
            <ProgressBar tasks={project.tasks} />
          </header>

          {activeTab === "tasks" && (
            <div className="cpm-proj-main-body" style={{ padding: "16px 0 24px" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 12px 8px" }}>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6,
                           background: 'var(--pm-bg-overlay)', border: '1px solid var(--pm-border)',
                           color: 'var(--pm-text-secondary)', cursor: 'pointer' }}
                >
                  <option value="priority">Sort: Priority</option>
                  <option value="dueDate">Sort: Due Date</option>
                  <option value="status">Sort: Status</option>
                  <option value="created">Sort: Created</option>
                  <option value="title">Sort: Title</option>
                </select>
              </div>
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
                    overTaskId={overTaskId}
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
                  <GanttChart tasks={project.tasks} milestones={project.milestones ?? []} />
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
              <ProjectAnalytics project={project} />
            </div>
          )}

          {activeTab === "updates" && (
            <div className="cpm-proj-main-body" style={{ padding: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
                {canEdit && (
                  <div className="clubpm-glass-card" style={{ padding: 16, marginBottom: 0 }}>
                    <textarea
                      value={newUpdateContent}
                      onChange={e => setNewUpdateContent(e.target.value)}
                      placeholder="Post a project update… (Markdown supported)"
                      rows={3}
                      style={{ width: "100%", background: "var(--clubpm-surface-300)",
                               border: "1px solid var(--clubpm-border)", borderRadius: 6,
                               color: "var(--clubpm-text-primary)", fontSize: 13,
                               padding: "8px 10px", resize: "vertical", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        disabled={!newUpdateContent.trim() || postingUpdate}
                        onClick={async () => {
                          setPostingUpdate(true);
                          try {
                            const update = await post(`/api/projects/${id}/updates`, { content: newUpdateContent.trim() });
                            setProject(prev => ({ ...prev, updates: [update, ...(prev.updates ?? [])] }));
                            setNewUpdateContent("");
                          } catch (err) { console.error(err); }
                          finally { setPostingUpdate(false); }
                        }}
                        className="clubpm-btn-primary"
                        style={{ fontSize: 13, padding: "6px 16px" }}
                      >
                        {postingUpdate ? "Posting…" : "Post Update"}
                      </button>
                    </div>
                  </div>
                )}
                {(!project.updates || project.updates.length === 0) ? (
                  <p style={{ color: "var(--clubpm-text-muted)", fontSize: 13 }}>
                    No updates yet
                  </p>
                ) : (
                  project.updates.map((update) => {
                    const initials = (update.author?.displayName ?? "?")
                      .split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <div key={update.id} className="clubpm-glass-card" style={{ padding: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div
                            style={{
                              width: 24, height: 24, borderRadius: "50%",
                              background: "var(--clubpm-accent-primary)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--clubpm-text-secondary)" }}>
                            {update.author?.displayName ?? "Unknown"}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--clubpm-text-muted)" }}>
                            {new Date(update.postedAt).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--clubpm-text-secondary)" }}
                             className="clubpm-markdown">
                          <ReactMarkdown>{update.content}</ReactMarkdown>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          {activeTab === "ai" && (
            <AiPanel project={project} />
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
          ) : activeMember ? (
            <div className="cpm-assignee-chip" style={{ cursor: "grabbing", boxShadow: "0 8px 32px rgba(0,0,0,0.45)", opacity: 0.95 }}>
              <ChipAvatar member={activeMember.member} />
              <span className="cpm-assignee-chip-name">{activeMember.member?.displayName}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
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
