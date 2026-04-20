import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { get, patch } from "../api/client";
import type { Project, Task, TaskStatus } from "../types";
import MemberBadge from "../components/MemberBadge";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Constants ────────────────────────────────────────────────

const COLUMNS: { id: TaskStatus; label: string; color: string; emoji: string }[] = [
  { id: "TODO", label: "To Do", color: "var(--color-text-secondary)", emoji: "📋" },
  { id: "IN_PROGRESS", label: "In Progress", color: "var(--color-accent-cyan)", emoji: "🔧" },
  { id: "BLOCKED", label: "Blocked", color: "var(--color-accent-red)", emoji: "🚫" },
  { id: "DONE", label: "Done", color: "var(--color-accent-green)", emoji: "✅" },
];

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "var(--color-accent-red)",
  HIGH: "var(--color-accent-orange)",
  MEDIUM: "var(--color-accent-orange)",
  LOW: "var(--color-accent-green)",
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "badge-active",
  PAUSED: "badge-paused",
  COMPLETED: "badge-completed",
  ARCHIVED: "badge-archived",
};

// ── Component ────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"tasks" | "members" | "updates">("tasks");
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchProject = useCallback(() => {
    if (!id) return;
    get<Project>(`/api/projects/${id}`)
      .then(setProject)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = project?.tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || !project) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent-primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 text-center">
        <p className="text-[var(--color-text-muted)] text-lg">Project not found</p>
        <Link to="/" className="text-[var(--color-accent-primary)] text-sm mt-2 inline-block">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const tasksByStatus = COLUMNS.map((col) => ({
    ...col,
    tasks: project.tasks.filter((t) => t.status === col.id),
  }));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors no-underline mb-3 inline-block"
        >
          ← Dashboard
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-[var(--color-text-secondary)] max-w-2xl mb-3">
                {project.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${STATUS_BADGE[project.status] ?? ""}`}>
                {project.status}
              </span>
              <span className={`badge badge-${project.type.toLowerCase()}`}>
                {project.type}
              </span>
              {project.slackChannel && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  📌 Slack channel linked
                </span>
              )}
            </div>
          </div>
          <Link
            to={`/projects/${project.id}/gantt`}
            className="btn-primary text-sm no-underline"
          >
            📊 Gantt View
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)] mb-6">
        {(["tasks", "members", "updates"] as const).map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "tasks" && `Tasks (${project.tasks.length})`}
            {tab === "members" && `Members (${project.members.length})`}
            {tab === "updates" && `Updates (${project.updates?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "tasks" && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tasksByStatus.map((column) => (
              <KanbanColumn key={column.id} column={column} />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <KanbanCard task={activeTask} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {activeTab === "members" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {project.members.map((pm) => (
            <div key={pm.memberId} className="glass-card p-4 text-center">
              <MemberBadge member={pm.member} size="lg" />
              <p className="text-sm font-medium text-[var(--color-text-primary)] mt-2">
                {pm.member.displayName}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {pm.projectRole}
              </p>
            </div>
          ))}
        </div>
      )}

      {activeTab === "updates" && (
        <div className="space-y-4 max-w-2xl">
          {(!project.updates || project.updates.length === 0) ? (
            <p className="text-[var(--color-text-muted)] text-sm">No updates yet</p>
          ) : (
            project.updates.map((update) => (
              <div key={update.id} className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-accent-primary)] flex items-center justify-center text-xs font-bold">
                    U
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {new Date(update.postedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
                  {update.content}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Kanban Column ────────────────────────────────────────────

interface ColumnData {
  id: TaskStatus;
  label: string;
  color: string;
  emoji: string;
  tasks: Task[];
}

function KanbanColumn({ column }: { column: ColumnData }) {
  const { setNodeRef } = useSortable({ id: column.id });

  return (
    <div ref={setNodeRef} className="kanban-column">
      <div className="kanban-column-header flex items-center gap-2" style={{ color: column.color }}>
        <span>{column.emoji}</span>
        <span>{column.label}</span>
        <span className="ml-auto text-[var(--color-text-muted)] font-normal">
          {column.tasks.length}
        </span>
      </div>
      <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {column.tasks.map((task) => (
          <SortableKanbanCard key={task.id} task={task} />
        ))}
      </SortableContext>
      {column.tasks.length === 0 && (
        <div className="text-center py-8 text-xs text-[var(--color-text-muted)]">
          Drop tasks here
        </div>
      )}
    </div>
  );
}

// ── Sortable Kanban Card ─────────────────────────────────────

function SortableKanbanCard({ task }: { task: Task }) {
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
      className={`kanban-card ${isDragging ? "dragging" : ""}`}
    >
      <KanbanCard task={task} />
    </div>
  );
}

// ── Kanban Card Content ──────────────────────────────────────

function KanbanCard({ task, isDragOverlay }: { task: Task; isDragOverlay?: boolean }) {
  const dueStr = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE";

  return (
    <div className={isDragOverlay ? "kanban-card" : ""}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug">
          {task.title}
        </p>
        <div
          className="w-2 h-2 rounded-full shrink-0 mt-1.5"
          style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
          title={task.priority}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        {task.assignee ? (
          <MemberBadge member={task.assignee} size="sm" />
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">Unassigned</span>
        )}
        {dueStr && (
          <span
            className={`text-xs ${isOverdue ? "text-[var(--color-accent-red)]" : "text-[var(--color-text-muted)]"}`}
          >
            {isOverdue ? "⚠ " : ""}
            {dueStr}
          </span>
        )}
      </div>
    </div>
  );
}
