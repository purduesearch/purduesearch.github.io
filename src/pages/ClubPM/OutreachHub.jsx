import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { get, post, patch, del } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import SubmissionFormModal from '../../components/clubpm/SubmissionFormModal';
import CommentThread from '../../components/clubpm/CommentThread';
import ComposerTab from '../../components/clubpm/ComposerTab';
import CrossPostBundle from '../../components/clubpm/CrossPostBundle';
import BrandVoiceAdmin from '../../components/clubpm/BrandVoiceAdmin';
import CampaignsTab from '../../components/clubpm/CampaignsTab';
import CalendarTab from '../../components/clubpm/CalendarTab';
import CrmTab from '../../components/clubpm/CrmTab';
import InsightsTab from '../../components/clubpm/InsightsTab';
import KeyboardShortcutsModal from '../../components/clubpm/KeyboardShortcutsModal';
import ActivityFeedSidebar from '../../components/clubpm/ActivityFeedSidebar';
import OutreachSearch from '../../components/clubpm/OutreachSearch';
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

function SubmissionCard({ submission, member, onEdit, onReview, onDelete, onCopy, selectedIds, toggleSelect }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const isAdmin = member?.isAdmin;
  const isAuthor = member?.id === submission.authorId;
  const canDelete = isAdmin || isAuthor;
  const canReview = isAdmin && (submission.status === 'SUBMITTED' || submission.status === 'IN_REVIEW');
  const canCopy = submission.status === 'APPROVED' && (isAdmin || isAuthor);
  const author = submission.author ?? submission.member;
  const isSelected = selectedIds?.has(submission.id);

  return (
    <div className={`pm-outreach-card${isSelected ? ' pm-card--selected' : ''}`}>
      <div className="pm-outreach-card-top">
        <input
          type="checkbox"
          className="pm-card-checkbox"
          checked={isSelected ?? false}
          onChange={() => toggleSelect?.(submission.id)}
          onClick={e => e.stopPropagation()}
          aria-label={`Select "${submission.title}"`}
        />
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

        <div className="pm-outreach-card-actions">
          {/* Comments toggle — icon only */}
          <button
            className={`pm-outreach-comments-toggle${showComments ? ' pm-outreach-comments-toggle--active' : ''}`}
            onClick={() => setShowComments(v => !v)}
            title={showComments ? 'Hide comments' : 'Show comments'}
            aria-label={showComments ? 'Hide comments' : 'Show comments'}
            aria-expanded={showComments}
          >
            <i className="fas fa-comment-alt" aria-hidden="true" />
          </button>

          {canCopy && (
            <button
              className="pm-outreach-review-btn pm-copy-trigger-btn"
              onClick={() => onCopy(submission)}
              title="Copy for Posting"
              aria-label="Copy for Posting"
            >
              <i className="fas fa-clipboard" aria-hidden="true" />
            </button>
          )}
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

function BulkToolbar({ selectedIds, onClearSelection, onBulkStatus, onBulkDelete, loading }) {
  const count = selectedIds.size;
  const [pendingStatus, setPendingStatus] = useState('');

  const handleStatusApply = () => {
    if (!pendingStatus) return;
    onBulkStatus(pendingStatus);
    setPendingStatus('');
  };

  return (
    <div className="pm-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
      <span className="pm-bulk-count">{count} selected</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select
          className="pm-bulk-status-select"
          value={pendingStatus}
          onChange={e => setPendingStatus(e.target.value)}
          disabled={loading}
          aria-label="Change status to"
        >
          <option value="">Change Status&hellip;</option>
          {BOARD_COLUMNS.map(col => (
            <option key={col.id} value={col.id}>{col.label}</option>
          ))}
        </select>
        <button
          className="pm-bulk-status-apply-btn"
          onClick={handleStatusApply}
          disabled={loading || !pendingStatus}
          aria-label="Apply status change"
        >
          {loading
            ? <span className="pm-bulk-spinner" aria-hidden="true" />
            : <i className="fas fa-check" aria-hidden="true" />
          }
          Apply
        </button>
      </div>

      <button
        className="pm-bulk-delete-btn"
        onClick={onBulkDelete}
        disabled={loading}
        aria-label={`Delete ${count} selected submissions`}
      >
        {loading
          ? <span className="pm-bulk-spinner" aria-hidden="true" />
          : <i className="fas fa-trash-alt" aria-hidden="true" />
        }
        Delete
      </button>

      <button
        className="pm-bulk-clear-btn"
        onClick={onClearSelection}
        disabled={loading}
        aria-label="Clear selection"
        title="Clear selection (Esc)"
      >
        <i className="fas fa-times" aria-hidden="true" /> Clear
      </button>
    </div>
  );
}

function BoardTab({ submissions, member, onEdit, onReview, onDelete, onStatusChange, onBulkReload, campaigns }) {
  const [columns,        setColumns]        = useState({});
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [bulkLoading,    setBulkLoading]    = useState(false);
  const [copyTarget,     setCopyTarget]     = useState(null);
  const [campaignFilter, setCampaignFilter] = useState(null); // null = "All"

  const filtered = campaignFilter
    ? submissions.filter(s => s.campaignId === campaignFilter)
    : submissions;

  useEffect(() => {
    const cols = {};
    BOARD_COLUMNS.forEach(col => { cols[col.id] = []; });
    filtered.forEach(s => {
      if (cols[s.status]) cols[s.status].push(s);
      else cols['DRAFT'].push(s);
    });
    setColumns(cols);
  }, [filtered]);

  // Escape key clears selection
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkStatus = async (newStatus) => {
    const count = selectedIds.size;
    setBulkLoading(true);
    try {
      await Promise.all(
        [...selectedIds].map(id => patch(`/api/outreach/submissions/${id}`, { status: newStatus }))
      );
      toast.success(`Updated ${count} submission${count !== 1 ? 's' : ''} to ${STATUS_LABELS[newStatus] ?? newStatus}.`);
      setSelectedIds(new Set());
      onBulkReload?.();
    } catch (err) {
      toast.error(err.message ?? 'Bulk status update failed.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} submission${count !== 1 ? 's' : ''}?`)) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        [...selectedIds].map(id => del(`/api/outreach/submissions/${id}`))
      );
      toast.success(`Deleted ${count} submission${count !== 1 ? 's' : ''}.`);
      setSelectedIds(new Set());
      onBulkReload?.();
    } catch (err) {
      toast.error(err.message ?? 'Bulk delete failed.');
    } finally {
      setBulkLoading(false);
    }
  };

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
    <div className="pm-board-tab-wrapper">
      {campaigns?.length > 0 && (
        <div className="pm-board-campaign-filter" role="group" aria-label="Filter by campaign">
          <button
            className={`pm-campaign-chip${!campaignFilter ? ' pm-campaign-chip--active' : ''}`}
            onClick={() => setCampaignFilter(null)}
          >
            All
          </button>
          {campaigns.map(c => (
            <button
              key={c.id}
              className={`pm-campaign-chip${campaignFilter === c.id ? ' pm-campaign-chip--active' : ''}`}
              style={campaignFilter === c.id ? { borderColor: c.color ?? 'var(--pm-accent-teal)', color: c.color ?? 'var(--pm-accent-teal)' } : {}}
              onClick={() => setCampaignFilter(prev => prev === c.id ? null : c.id)}
            >
              <span className="pm-campaign-chip-dot" style={{ background: c.color ?? 'var(--pm-accent-teal)' }} />
              {c.name}
            </button>
          ))}
        </div>
      )}
      {selectedIds.size > 0 && (
        <BulkToolbar
          selectedIds={selectedIds}
          onClearSelection={clearSelection}
          onBulkStatus={handleBulkStatus}
          onBulkDelete={handleBulkDelete}
          loading={bulkLoading}
        />
      )}
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
                                onCopy={setCopyTarget}
                                selectedIds={selectedIds}
                                toggleSelect={toggleSelect}
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

      {copyTarget && (
        <CrossPostBundle
          submission={copyTarget}
          onClose={() => setCopyTarget(null)}
          onPublished={() => {
            setCopyTarget(null);
            onBulkReload?.();
          }}
        />
      )}
    </div>
  );
}

// CalendarTab is now in src/components/clubpm/CalendarTab.jsx

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
  const [activeTab, setActiveTab]             = useState('board');
  const [submissions, setSubmissions]         = useState([]);
  const [projects, setProjects]               = useState([]);
  const [events, setEvents]                   = useState([]);
  const [campaigns, setCampaigns]             = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editSubmission, setEditSubmission]   = useState(null);
  const [showShortcuts, setShowShortcuts]     = useState(false);
  const [showActivity, setShowActivity]       = useState(false);
  const [contacts, setContacts]               = useState([]);

  const loadSubmissions = useCallback(() => {
    get('/api/outreach/submissions')
      .then(subs => setSubmissions(Array.isArray(subs) ? subs : []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    Promise.all([
      get('/api/outreach/submissions'),
      get('/api/projects'),
      get('/api/events/upcoming').catch(() => []),
      get('/api/outreach/campaigns').catch(() => []),
      get('/api/outreach/contacts').catch(() => []),
    ])
      .then(([subs, projs, evts, camps, conts]) => {
        setSubmissions(Array.isArray(subs)   ? subs   : []);
        setProjects(Array.isArray(projs)     ? projs  : []);
        setEvents(Array.isArray(evts)        ? evts   : []);
        setCampaigns(Array.isArray(camps)    ? camps  : []);
        setContacts(Array.isArray(conts)     ? conts  : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────
  const TAB_IDS = ['composer', 'board', 'calendar', 'campaigns', 'crm', 'insights'];
  useEffect(() => {
    function onKey(e) {
      // Skip if typing in an input / textarea / select
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') { e.preventDefault(); setShowShortcuts(s => !s); return; }
      if (e.key === 'Escape') { setShowShortcuts(false); return; }
      if (e.key === 'n') { e.preventDefault(); setEditSubmission(null); setShowCreateModal(true); return; }
      if (e.key === 'c') { e.preventDefault(); setActiveTab('composer'); return; }
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector('.pm-search-input, .pm-crm-search')?.focus();
        return;
      }
      // 1-6 tab jump
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= TAB_IDS.length) {
        e.preventDefault();
        setActiveTab(TAB_IDS[num - 1]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    { id: 'composer',        label: 'Composer',        icon: 'fas fa-pen-nib' },
    { id: 'board',           label: 'Board',           icon: 'fas fa-columns' },
    { id: 'calendar',        label: 'Calendar',        icon: 'fas fa-calendar-alt' },
    { id: 'campaigns',       label: 'Campaigns',       icon: 'fas fa-flag' },
    { id: 'crm',             label: 'CRM',             icon: 'fas fa-address-book' },
    { id: 'insights',        label: 'Insights',        icon: 'fas fa-chart-line' },
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 420 }}>
          <OutreachSearch
            submissions={submissions}
            campaigns={campaigns}
            contacts={contacts}
            onNavigate={(kind, _item) => setActiveTab(kind)}
          />
        </div>
        <button
          className="pm-outreach-activity-btn"
          onClick={() => setShowActivity(s => !s)}
          title="Activity feed"
          aria-label="Toggle activity feed"
        >
          <i className="fas fa-stream" aria-hidden="true" />
          Activity
        </button>
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
        <button
          className="pm-outreach-shortcuts-hint"
          onClick={() => setShowShortcuts(true)}
          title="Keyboard shortcuts (?)"
          aria-label="Show keyboard shortcuts"
        >
          <i className="fas fa-keyboard" aria-hidden="true" />
        </button>
      </div>

      {/* Tab content */}
      <div className="pm-outreach-tab-content" role="tabpanel">
        {activeTab === 'composer' && (
          <ComposerTab
            onSaved={(submission) => {
              setSubmissions(prev => {
                const exists = prev.find(s => s.id === submission.id);
                return exists
                  ? prev.map(s => s.id === submission.id ? { ...s, ...submission } : s)
                  : [submission, ...prev];
              });
            }}
          />
        )}
        {activeTab === 'board' && (
          <BoardTab
            submissions={submissions}
            member={member}
            onEdit={handleEdit}
            onReview={handleReview}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onBulkReload={loadSubmissions}
            campaigns={campaigns}
          />
        )}
        {activeTab === 'calendar' && <CalendarTab campaigns={campaigns} />}
        {activeTab === 'campaigns' && (
          <CampaignsTab isAdmin={!!member?.isAdmin} />
        )}
        {activeTab === 'crm' && (
          <CrmTab
            isAdmin={!!member?.isAdmin}
            currentMemberId={member?.id}
            campaigns={campaigns}
          />
        )}
        {activeTab === 'insights' && (
          <InsightsTab submissions={submissions} isAdmin={!!member?.isAdmin} />
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

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      {/* Activity feed sidebar */}
      <ActivityFeedSidebar
        isOpen={showActivity}
        onClose={() => setShowActivity(false)}
      />
    </div>
  );
}
