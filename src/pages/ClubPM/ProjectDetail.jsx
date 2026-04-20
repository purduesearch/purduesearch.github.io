import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { get, patch } from '../../api/clubPmClient';
import MemberBadge from '../../components/clubpm/MemberBadge';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const COLUMNS = [
  { id: 'TODO', label: 'To Do', color: 'var(--color-text-secondary)', emoji: '📋' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'var(--color-accent-cyan)', emoji: '🔧' },
  { id: 'BLOCKED', label: 'Blocked', color: 'var(--color-accent-red)', emoji: '🚫' },
  { id: 'DONE', label: 'Done', color: 'var(--color-accent-green)', emoji: '✅' },
];

const PRIORITY_COLORS = {
  CRITICAL: 'var(--color-accent-red)',
  HIGH: 'var(--color-accent-orange)',
  MEDIUM: 'var(--color-accent-orange)',
  LOW: 'var(--color-accent-green)',
};

const STATUS_BADGE = {
  ACTIVE: 'cpm-badge-active',
  PAUSED: 'cpm-badge-paused',
  COMPLETED: 'cpm-badge-completed',
  ARCHIVED: 'cpm-badge-archived',
};

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tasks');
  const [activeTask, setActiveTask] = useState(null);

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

  const handleDragEnd = async (event) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || !project) return;

    const taskId = active.id;
    const newStatus = over.id;

    if (COLUMNS.some((col) => col.id === newStatus)) {
      const task = project.tasks.find((t) => t.id === taskId);
      if (task && task.status !== newStatus) {
        setProject({
          ...project,
          tasks: project.tasks.map((t) =>
            t.id === taskId ? { ...t, status: newStatus } : t
          ),
        });
        try {
          await patch(`/api/tasks/${taskId}`, { status: newStatus });
        } catch {
          fetchProject();
        }
      }
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="cpm-spinner" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="cpm-container" style={{ paddingTop: '3rem', paddingBottom: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '1.125rem' }}>Project not found</p>
        <Link to="/clubpm" style={{ color: 'var(--color-accent-primary)', fontSize: '0.875rem', marginTop: '0.5rem', display: 'inline-block', textDecoration: 'none' }}>
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
    <div className="cpm-container cpm-animate-fade-in" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/clubpm" style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: '0.75rem', display: 'inline-block', transition: 'color 0.2s' }}>
          ← Dashboard
        </Link>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
              {project.name}
            </h1>
            {project.description && (
              <p style={{ color: 'var(--color-text-secondary)', maxWidth: '42rem', marginBottom: '0.75rem' }}>
                {project.description}
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`cpm-badge ${STATUS_BADGE[project.status] ?? ''}`}>
                {project.status}
              </span>
              <span className={`cpm-badge cpm-badge-${project.type.toLowerCase()}`}>
                {project.type}
              </span>
              {project.slackChannel && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  📌 Slack channel linked
                </span>
              )}
            </div>
          </div>
          <Link to={`/clubpm/projects/${project.id}/gantt`} className="cpm-btn-primary" style={{ fontSize: '0.875rem' }}>
            📊 Gantt View
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        {['tasks', 'members', 'updates'].map((tab) => (
          <button
            key={tab}
            className={`cpm-tab-btn${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'tasks' && `Tasks (${project.tasks.length})`}
            {tab === 'members' && `Members (${project.members.length})`}
            {tab === 'updates' && `Updates (${project.updates?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'tasks' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="cpm-kanban-grid">
            {tasksByStatus.map((column) => (
              <KanbanColumn key={column.id} column={column} />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <KanbanCard task={activeTask} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {activeTab === 'members' && (
        <div className="cpm-members-grid">
          {project.members.map((pm) => (
            <div key={pm.memberId} className="cpm-glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
              <MemberBadge member={pm.member} size="lg" />
              <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)', marginTop: '0.5rem' }}>
                {pm.member.displayName}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {pm.projectRole}
              </p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'updates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '42rem' }}>
          {(!project.updates || project.updates.length === 0) ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No updates yet</p>
          ) : (
            project.updates.map((update) => (
              <div key={update.id} className="cpm-glass-card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div style={{
                    width: '1.5rem', height: '1.5rem', borderRadius: '50%',
                    background: 'var(--color-accent-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, color: 'white',
                  }}>
                    U
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {new Date(update.postedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
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

function KanbanColumn({ column }) {
  const { setNodeRef } = useSortable({ id: column.id });

  return (
    <div ref={setNodeRef} className="cpm-kanban-column">
      <div className="cpm-kanban-column-header" style={{ color: column.color }}>
        <span>{column.emoji}</span>
        <span>{column.label}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
          {column.tasks.length}
        </span>
      </div>
      <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {column.tasks.map((task) => (
          <SortableKanbanCard key={task.id} task={task} />
        ))}
      </SortableContext>
      {column.tasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Drop tasks here
        </div>
      )}
    </div>
  );
}

function SortableKanbanCard({ task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cpm-kanban-card${isDragging ? ' dragging' : ''}`}
    >
      <KanbanCard task={task} />
    </div>
  );
}

function KanbanCard({ task, isDragOverlay }) {
  const dueStr = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';

  return (
    <div className={isDragOverlay ? 'cpm-kanban-card' : ''}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.375 }}>
          {task.title}
        </p>
        <div
          style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', flexShrink: 0, marginTop: '0.375rem', backgroundColor: PRIORITY_COLORS[task.priority] }}
          title={task.priority}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
        {task.assignee ? (
          <MemberBadge member={task.assignee} size="sm" />
        ) : (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Unassigned</span>
        )}
        {dueStr && (
          <span style={{ fontSize: '0.75rem', color: isOverdue ? 'var(--color-accent-red)' : 'var(--color-text-muted)' }}>
            {isOverdue ? '⚠ ' : ''}{dueStr}
          </span>
        )}
      </div>
    </div>
  );
}
