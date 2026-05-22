import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { get, post, patch, del } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import SubmissionFormModal from '../../components/clubpm/SubmissionFormModal';
import CommentThread from '../../components/clubpm/CommentThread';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────

const BOARD_COLUMNS = [
  { id: 'DRAFT',      label: 'Draft',       color: 'var(--pm-text-secondary)' },
  { id: 'SUBMITTED',  label: 'Submitted',   color: 'var(--pm-accent-amber)' },
  { id: 'IN_REVIEW',  label: 'In Review',   color: '#a29bfe' },
  { id: 'APPROVED',   label: 'Approved',    color: 'var(--pm-accent-teal)' },
  { id: 'PUBLISHED',  label: 'Published',   color: '#00b894' },
];

const TYPE_COLORS = {
  SOCIAL_POST:  { bg: 'rgba(108,92,231,0.18)', border: '#6c5ce7', text: '#a29bfe' },
  NEWSLETTER:   { bg: 'rgba(0,184,148,0.15)',  border: '#00b894', text: '#55efc4' },
  PHOTO:        { bg: 'rgba(253,203,110,0.15)', border: '#fdcb6e', text: '#ffeaa7' },
  VIDEO:        { bg: 'rgba(225,112,85,0.15)', border: '#e17055', text: '#fab1a0' },
  ANNOUNCEMENT: { bg: 'rgba(0,229,204,0.15)',  border: 'var(--pm-accent-teal)', text: 'var(--pm-accent-teal)' },
  EVENT_PROMO:  { bg: 'rgba(253,121,168,0.15)', border: '#fd79a8', text: '#fd79a8' },
};

const TYPE_LABELS = {
  SOCIAL_POST:  'Social Post',
  NEWSLETTER:   'Newsletter',
  PHOTO:        'Photo',
  VIDEO:        'Video',
  ANNOUNCEMENT: 'Announcement',
  EVENT_PROMO:  'Event Promo',
};

const PLATFORM_META = {
  instagram: { icon: 'fab fa-instagram', color: '#e1306c', label: 'Instagram' },
  linkedin:  { icon: 'fab fa-linkedin',  color: '#0077b5', label: 'LinkedIn' },
  twitter:   { icon: 'fab fa-twitter',   color: '#1da1f2', label: 'Twitter' },
  website:   { icon: 'fas fa-globe',     color: 'var(--pm-accent-teal)', label: 'Website' },
};

const CONTENT_IDEAS = [
  { icon: 'fas fa-camera', text: 'Share a photo from a recent meeting or build session.' },
  { icon: 'fas fa-bullhorn', text: 'Announce a recently completed milestone achievement.' },
  { icon: 'fas fa-calendar-star', text: 'Promote an upcoming club event or workshop.' },
  { icon: 'fas fa-rocket', text: 'Highlight a team member\'s contribution or spotlight.' },
];

// ── Helpers ───────────────────────────────────────────────────

function fmtDateTime(str) {
  if (!str) return null;
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function startOfMonth(d) {
  const r = new Date(d);
  r.setDate(1); r.setHours(0, 0, 0, 0);
  return r;
}

function endOfMonth(d) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + 1); r.setDate(0); r.setHours(23, 59, 59, 999);
  return r;
}

// ── TypeBadge ─────────────────────────────────────────────────

function TypeBadge({ type }) {
  const c = TYPE_COLORS[type] ?? { bg: 'rgba(255,255,255,0.08)', border: 'var(--clubpm-border)', text: 'var(--clubpm-text-secondary)' };
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 7px',
      borderRadius: 8,
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      letterSpacing: '0.03em',
    }}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ── PlatformChips ─────────────────────────────────────────────

