import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { get, patch } from "../../api/clubPmClient";
import MemberBadge from "../../components/clubpm/MemberBadge";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import TaskModal from "../../components/clubpm/TaskModal";
import CalendarView from "../../components/clubpm/CalendarView";
import ProjectActivity from "../../components/clubpm/ProjectActivity";
import ReportingView from "../../components/clubpm/ReportingView";
import MilestonePanel from "../../components/clubpm/MilestonePanel";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// ── Constants ────────────────────────────────────────────────

const COLUMNS = [
  { id: "TODO", label: "To Do", color: "var(--clubpm-text-secondary)", emoji: "📋" },
  { id: "IN_PROGRESS", label: "In Progress", color: "var(--clubpm-accent-cyan)", emoji: "🔧" },
  { id: "BLOCKED", label: "Blocked", color: "var(--clubpm-accent-red)", emoji: "🚫" },
  { id: "DONE", label: "Done", color: "var(--clubpm-accent-green)", emoji: "✅" },
];

const PRIORITY_BADGES = {
  CRITICAL: { label: "CRIT", class: "bg-red-500/10 text-red-400 border-red-500/20" },
  HIGH: { label: "HIGH", class: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  MEDIUM: { label: "MED", class: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  LOW: { label: "LOW", class: "bg-green-500/10 text-green-400 border-green-500/20" },
};

const STATUS_BADGE = {
  ACTIVE: "clubpm-badge-active",
  PAUSED: "clubpm-badge-paused",
  COMPLETED: "clubpm-badge-completed",
  ARCHIVED: "clubpm-badge-archived",
};

// ── Component ────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams();
  const { member, setMember } = useClubPmAuth();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks");
  const [activeTask, setActiveTask] = useState(null); // For Drag Overlay
  const [selectedTask, setSelectedTask] = useState(null); // For Task Modal
  const [overColumn, setOverColumn] = useState(null); // For column highlight

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

  const handleDragStart = (event) => {
    const task = project?.tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  };

  const handleDragOver = (event) => {
    const { over } = event;
    if (over && COLUMNS.some((col) => col.id === over.id)) {
      setOverColumn(over.id);
    } else {
      setOverColumn(null);
    }
  };

  const handleDragEnd = async (event) => {
    setActiveTask(null);
    setOverColumn(null);
    const { active, over } = event;
    if (!over || !project) return;

    const taskId = active.id;
    const newStatus = over.id;

    // Check if dropped on a column
    if (COLUMNS.some((col) => col.id === newStatus)) {
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
          await patch(`/api/tasks/${taskId}`, { status: newStatus });
        } catch {
          fetchProject(); // Revert on error
        }
      }
    }
  };

  const handleTaskUpdate = (updatedTask) => {
    setProject({
      ...project,
      tasks: project.tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
    });
    setSelectedTask(updatedTask);
  };

  if (loading) {
    return (
      <div className="clubpm-app flex items-center justify-center min-h-[60vh] bg-[var(--clubpm-surface-50)]">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--clubpm-accent-primary)] border-t-transparent clubpm-animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="clubpm-app min-h-screen bg-[var(--clubpm-surface-50)]">
        <div className="max-w-7xl mx-auto px-6 py-12 text-center">
          <p className="text-[var(--clubpm-text-muted)] text-lg">Project not found</p>
          <Link to="/clubpm" className="text-[var(--clubpm-accent-primary)] text-sm mt-2 inline-block">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const orderPref = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
  
  const tasksByStatus = orderPref.map((colId) => {
    const colDef = COLUMNS.find(c => c.id === colId) || COLUMNS.find(c => c.id === "TODO");
    return {
      ...colDef,
      tasks: project.tasks.filter((t) => t.status === colId),
    };
  });

  return (
    <div className="clubpm-app min-h-screen bg-[var(--clubpm-surface-50)]">
      <div className="w-full px-8 py-8 clubpm-animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/clubpm"
            className="text-sm text-[var(--clubpm-text-muted)] hover:text-[var(--clubpm-text-primary)] transition-colors no-underline mb-3 inline-block"
          >
            ← Dashboard
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[var(--clubpm-text-primary)] mb-2">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-[var(--clubpm-text-secondary)] max-w-2xl mb-3">
                  {project.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`clubpm-badge ${STATUS_BADGE[project.status] ?? ""}`}>
                  {project.status}
                </span>
                <span className={`clubpm-badge clubpm-badge-${project.type.toLowerCase()}`}>
                  {project.type}
                </span>
                {project.slackChannel && (
                  <span className="text-xs text-[var(--clubpm-text-muted)]">
                    📌 Slack channel linked
                  </span>
                )}
              </div>
            </div>
            <Link
              to={`/clubpm/projects/${project.id}/gantt`}
              className="clubpm-btn-primary text-sm no-underline"
            >
              📊 Gantt View
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--clubpm-border)] mb-6 overflow-x-auto">
          {["tasks", "calendar", "milestones", "activity", "reports", "members", "updates"].map((tab) => (
            <button
              key={tab}
              className={`clubpm-tab-btn whitespace-nowrap ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "tasks" && `📋 Tasks (${project.tasks.length})`}
              {tab === "calendar" && "📅 Calendar"}
              {tab === "milestones" && "🎯 Milestones"}
              {tab === "activity" && "📜 Activity"}
              {tab === "reports" && "📊 Reports"}
              {tab === "members" && `👥 Members (${project.members.length})`}
              {tab === "updates" && `📝 Updates (${project.updates?.length ?? 0})`}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "tasks" && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tasksByStatus.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  onTaskClick={setSelectedTask}
                  isOver={overColumn === column.id}
                />
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeTask ? (
                <div style={{ opacity: 0.95, cursor: "grabbing", transform: "scale(1.02)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
                  <KanbanCard task={activeTask} isDragOverlay />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {activeTab === "calendar" && (
          <CalendarView tasks={project.tasks} onTaskClick={setSelectedTask} />
        )}

        {activeTab === "milestones" && (
          <MilestonePanel projectId={project.id} onRefresh={fetchProject} />
        )}

        {activeTab === "activity" && (
          <ProjectActivity projectId={project.id} />
        )}

        {activeTab === "reports" && (
          <ReportingView projectId={project.id} />
        )}

        {activeTab === "members" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {project.members.map((pm) => (
              <div key={pm.memberId} className="clubpm-glass-card p-4 text-center">
                <MemberBadge member={pm.member} size="lg" />
                <p className="text-sm font-medium text-[var(--clubpm-text-primary)] mt-2">
                  {pm.member.displayName}
                </p>
                <p className="text-xs text-[var(--clubpm-text-muted)]">
                  {pm.projectRole}
                </p>
              </div>
            ))}
          </div>
        )}

        {activeTab === "updates" && (
          <div className="space-y-4 max-w-2xl">
            {(!project.updates || project.updates.length === 0) ? (
              <p className="text-[var(--clubpm-text-muted)] text-sm">No updates yet</p>
            ) : (
              project.updates.map((update) => (
                <div key={update.id} className="clubpm-glass-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-[var(--clubpm-accent-primary)] flex items-center justify-center text-xs font-bold text-white">
                      U
                    </div>
                    <span className="text-xs text-[var(--clubpm-text-muted)]">
                      {new Date(update.postedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--clubpm-text-secondary)] whitespace-pre-wrap">
                    {update.content}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Task Modal */}
        {selectedTask && (
          <TaskModal 
            task={selectedTask} 
            onClose={() => setSelectedTask(null)} 
            onUpdate={handleTaskUpdate} 
          />
        )}
      </div>
    </div>
  );
}

// ── Kanban Column ────────────────────────────────────────────

function KanbanColumn({ column, onTaskClick, isOver }) {
  const { setNodeRef } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`clubpm-kanban-column transition-all duration-200 ${isOver ? "drag-over" : ""}`}
    >
      <div className="clubpm-kanban-column-header flex items-center gap-2" style={{ color: column.color }}>
        <span>{column.emoji}</span>
        <span>{column.label}</span>
        <span className="ml-auto text-[var(--clubpm-text-muted)] font-normal">
          {column.tasks.length}
        </span>
      </div>
      <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {column.tasks.map((task) => (
          <SortableKanbanCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
      </SortableContext>
      {column.tasks.length === 0 && (
        <div className="text-center py-8 text-xs text-[var(--clubpm-text-muted)]">
          Drop tasks here
        </div>
      )}
    </div>
  );
}

// ── Sortable Kanban Card ─────────────────────────────────────

function SortableKanbanCard({ task, onClick }) {
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
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerUp={(e) => {
        // Fallback for dnd-kit pointer sensor swallowing clicks
        if (!isDragging && !e.cancelBubble) {
          onClick();
        }
      }}
      onClick={() => { if (!isDragging) onClick(); }}
      className={`clubpm-kanban-card ${isDragging ? "dragging" : ""} cursor-pointer`}
    >
      <KanbanCard task={task} />
    </div>
  );
}

// ── Kanban Card Content ──────────────────────────────────────

function KanbanCard({ task, isDragOverlay }) {
  const dueStr = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE";
  const pBadge = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.MEDIUM;

  return (
    <div className={isDragOverlay ? "clubpm-kanban-card" : ""}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-[var(--clubpm-text-primary)] leading-snug">
          {task.title}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-3">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${pBadge.class}`}>
          {pBadge.label}
        </span>
        {task.tags && task.tags.map((tag, idx) => (
          <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--clubpm-surface-400)] text-[var(--clubpm-text-secondary)] border border-[var(--clubpm-border)]">
            #{tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between mt-auto">
        {task.assignees && task.assignees.length > 0 ? (
          <div className="flex -space-x-2 overflow-hidden">
            {task.assignees.slice(0, 3).map(a => (
              <div key={a.id} className="inline-block rounded-full ring-2 ring-[var(--clubpm-surface-100)]">
                <MemberBadge member={a} size="sm" />
              </div>
            ))}
            {task.assignees.length > 3 && (
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--clubpm-surface-300)] text-[10px] font-medium text-[var(--clubpm-text-secondary)] ring-2 ring-[var(--clubpm-surface-100)] z-10">
                +{task.assignees.length - 3}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-[var(--clubpm-text-muted)]">Unassigned</span>
        )}
        {dueStr && (
          <span
            className={`text-xs ${isOverdue ? "text-red-400 font-medium" : "text-[var(--clubpm-text-muted)]"}`}
          >
            {isOverdue ? "⚠ " : "📅 "}
            {dueStr}
          </span>
        )}
      </div>
    </div>
  );
}
