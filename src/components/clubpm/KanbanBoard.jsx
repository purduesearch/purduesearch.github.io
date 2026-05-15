import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { format, isPast, isWithinInterval, addDays } from 'date-fns';
import toast from 'react-hot-toast';

const COLUMNS = [
  { id: 'TODO',        label: 'Not Started', color: 'var(--pm-text-secondary)' },
  { id: 'IN_PROGRESS', label: 'In Progress',  color: 'var(--pm-accent-amber)' },
  { id: 'BLOCKED',     label: 'Blocked',      color: 'var(--pm-accent-coral)' },
  { id: 'DONE',        label: 'Done',         color: 'var(--pm-accent-teal)' },
];

const STATUS_LABELS = {
  TODO:        'To Do',
  IN_PROGRESS: 'In Progress',
  BLOCKED:     'Blocked',
  DONE:        'Done',
};

const PRIORITY_DOT = {
  CRITICAL: 'var(--pm-accent-coral)',
  HIGH:     'var(--pm-accent-amber)',
  MEDIUM:   'var(--pm-accent-teal)',
  LOW:      'var(--pm-text-muted)',
};

function getDueDateStyle(dueDate) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const now = new Date();
  if (isPast(d)) return { color: 'var(--pm-accent-coral)', label: 'Overdue' };
  if (isWithinInterval(d, { start: now, end: addDays(now, 3) }))
    return { color: 'var(--pm-accent-amber)', label: format(d, 'MMM d') };
  return { color: 'var(--pm-text-muted)', label: format(d, 'MMM d') };
}

function KanbanCard({ task, index, onClick }) {
  const dotColor = PRIORITY_DOT[task.priority] ?? 'var(--pm-text-muted)';
  const dueInfo = getDueDateStyle(task.dueDate);
  const assignees = task.assignees ?? [];
  const subtaskTotal = task.subtaskCount ?? 0;
  const subtaskDone  = task.completedSubtaskCount ?? 0;
  const subtaskPct   = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`pm-kanban-card${snapshot.isDragging ? ' dragging' : ''}`}
          onClick={() => onClick(task)}
        >
          {/* Priority dot + title */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span className="pm-kanban-priority-dot" style={{ background: dotColor }} />
            <span className="pm-kanban-card-title">{task.title}</span>
          </div>

          {/* Due date + assignees */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            {dueInfo ? (
              <span className="pm-kanban-due" style={{ color: dueInfo.color }}>{dueInfo.label}</span>
            ) : <span />}
            <div className="pm-kanban-avatars">
              {assignees.slice(0, 3).map((a, i) => (
                a.avatarUrl
                  ? <img key={a.id} src={a.avatarUrl} alt="" className="pm-kanban-avatar" style={{ zIndex: 3 - i }} />
                  : <div key={a.id} className="pm-kanban-avatar pm-kanban-avatar-initials" style={{ zIndex: 3 - i }}>
                      {(a.displayName ?? '?').slice(0, 2).toUpperCase()}
                    </div>
              ))}
            </div>
          </div>

          {/* Subtask bar */}
          {subtaskTotal > 0 && (
            <div className="pm-kanban-subtask-bar-wrap" title={`${subtaskDone}/${subtaskTotal} subtasks`}>
              <div className="pm-kanban-subtask-bar" style={{ width: `${subtaskPct}%` }} />
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

export default function KanbanBoard({ tasks = [], onStatusChange, onTaskClick }) {
  const [columns, setColumns] = useState({});

  useEffect(() => {
    const cols = {};
    COLUMNS.forEach(c => { cols[c.id] = tasks.filter(t => t.status === c.id && !t.parentTaskId); });
    setColumns(cols);
  }, [tasks]);

  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (destination.droppableId !== source.droppableId) {
      // Optimistic update
      setColumns(prev => {
        const next = { ...prev };
        const srcList = [...(prev[source.droppableId] ?? [])];
        const dstList = [...(prev[destination.droppableId] ?? [])];
        const [moved] = srcList.splice(source.index, 1);
        dstList.splice(destination.index, 0, { ...moved, status: destination.droppableId });
        next[source.droppableId] = srcList;
        next[destination.droppableId] = dstList;
        return next;
      });
      onStatusChange?.(draggableId, destination.droppableId);
      toast.success(`Task moved to ${STATUS_LABELS[destination.droppableId] ?? destination.droppableId}`);
    } else {
      // Reorder within column
      setColumns(prev => {
        const list = [...(prev[source.droppableId] ?? [])];
        const [moved] = list.splice(source.index, 1);
        list.splice(destination.index, 0, moved);
        return { ...prev, [source.droppableId]: list };
      });
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="pm-kanban-board">
        {COLUMNS.map(col => (
          <div key={col.id} className="pm-kanban-col">
            <div className="pm-kanban-col-header">
              <span className="pm-kanban-col-dot" style={{ background: col.color }} />
              <span className="pm-kanban-col-label" style={{ color: col.color }}>{col.label}</span>
              <span className="pm-kanban-col-count">{(columns[col.id] ?? []).length}</span>
            </div>
            <Droppable droppableId={col.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`pm-kanban-col-body${snapshot.isDraggingOver ? ' drag-over' : ''}`}
                >
                  {(columns[col.id] ?? []).map((task, index) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      index={index}
                      onClick={onTaskClick ?? (() => {})}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