function PlatformChips({ platforms = [] }) {
  if (!platforms.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {platforms.map(p => {
        const meta = PLATFORM_META[p];
        if (!meta) return null;
        return (
          <span
            key={p}
            title={meta.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 6,
              background: meta.color + '22',
              border: `1px solid ${meta.color}`,
              color: meta.color,
            }}
          >
            <i className={meta.icon} aria-hidden="true" />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

// ── SubmissionCard ────────────────────────────────────────────

function SubmissionCard({ submission, member, onEdit, onReview, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const isAdmin = member?.isAdmin;
  const isAuthor = member?.id === submission.authorId;
  const canDelete = isAdmin || isAuthor;
  const canReview = isAdmin && (submission.status === 'SUBMITTED' || submission.status === 'IN_REVIEW');
  const author = submission.author ?? submission.member;

  return (
    <div className="pm-outreach-card">
      <div className="pm-outreach-card-top">
        <TypeBadge type={submission.type} />
        {submission.scheduledAt && (
          <span style={{ fontSize: 10, color: 'var(--clubpm-text-muted)', marginLeft: 'auto' }}>
            <i className="fas fa-clock" aria-hidden="true" style={{ marginRight: 3 }} />
            {fmtDateTime(submission.scheduledAt)}
          </span>
        )}
      </div>

      <div
        className="pm-outreach-card-title"
        role="button"
        tabIndex={0}
        onClick={() => onEdit(submission)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onEdit(submission)}
      >
        {submission.title}
      </div>

      {submission.content && (
        <p className="pm-outreach-card-content">{submission.content}</p>
      )}

      <PlatformChips platforms={submission.platform ?? []} />

      <div className="pm-outreach-card-footer">
        {author ? (
          <div className="pm-outreach-card-author">
            {author.avatarUrl
              ? <img src={author.avatarUrl} alt="" className="pm-kanban-avatar" style={{ width: 20, height: 20 }} />
              : (
                <div className="pm-kanban-avatar pm-kanban-avatar-initials" style={{ width: 20, height: 20, fontSize: 8 }}>
                  {(author.displayName ?? '?').slice(0, 2).toUpperCase()}
                </div>
              )
            }
            <span style={{ fontSize: 11, color: 'var(--clubpm-text-muted)' }}>{author.displayName}</span>
          </div>
        ) : <span />}

        <div style={{ display: 'flex', gap: 5, marginLeft: 'auto', alignItems: 'center' }}>
          {/* Comments toggle */}
          <button
            className={`pm-outreach-comments-toggle${showComments ? ' pm-outreach-comments-toggle--active' : ''}`}
            onClick={() => setShowComments(v => !v)}
            title={showComments ? 'Hide comments' : 'Show comments'}
            aria-expanded={showComments}
          >
            <i className="fas fa-comment-alt" aria-hidden="true" />
            {' '}Comments
          </button>

          {canReview && (
            <>
              <button
                className="pm-outreach-review-btn pm-outreach-review-btn--approve"
                onClick={() => onReview(submission.id, 'APPROVED')}
              >
                Approve
              </button>
              <button
                className="pm-outreach-review-btn pm-outreach-review-btn--reject"
                onClick={() => onReview(submission.id, 'DRAFT')}
              >
                Reject
              </button>
            </>
          )}
          {canDelete && (
            confirmDelete ? (
              <>
                <button
                  className="pm-outreach-review-btn pm-outreach-review-btn--reject"
                  onClick={() => onDelete(submission.id)}
                  title="Confirm delete"
                >
                  <i className="fas fa-check" aria-hidden="true" /> Confirm
                </button>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clubpm-text-muted)', fontSize: 12, padding: '2px 6px' }}
                  onClick={() => setConfirmDelete(false)}
                  title="Cancel"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clubpm-text-muted)', fontSize: 13, padding: '2px 5px', borderRadius: 4, transition: 'color 0.15s' }}
                onClick={() => setConfirmDelete(true)}
                title="Delete submission"
                onMouseEnter={e => e.currentTarget.style.color = 'var(--pm-accent-coral, #e17055)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--clubpm-text-muted)'}
              >
                <i className="fas fa-trash-alt" aria-hidden="true" />
              </button>
            )
          )}
        </div>
      </div>

      {showComments && (
        <CommentThread
          submissionId={submission.id}
          currentMember={member}
        />
      )}
    </div>
  );
}

// ── BoardTab ──────────────────────────────────────────────────

const STATUS_LABELS = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted', IN_REVIEW: 'In Review',
  APPROVED: 'Approved', PUBLISHED: 'Published',
};

function BoardTab({ submissions, member, onEdit, onReview, onDelete, onStatusChange }) {
  const [columns, setColumns] = useState({});

  useEffect(() => {
    const cols = {};
    BOARD_COLUMNS.forEach(col => { cols[col.id] = []; });
    submissions.forEach(s => {
      if (cols[s.status]) cols[s.status].push(s);
      else cols['DRAFT'].push(s);
    });
    setColumns(cols);
  }, [submissions]);

  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (destination.droppableId !== source.droppableId) {
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
      toast.success(`Moved to ${STATUS_LABELS[destination.droppableId] ?? destination.droppableId}`);
    } else {
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
      <div className="pm-outreach-board">
        {BOARD_COLUMNS.map(col => (
          <div key={col.id} className="pm-outreach-col">
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
                  className={`pm-outreach-col-body${snapshot.isDraggingOver ? ' drag-over' : ''}`}
                >
                  {(columns[col.id] ?? []).length === 0 && !snapshot.isDraggingOver && (
                    <div className="pm-outreach-col-empty">No submissions</div>
                  )}
                  {(columns[col.id] ?? []).map((s, index) => {
                    const canDrag = member?.isAdmin || member?.id === s.authorId;
                    return (
                      <Draggable key={s.id} draggableId={s.id} index={index} isDragDisabled={!canDrag}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              opacity: dragSnapshot.isDragging ? 0.85 : 1,
                            }}
                          >
                            <SubmissionCard
                              submission={s}
                              member={member}
                              onEdit={onEdit}
                              onReview={onReview}
                              onDelete={onDelete}
                            />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
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

// ── CalendarTab ───────────────────────────────────────────────

function CalendarTab() {
  const [calItems, setCalItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const loadCalendar = useCallback((monthDate) => {
    setLoading(true);
    const from = startOfMonth(monthDate).toISOString();
    const to   = endOfMonth(monthDate).toISOString();
    get(`/api/outreach/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(data => setCalItems(Array.isArray(data) ? data : []))
      .catch(() => setCalItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCalendar(currentMonth);
  }, [currentMonth, loadCalendar]);

  // Group by week label
  const grouped = {};
  calItems.forEach(item => {
    if (!item.scheduledAt) return;
    const d = new Date(item.scheduledAt);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    (grouped[key] = grouped[key] || []).push(item);
  });
  const groupKeys = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));

  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="pm-outreach-calendar">
      <div className="pm-outreach-calendar-nav">
        <button
          className="cpm-nav-btn"
          onClick={() => setCurrentMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; })}
        >
          <i className="fas fa-angle-left" aria-hidden="true" /> Prev
        </button>
        <span className="pm-outreach-calendar-month">{monthLabel}</span>
        <button
          className="cpm-nav-btn"
          onClick={() => setCurrentMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; })}
        >
          Next <i className="fas fa-angle-right" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="pm-outreach-loading">
          <div className="pm-outreach-spinner" />
        </div>
      ) : calItems.length === 0 ? (
        <div className="pm-outreach-empty">
          <i className="fas fa-calendar-times" aria-hidden="true" />
          <p>No scheduled submissions for {monthLabel}.</p>
        </div>
      ) : (
        groupKeys.map(weekKey => (
          <div key={weekKey} className="pm-outreach-cal-group">
            <div className="pm-outreach-cal-week-label">
              <i className="fas fa-calendar-week" aria-hidden="true" style={{ marginRight: 6, opacity: 0.6 }} />
              Week of {weekKey}
            </div>
            {grouped[weekKey].map((item, i) => (
              <div key={item.id ?? i} className="pm-outreach-cal-row">
                <span className="pm-outreach-cal-date">{fmtDate(item.scheduledAt)}</span>
                <TypeBadge type={item.type} />
                <span className="pm-outreach-cal-title">{item.title}</span>
                <PlatformChips platforms={item.platform ?? []} />
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

// ── RecommendationsTab ────────────────────────────────────────

function RecommendationsTab({ submissions }) {
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/api/outreach/recommendations')
      .then(setRec)
      .catch(() => setRec({}))
      .finally(() => setLoading(false));
  }, []);

  const pendingCount  = submissions.filter(s => s.status === 'SUBMITTED' || s.status === 'IN_REVIEW').length;
  const approvedCount = submissions.filter(s => s.status === 'APPROVED' || s.status === 'PUBLISHED').length;

  return (
    <div className="pm-outreach-recs">
      {/* Content Stats */}
      <div className="pm-outreach-recs-section">
        <div className="pm-outreach-recs-section-title">
          <i className="fas fa-chart-bar" aria-hidden="true" /> Content Stats
        </div>
        <div className="pm-outreach-stats-row">
          <div className="pm-outreach-stat-tile">
            <div className="pm-stat-number">{pendingCount}</div>
            <div className="pm-stat-label">Pending Review</div>
          </div>
          <div className="pm-outreach-stat-tile">
            <div className="pm-stat-number">{approvedCount}</div>
            <div className="pm-stat-label">Approved / Published</div>
          </div>
          <div className="pm-outreach-stat-tile">
            <div className="pm-stat-number">{submissions.length}</div>
            <div className="pm-stat-label">Total Submissions</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="pm-outreach-loading"><div className="pm-outreach-spinner" /></div>
      ) : (
        <>
          {/* Recent Milestones */}
          <div className="pm-outreach-recs-section">
            <div className="pm-outreach-recs-section-title">
              <i className="fas fa-flag-checkered" aria-hidden="true" /> Recent Milestones
            </div>
            {rec?.recentMilestones?.length ? (
              <ul className="pm-outreach-recs-list">
                {rec.recentMilestones.map((m, i) => (
                  <li key={m.id ?? i} className="pm-outreach-recs-item">
                    <i className="fas fa-check-circle" aria-hidden="true" style={{ color: 'var(--pm-accent-teal)', marginRight: 8 }} />
                    <span className="pm-outreach-recs-item-title">{m.title}</span>
                    {m.projectName && (
                      <span className="pm-outreach-recs-item-sub"> — {m.projectName}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pm-outreach-recs-empty">No recently completed milestones.</p>
            )}
          </div>

          {/* Upcoming Events */}
          <div className="pm-outreach-recs-section">
            <div className="pm-outreach-recs-section-title">
              <i className="fas fa-calendar-plus" aria-hidden="true" /> Upcoming Events Worth Promoting
            </div>
            {rec?.upcomingEvents?.length ? (
              <ul className="pm-outreach-recs-list">
                {rec.upcomingEvents.map((ev, i) => (
                  <li key={ev.id ?? i} className="pm-outreach-recs-item">
                    <i className="fas fa-calendar-alt" aria-hidden="true" style={{ color: 'var(--pm-accent-amber)', marginRight: 8 }} />
                    <span className="pm-outreach-recs-item-title">{ev.title}</span>
                    {ev.startTime && (
                      <span className="pm-outreach-recs-item-sub"> — {fmtDate(ev.startTime)}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pm-outreach-recs-empty">No upcoming events found.</p>
            )}
          </div>
        </>
      )}

      {/* Content Ideas */}
      <div className="pm-outreach-recs-section">
        <div className="pm-outreach-recs-section-title">
          <i className="fas fa-lightbulb" aria-hidden="true" /> Content Ideas
        </div>
        <div className="pm-outreach-ideas-grid">
          {CONTENT_IDEAS.map((idea, i) => (
            <div key={i} className="pm-outreach-idea-card">
              <i className={idea.icon} aria-hidden="true" style={{ fontSize: 20, marginBottom: 8, color: 'var(--pm-accent-teal)' }} />
              <p style={{ fontSize: 13, color: 'var(--clubpm-text-secondary)', margin: 0 }}>{idea.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── OutreachHub ───────────────────────────────────────────────

export default function OutreachHub() {
  const { member } = useClubPmAuth();
  const [activeTab, setActiveTab]         = useState('board');
  const [submissions, setSubmissions]     = useState([]);
  const [projects, setProjects]           = useState([]);
  const [events, setEvents]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editSubmission, setEditSubmission]   = useState(null);

  useEffect(() => {
    Promise.all([
      get('/api/outreach/submissions'),
      get('/api/projects'),
      get('/api/events/upcoming').catch(() => []),
    ])
      .then(([subs, projs, evts]) => {
        setSubmissions(Array.isArray(subs) ? subs : []);
        setProjects(Array.isArray(projs) ? projs : []);
        setEvents(Array.isArray(evts) ? evts : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (payload) => {
    if (editSubmission) {
      const updated = await patch(`/api/outreach/submissions/${editSubmission.id}`, payload);
      setSubmissions(prev => prev.map(s => s.id === editSubmission.id ? { ...s, ...updated } : s));
      toast.success('Submission updated.');
    } else {
      const created = await post('/api/outreach/submissions', payload);
      setSubmissions(prev => [created, ...prev]);
      toast.success(payload.status === 'SUBMITTED' ? 'Submitted for review!' : 'Draft saved.');
    }
    setEditSubmission(null);
    setShowCreateModal(false);
  };

  const handleEdit = (submission) => {
    setEditSubmission(submission);
    setShowCreateModal(true);
  };

  const handleModalClose = () => {
    setShowCreateModal(false);
    setEditSubmission(null);
  };

  const handleReview = async (id, newStatus) => {
    const original = submissions.find(s => s.id === id)?.status;
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
    try {
      await post(`/api/outreach/submissions/${id}/review`, { status: newStatus });
      toast.success(newStatus === 'APPROVED' ? 'Submission approved.' : 'Submission sent back to draft.');
    } catch (err) {
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: original } : s));
      toast.error(err.message ?? 'Review action failed.');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
    try {
      await patch(`/api/outreach/submissions/${id}`, { status: newStatus });
    } catch (err) {
      toast.error(err.message ?? 'Failed to update status.');
      // BoardTab's local state is already updated; revert the submissions list
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: s.status } : s));
    }
  };

  const handleDelete = async (id) => {
    setSubmissions(prev => prev.filter(s => s.id !== id));
    try {
      await del(`/api/outreach/submissions/${id}`);
      toast.success('Submission deleted.');
    } catch (err) {
      const restored = submissions.find(s => s.id === id);
      if (restored) setSubmissions(prev => [restored, ...prev]);
      toast.error(err.message ?? 'Delete failed.');
    }
  };

  const TABS = [
    { id: 'board',           label: 'Board',           icon: 'fas fa-columns' },
    { id: 'calendar',        label: 'Calendar',        icon: 'fas fa-calendar-alt' },
    { id: 'recommendations', label: 'Recommendations', icon: 'fas fa-lightbulb' },
  ];

  if (loading) {
    return (
      <div className="clubpm-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--clubpm-accent-primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="clubpm-app pm-outreach-hub">
      {/* Page header */}
      <div className="pm-outreach-page-header">
        <div>
          <h1 className="pm-outreach-page-title">
            <i className="fas fa-broadcast-tower" aria-hidden="true" style={{ marginRight: 10, color: 'var(--pm-accent-teal)' }} />
            Outreach Hub
          </h1>
          <p className="pm-outreach-page-sub">Manage social content, scheduling, and publication.</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="pm-outreach-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`pm-outreach-tab-btn${activeTab === tab.id ? ' pm-outreach-tab-btn--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={tab.icon} aria-hidden="true" style={{ marginRight: 6 }} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pm-outreach-tab-content" role="tabpanel">
        {activeTab === 'board' && (
          <BoardTab
            submissions={submissions}
            member={member}
            onEdit={handleEdit}
            onReview={handleReview}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />
        )}
        {activeTab === 'calendar' && <CalendarTab />}
        {activeTab === 'recommendations' && (
          <RecommendationsTab submissions={submissions} />
        )}
      </div>

      {/* FAB — create new submission */}
      <button
        className="pm-fab"
        onClick={() => { setEditSubmission(null); setShowCreateModal(true); }}
        title="New submission"
        aria-label="Create new submission"
        style={{ bottom: 32 }}
      >
        +
      </button>

      {/* Create / Edit modal */}
      <SubmissionFormModal
        isOpen={showCreateModal}
        onClose={handleModalClose}
        onSave={handleSave}
        editSubmission={editSubmission}
        projects={projects}
        events={events}
      />
    </div>
  );
}
