import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { format, isPast, isWithinInterval, addDays } from 'date-fns';
import toast from 'react-hot-toast';
import { animate, spring, pulseGlow, prefersReducedMotion, revealStagger } from '../../clubpm/anim/motion';
import { burstAt } from './celebrate/confetti';
import useStreakWatcher from '../../hooks/useStreakWatcher';

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

// Lightweight summary of GitHub links attached to a task — used by the Kanban
// card to render a compact PR/issue pill. Picks the most "active" PR (open >
// merged > closed) when several are linked.
function summarizeGhLinks(links) {
  if (!Array.isArray(links) || links.length === 0) return null;
  const prs = links.filter(l => l.kind === 'PR');
  const issues = links.filter(l => l.kind === 'ISSUE');
  const branches = links.filter(l => l.kind === 'BRANCH');
  let pr = null;
  if (prs.length) {
    const rank = { open: 0, draft: 1, merged: 2, closed: 3 };
    pr = [...prs].sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9))[0];
  }
  return { pr, issueCount: issues.length, branchCount: branches.length };
}

function prPillStyle(state) {
  if (state === 'merged') return { icon: 'fa-code-merge', color: 'var(--cpm-gh-merged, #8957e5)' };
  if (state === 'closed') return { icon: 'fa-circle-xmark', color: 'var(--cpm-gh-bad, #cf222e)' };
  if (state === 'draft')  return { icon: 'fa-pen-ruler',   color: 'var(--pm-text-muted)' };
  return { icon: 'fa-code-pull-request', color: 'var(--cpm-gh-ok, #1f883d)' };
}

function KanbanCard({ task, index, onClick }) {
  const dotColor = PRIORITY_DOT[task.priority] ?? 'var(--pm-text-muted)';
  const dueInfo = getDueDateStyle(task.dueDate);
  const assignees = task.assignees ?? [];
  const subtaskTotal = task.subtaskCount ?? 0;
  const subtaskDone  = task.completedSubtaskCount ?? 0;
  const subtaskPct   = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;
  const gh = summarizeGhLinks(task.githubLinks);

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

          {/* GitHub adornment row */}
          {gh && (gh.pr || gh.issueCount > 0 || gh.branchCount > 0) && (
            <div className="pm-kanban-gh-row">
              {gh.pr && (() => {
                const s = prPillStyle(gh.pr.state);
                return (
                  <span className="pm-kanban-gh-pill" style={{ color: s.color }} title={`PR #${gh.pr.refNumber} ${gh.pr.state}`}>
                    <i className={`fas ${s.icon}`} aria-hidden="true" /> #{gh.pr.refNumber}
                  </span>
                );
              })()}
              {gh.issueCount > 0 && (
                <span className="pm-kanban-gh-pill" title={`${gh.issueCount} linked issue${gh.issueCount === 1 ? '' : 's'}`}>
                  <i className="fas fa-circle-dot" aria-hidden="true" /> {gh.issueCount}
                </span>
              )}
              {gh.branchCount > 0 && (
                <span className="pm-kanban-gh-pill" title={`${gh.branchCount} linked branch${gh.branchCount === 1 ? '' : 'es'}`}>
                  <i className="fas fa-code-branch" aria-hidden="true" /> {gh.branchCount}
                </span>
              )}
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

  const notifyStreak = useStreakWatcher();
  const boardRef = useRef(null);

  // Stagger the columns in once on first mount with cards. Subsequent
  // re-renders skip it so this isn't disorienting on every state change.
  const didRevealRef = useRef(false);
  useEffect(() => {
    if (didRevealRef.current) return;
    if (!boardRef.current) return;
    const cols = boardRef.current.querySelectorAll('.pm-kanban-col');
    if (cols.length === 0) return;
    didRevealRef.current = true;
    revealStagger(cols, { delay: 60, duration: 480, fromY: 8 });
  }, [columns]);

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

      // Trigger streak re-check on any forward move (backend determines whether it counts).
      notifyStreak();

      // Pulse the destination column header on any cross-column move.
      {
        const colEl = boardRef.current?.querySelector(`[data-kanban-col="${destination.droppableId}"]`);
        if (colEl) pulseGlow(colEl, 'rgba(45,212,191,0.5)');
      }

      // Settle-bounce on every drop, small amplitude for non-DONE columns and
      // the existing bigger spring + confetti for DONE.
      if (destination.droppableId !== 'DONE') {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const card = boardRef.current?.querySelector(`[data-rfd-draggable-id="${draggableId}"]`);
          if (card && !prefersReducedMotion()) {
            animate(card, {
              scale: [1.02, 0.99, 1],
              duration: 360,
              ease: spring,
            });
          }
        }));
      }
      if (destination.droppableId === 'DONE') {
        // Defer past React reconciliation. The card unmounts from the source
        // column and remounts in DONE; we need the new node, not the stale one.
        const fire = () => {
          const card =
            boardRef.current?.querySelector(`[data-rfd-draggable-id="${draggableId}"]`) ||
            document.querySelector(`[data-rfd-draggable-id="${draggableId}"]`);
          // Fallback: aim at the DONE column header so the burst still happens
          // even if the card lookup races with React's re-render.
          const anchor =
            card ||
            boardRef.current?.querySelector('[data-rfd-droppable-id="DONE"]') ||
            document.querySelector('[data-rfd-droppable-id="DONE"]');
          if (!anchor) {
            console.warn('[KanbanBoard] DONE celebration: no anchor element');
            return;
          }
          if (card && !prefersReducedMotion()) {
            animate(card, {
              scale: [1.05, 0.96, 1],
              duration: 520,
              ease: spring,
            });
          }
          burstAt(anchor, { palette: 'taskComplete' });
        };
        // Two rAFs ≈ wait one paint past the React commit, by which point the
        // card has been mounted at its new DOM position.
        requestAnimationFrame(() => requestAnimationFrame(fire));
      }
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
      <div className="pm-kanban-board" ref={boardRef}>
        {COLUMNS.map(col => (
          <div key={col.id} className="pm-kanban-col" data-kanban-col={col.id}>
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
