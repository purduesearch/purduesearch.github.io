import React, { useState, useEffect, useRef, useCallback } from 'react';
import { get, post, patch } from '../../api/clubPmClient';
import { formatDistanceToNow } from 'date-fns';

const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];
const STATUS_LABELS  = { TODO: 'Todo', IN_PROGRESS: 'In Progress', BLOCKED: 'Blocked', DONE: 'Done' };
const PRIORITY_OPTIONS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const PRIORITY_LABELS  = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const PRIORITY_COLORS  = { CRITICAL: 'var(--pm-accent-coral)', HIGH: 'var(--pm-accent-amber)', MEDIUM: 'var(--pm-accent-teal)', LOW: 'var(--pm-text-muted)' };

function RelativeTime({ dateStr }) {
  if (!dateStr) return null;
  try {
    return <span>{formatDistanceToNow(new Date(dateStr), { addSuffix: true })}</span>;
  } catch {
    return null;
  }
}

export default function TaskDetailModal({ task, projectMembers = [], onClose, onUpdate }) {
  const [localTask, setLocalTask] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [activities, setActivities] = useState([]);
  const [showAssigneeDD, setShowAssigneeDD] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    if (task) {
      setLocalTask(task);
      setTitleDraft(task.title ?? '');
      setDescDraft(task.description ?? '');
      setActivities([]);
      // Fetch activity
      if (task.projectId) {
        get(`/api/activity/project/${task.projectId}`)
          .then(items => setActivities((items ?? []).filter(a =>
            a.entityId === task.id || (a.task?.id === task.id)
          ).slice(0, 10)))
          .catch(() => {});
      }
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveField = useCallback((field, value) => {
    if (!localTask) return;
    setLocalTask(prev => ({ ...prev, [field]: value }));
    patch(`/api/tasks/${localTask.id}`, { [field]: value })
      .then(updated => onUpdate?.(updated))
      .catch(() => setLocalTask(prev => ({ ...prev, [field]: localTask[field] })));
  }, [localTask, onUpdate]);

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== localTask?.title) {
      saveField('title', titleDraft.trim());
    }
  };

  const handleDescBlur = () => {
    if (descDraft !== localTask?.description) {
      saveField('description', descDraft);
    }
  };

  const handleAssigneeToggle = (member) => {
    if (!localTask) return;
    const ids = localTask.assignees?.map(a => a.id) ?? [];
    const newIds = ids.includes(member.member.id)
      ? ids.filter(id => id !== member.member.id)
      : [...ids, member.member.id];
    setLocalTask(prev => ({
      ...prev,
      assignees: projectMembers
        .filter(pm => newIds.includes(pm.member.id))
        .map(pm => pm.member),
    }));
    patch(`/api/tasks/${localTask.id}`, { assigneeIds: newIds })
      .then(updated => onUpdate?.(updated))
      .catch(() => setLocalTask(task));
  };

  const handleSubtaskToggle = (subtask) => {
    const newStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    setLocalTask(prev => ({
      ...prev,
      subtasks: prev.subtasks?.map(s => s.id === subtask.id ? { ...s, status: newStatus } : s),
    }));
    patch(`/api/tasks/${subtask.id}`, { status: newStatus }).catch(() => setLocalTask(task));
  };

  const handleAddSubtask = async (e) => {
    e.preventDefault();
    if (!newSubtask.trim() || !localTask) return;
    try {
      const created = await post('/api/tasks', {
        title: newSubtask.trim(),
        projectId: localTask.projectId,
        parentTaskId: localTask.id,
        status: 'TODO',
        priority: 'MEDIUM',
      });
      setLocalTask(prev => ({ ...prev, subtasks: [...(prev.subtasks ?? []), created] }));
      setNewSubtask('');
    } catch {}
  };

  const open = !!task;

  return (
    <>
      {open && <div className="pm-tdm-overlay" onClick={onClose} />}
      <div className={`pm-tdm-panel${open ? ' open' : ''}`}>
        {localTask && (
          <>
            {/* Header */}
            <div className="pm-tdm-header">
              <span
                className="pm-tdm-priority-dot"
                style={{ background: PRIORITY_COLORS[localTask.priority] }}
              />
              {editingTitle ? (
                <input
                  ref={titleRef}
                  className="pm-tdm-title-input"
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={e => e.key === 'Enter' && titleRef.current?.blur()}
                  autoFocus
                />
              ) : (
                <h2
                  className="pm-tdm-title"
                  onClick={() => setEditingTitle(true)}
                  title="Click to edit"
                >
                  {localTask.title}
                </h2>
              )}
              <button className="pm-tdm-close" onClick={onClose} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="pm-tdm-body">
              {/* Status */}
              <div className="pm-tdm-row">
                <div className="pm-tdm-seg-group">
                  <div className="pm-tdm-seg-label">Status</div>
                  <div className="pm-tdm-seg">
                    {STATUS_OPTIONS.map(s => (
                      <button
                        key={s}
                        className={`pm-tdm-seg-btn${localTask.status === s ? ' active' : ''}`}
                        onClick={() => saveField('status', s)}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Priority */}
              <div className="pm-tdm-row">
                <div className="pm-tdm-seg-group">
                  <div className="pm-tdm-seg-label">Priority</div>
                  <div className="pm-tdm-seg">
                    {PRIORITY_OPTIONS.map(p => (
                      <button
                        key={p}
                        className={`pm-tdm-seg-btn${localTask.priority === p ? ' active' : ''}`}
                        style={localTask.priority === p
                          ? { borderColor: PRIORITY_COLORS[p], color: PRIORITY_COLORS[p], background: `${PRIORITY_COLORS[p]}18` }
                          : {}
                        }
                        onClick={() => saveField('priority', p)}
                      >
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Due date */}
              <div className="pm-tdm-row">
                <div className="pm-tdm-seg-label">Due Date</div>
                <input
                  type="date"
                  className="pm-tdm-date-input"
                  value={localTask.dueDate ? localTask.dueDate.slice(0, 10) : ''}
                  onChange={e => saveField('dueDate', e.target.value || null)}
                />
              </div>

              {/* Description */}
              <div className="pm-tdm-row">
                <div className="pm-tdm-seg-label">Description</div>
                <textarea
                  className="pm-tdm-desc"
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  onBlur={handleDescBlur}
                  placeholder="Add a description…"
                  rows={3}
                />
              </div>

              {/* Assignees */}
              <div className="pm-tdm-row" style={{ position: 'relative' }}>
                <div className="pm-tdm-seg-label">Assignees</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {(localTask.assignees ?? []).map(a => (
                    <div
                      key={a.id}
                      className="pm-tdm-assignee-chip"
                      onClick={() => handleAssigneeToggle({ member: a })}
                    >
                      {a.avatarUrl
                        ? <img src={a.avatarUrl} alt="" className="pm-tdm-assignee-avatar" />
                        : (
                          <div className="pm-tdm-assignee-avatar pm-tdm-av-initials">
                            {(a.displayName ?? '?').slice(0, 2).toUpperCase()}
                          </div>
                        )
                      }
                      <span>{a.displayName}</span>
                      <span style={{ color: 'var(--pm-text-muted)', fontSize: 12 }}>×</span>
                    </div>
                  ))}
                  <button className="pm-tdm-add-btn" onClick={() => setShowAssigneeDD(v => !v)}>
                    + Add
                  </button>
                </div>
                {showAssigneeDD && (
                  <div className="pm-tdm-dropdown">
                    {projectMembers
                      .filter(pm => !(localTask.assignees ?? []).find(a => a.id === pm.member.id))
                      .map(pm => (
                        <button
                          key={pm.memberId}
                          className="pm-tdm-dd-item"
                          onClick={() => { handleAssigneeToggle(pm); setShowAssigneeDD(false); }}
                        >
                          <div
                            className="pm-tdm-assignee-avatar pm-tdm-av-initials"
                            style={{ width: 20, height: 20, fontSize: 8 }}
                          >
                            {(pm.member.displayName ?? '?').slice(0, 2).toUpperCase()}
                          </div>
                          {pm.member.displayName}
                        </button>
                      ))
                    }
                    {projectMembers.filter(pm => !(localTask.assignees ?? []).find(a => a.id === pm.member.id)).length === 0 && (
                      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--pm-text-muted)' }}>
                        All members assigned
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Subtasks */}
              <div className="pm-tdm-row">
                <div className="pm-tdm-seg-label">Subtasks</div>
                <div className="pm-tdm-subtasks">
                  {(localTask.subtasks ?? []).map(s => (
                    <label key={s.id} className="pm-tdm-subtask-row">
                      <input
                        type="checkbox"
                        checked={s.status === 'DONE'}
                        onChange={() => handleSubtaskToggle(s)}
                        className="pm-tdm-checkbox"
                      />
                      <span style={{
                        color: s.status === 'DONE' ? 'var(--pm-text-muted)' : 'var(--pm-text-primary)',
                        textDecoration: s.status === 'DONE' ? 'line-through' : 'none',
                        fontSize: '0.85rem',
                      }}>
                        {s.title}
                      </span>
                    </label>
                  ))}
                  <form onSubmit={handleAddSubtask} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input
                      className="pm-tdm-subtask-input"
                      value={newSubtask}
                      onChange={e => setNewSubtask(e.target.value)}
                      placeholder="Add subtask…"
                    />
                    <button type="submit" className="pm-tdm-add-btn">Add</button>
                  </form>
                </div>
              </div>

              {/* Dependencies */}
              {((localTask.blockedBy?.length ?? 0) > 0 || (localTask.blocks?.length ?? 0) > 0) && (
                <div className="pm-tdm-row">
                  <div className="pm-tdm-seg-label">Dependencies</div>
                  {(localTask.blockedBy?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{
                        fontSize: '0.7rem',
                        color: 'var(--pm-text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        Blocked by
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {localTask.blockedBy.map(t => (
                          <span key={t.id} className="pm-tdm-dep-pill pm-tdm-dep-blocked">{t.title}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(localTask.blocks?.length ?? 0) > 0 && (
                    <div>
                      <span style={{
                        fontSize: '0.7rem',
                        color: 'var(--pm-text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        Blocks
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {localTask.blocks.map(t => (
                          <span key={t.id} className="pm-tdm-dep-pill pm-tdm-dep-blocks">{t.title}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Activity feed */}
              {activities.length > 0 && (
                <div className="pm-tdm-row">
                  <div className="pm-tdm-seg-label">Activity</div>
                  <div className="pm-tdm-activity">
                    {activities.map(a => (
                      <div key={a.id} className="pm-tdm-activity-item">
                        <div
                          className="pm-tdm-av-initials pm-tdm-activity-av"
                          style={{ width: 24, height: 24, fontSize: 9 }}
                        >
                          {(a.author?.displayName ?? '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--pm-text-secondary)' }}>
                            <strong style={{ color: 'var(--pm-text-primary)' }}>
                              {a.author?.displayName}
                            </strong>
                            {' '}
                            {a.type === 'comment' ? 'commented' : (a.action ?? 'updated this task')}
                          </span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--pm-text-muted)', marginTop: 2 }}>
                            <RelativeTime dateStr={a.createdAt} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
