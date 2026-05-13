import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { get, patch } from "../../api/clubPmClient";
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
  { id: "IN_PROGRESS", label: "In Progress", color: "var(--clubpm-accent-cyan)" },
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
          style={{ width: `${(inProgress / total) * 100}%`, background: "var(--clubpm-accent-cyan)" }}
        />
        <div
          className="cpm-progress-bar-segment"
          style={{ width: `${(todo / total) * 100}%`, background: "var(--clubpm-surface-400)" }}
        />
      </div>
      <span className="cpm-proj-progress-pct">{pct}%</span>
      <span className="cpm-proj-progress-stats">
        <span style={{ color: "var(--clubpm-accent-green)" }}>■ {done}</span>
        <span style={{ color: "var(--clubpm-accent-cyan)" }}>■ {inProgress}</span>
        <span style={{ color: "var(--clubpm-text-muted)" }}>■ {todo}</span>
      </span>
    </div>
  );
}

// ── Status Bin (collapsible droppable section) ───────────────

function StatusBin({ bin, tasks, isOver, onTaskClick }) {
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
          onClick={(e) => e.stopPropagation()}
        >
          <i className="fas fa-plus" /> Add Task
        </button>
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
              tasks.map((task) => (
                <CompactTaskRow key={task.id} task={task} onClick={onTaskClick} />
              ))
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// ── Compact Task Row ─────────────────────────────────────────

function CompactTaskRow({ task, onClick }) {
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
      className="cpm-task-row-compact"
      onClick={() => {
        if (!isDragging) onClick(task);
      }}
    >
      <i
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

// ── Assignee Panel (right column) ────────────────────────────

function AssigneePanel({ members, onAssign }) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((pm) =>
      (pm.member?.displayName ?? "").toLowerCase().includes(q)
    );
  }, [members, search]);

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

// ── Main Component ───────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams();
  // Auth context retained for potential future use; not actively used after rewrite
  useClubPmAuth();

  const [project, setProject] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks");
  const [activeTask, setActiveTask] = useState(null);     // For DragOverlay
  const [selectedTask, setSelectedTask] = useState(null); // For TaskModal
  const [overBin, setOverBin] = useState(null);
  const [assigneePanelOpen] = useState(true); // reserved for future toggle UX

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
    const { active, over } = event;
    if (!over || !project) return;

    // Member-chip drags are not yet wired up — ignore (see report).
    if (typeof active.id === "string" && active.id.startsWith("member-")) {
      return;
    }

    const taskId = active.id;
    const newStatus = over.id;

    if (BINS.some((b) => b.id === newStatus)) {
      const task = project.tasks.find((t) => t.id === taskId);
      if (task && task.status !== newStatus) {
        // Optimistic update
        setProject({
          ...project,
          tasks: project.tasks.map((t) =>
            t.id === taskId ? { ...t, status: newStatus } : t
          ),
        });

        try {
          const progress =
            newStatus === "DONE"
              ? "COMPLETED"
              : newStatus === "IN_PROGRESS"
              ? "IN_PROGRESS"
              : "NO_PROGRESS";
          await patch(`/api/tasks/${taskId}`, { status: newStatus, progress });
        } catch {
          fetchProject(); // Revert on error
        }
      }
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

  const tasksByBin = BINS.map((b) => ({
    ...b,
    tasks: project.tasks.filter(
      (t) =>
        t.status === b.id ||
        (b.id === "IN_PROGRESS" && t.status === "BLOCKED")
    ),
  }));

  return (
    <div className="clubpm-app cpm-project-layout">
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
              {project.slackChannel && (
                <span style={{ fontSize: 11, color: "var(--clubpm-text-muted)" }}>
                  📌 Slack channel linked
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
                    isOver={overBin === bin.id}
                    onTaskClick={setSelectedTask}
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
              <MilestonePanel projectId={project.id} onRefresh={fetchProject} />
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
            members={project.members || []}
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
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
        />
      )}
    </div>
  );
}
