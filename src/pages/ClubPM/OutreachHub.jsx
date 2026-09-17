import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { revealStagger } from '../../clubpm/anim/motion';
import OrbitLoader from '../../components/OrbitLoader';
// Repository rule: the board's drag-and-drop is @dnd-kit, like every other
// ClubPM board. The legacy @hello-pangea/dnd usage was migrated here.
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MobileSheet from '../../components/clubpm/MobileSheet';
import { useCompactLayout } from '../../clubpm/layout/compactLayout';
import { get, post, patch, del } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import SubmissionFormModal from '../../components/clubpm/SubmissionFormModal';
import AvatarPortrait from '../../components/clubpm/avatar/AvatarPortrait';
import CommentThread from '../../components/clubpm/CommentThread';
import SafetyBadge from '../../components/clubpm/SafetyBadge';
import ApprovalChips from '../../components/clubpm/ApprovalChips';
import ComposerTab from '../../components/clubpm/ComposerTab';
import CrossPostBundle from '../../components/clubpm/CrossPostBundle';
import BrandVoiceAdmin from '../../components/clubpm/BrandVoiceAdmin';
import CampaignsTab from '../../components/clubpm/CampaignsTab';
import CalendarTab from '../../components/clubpm/CalendarTab';
import CrmTab from '../../components/clubpm/CrmTab';
import InsightsTab from '../../components/clubpm/InsightsTab';
import ActivityFeedSidebar from '../../components/clubpm/ActivityFeedSidebar';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import OutreachSearch from '../../components/clubpm/OutreachSearch';
import BlogTab from '../../components/clubpm/BlogTab';
import { useSearchParams } from 'react-router-dom';
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

function SubmissionCard({ submission, member, onEdit, onReview, onDelete, onCopy, selectedIds, toggleSelect, onSafetyUpdate, onExpandBlog }) {
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

      {/* Safety badge (only for non-DRAFT or already-checked submissions) */}
      {(submission.safetyReport || ['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(submission.status)) && (
        <div style={{ marginTop: 6 }}>
          <SafetyBadge
            submissionId={submission.id}
            report={submission.safetyReport}
            checkedAt={submission.safetyCheckedAt}
            onUpdate={({ report, checkedAt }) => onSafetyUpdate?.(submission.id, { safetyReport: report, safetyCheckedAt: checkedAt })}
            compact
          />
        </div>
      )}

      {/* Approval workflow chips (shows only when campaign has requiredApprovers) */}
      {submission.campaignId && ['SUBMITTED', 'IN_REVIEW'].includes(submission.status) && (
        <div style={{ marginTop: 6 }}>
          <ApprovalChips
            submissionId={submission.id}
            currentMemberId={member?.id}
            isAdmin={!!member?.isAdmin}
            onAdvanced={() => onSafetyUpdate?.(submission.id, { status: 'APPROVED' })}
          />
        </div>
      )}

      <div className="pm-outreach-card-footer">
        {author ? (
          <div className="pm-outreach-card-author">
            <AvatarPortrait member={author} size={20} className="pm-kanban-avatar" />
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
          {(['APPROVED', 'PUBLISHED'].includes(submission.status)
            || (submission.status === 'IN_REVIEW' && submission.content)) && (
            <button
              className="pm-outreach-review-btn"
              onClick={() => onExpandBlog?.(submission)}
              title={submission.blogSlug ? 'Re-expand to blog post' : 'Expand to blog post (AI)'}
              aria-label="Expand to blog post"
            >
              <i className={`fas ${submission.blogSlug ? 'fa-blog' : 'fa-pen-fancy'}`} aria-hidden="true" />
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

/** One draggable submission card on the desktop board. */
function SortableSubmission({ submission, columnId, canDrag, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: submission.id,
    disabled: !canDrag,
    data: { columnId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

/** The column body is its own droppable so an empty column can accept a card. */
function BoardColumnBody({ columnId, isEmpty, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${columnId}`, data: { columnId } });
  return (
    <div
      ref={setNodeRef}
      className={`pm-outreach-col-body${isOver ? ' drag-over' : ''}`}
    >
      {isEmpty && !isOver && (
        <div className="pm-outreach-col-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 12h-6l-2 3H10l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>
          </svg>
          <span>No submissions</span>
        </div>
      )}
      {children}
    </div>
  );
}

function BoardTab({ submissions, member, onEdit, onReview, onDelete, onStatusChange, onBulkReload, campaigns, onSafetyUpdate, onExpandBlog }) {
  const compact = useCompactLayout();
  const [columns,        setColumns]        = useState({});
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [bulkLoading,    setBulkLoading]    = useState(false);
  const [copyTarget,     setCopyTarget]     = useState(null);
  const [campaignFilter, setCampaignFilter] = useState(null); // null = "All"
  const [draggingId,     setDraggingId]     = useState(null);
  // Phone: one stage at a time, plus an explicit Move control per card.
  const [stageFilter,    setStageFilter]    = useState(BOARD_COLUMNS[0].id);
  const [moveTarget,     setMoveTarget]     = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Memoised: the column rebuild below depends on this list's identity, and an
  // array rebuilt on every render made that effect re-run (and re-set state) on
  // every render.
  const filtered = useMemo(() => (
    campaignFilter ? submissions.filter(s => s.campaignId === campaignFilter) : submissions
  ), [submissions, campaignFilter]);

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

  /** Apply a status change the same way whichever control asked for it. */
  const moveSubmission = useCallback((id, fromColumn, toColumn, toIndex) => {
    if (!toColumn || fromColumn === toColumn) return;
    setColumns(prev => {
      const next = { ...prev };
      const srcList = [...(prev[fromColumn] ?? [])];
      const dstList = [...(prev[toColumn] ?? [])];
      const idx = srcList.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      const [moved] = srcList.splice(idx, 1);
      dstList.splice(toIndex ?? dstList.length, 0, { ...moved, status: toColumn });
      next[fromColumn] = srcList;
      next[toColumn] = dstList;
      return next;
    });
    onStatusChange?.(id, toColumn);
    toast.success(`Moved to ${STATUS_LABELS[toColumn] ?? toColumn}`);
  }, [onStatusChange]);

  const columnOf = useCallback((id) => {
    if (typeof id === 'string' && id.startsWith('col:')) return id.slice(4);
    return BOARD_COLUMNS.find(col => (columns[col.id] ?? []).some(s => s.id === id))?.id ?? null;
  }, [columns]);

  const handleDragEnd = ({ active, over }) => {
    setDraggingId(null);
    if (!over) return;

    const from = active.data.current?.columnId ?? columnOf(active.id);
    const to = over.data.current?.columnId ?? columnOf(over.id);
    if (!from || !to) return;

    if (from === to) {
      // Reorder inside one column. This is display-only, exactly as before: no
      // order is persisted, and a reload restores the server order.
      const list = columns[from] ?? [];
      const oldIndex = list.findIndex(s => s.id === active.id);
      const newIndex = list.findIndex(s => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      setColumns(prev => ({ ...prev, [from]: arrayMove(prev[from] ?? [], oldIndex, newIndex) }));
      return;
    }

    const dstList = columns[to] ?? [];
    const overIndex = dstList.findIndex(s => s.id === over.id);
    moveSubmission(active.id, from, to, overIndex === -1 ? dstList.length : overIndex);
  };

  const draggingSubmission = draggingId
    ? Object.values(columns).flat().find(s => s.id === draggingId)
    : null;

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
      {compact ? (
        // Phones get one stage at a time and an explicit Move control per card.
        // Five side-by-side columns cannot be read at 320px, and dragging a card
        // between them is not a touch interaction.
        <>
          <div className="pm-m-source" role="group" aria-label="Board stage">
            <span className="pm-m-source-label" id="outreach-stage-label">Stage</span>
            <div className="pm-m-chip-row" role="group" aria-labelledby="outreach-stage-label">
              {BOARD_COLUMNS.map(col => (
                <button
                  key={col.id}
                  type="button"
                  className="pm-m-chip"
                  aria-pressed={stageFilter === col.id}
                  onClick={() => setStageFilter(col.id)}
                >
                  <span className="pm-kanban-col-dot" style={{ background: col.color }} aria-hidden="true" />
                  {col.label}
                  <span className="pm-m-chip-count">{(columns[col.id] ?? []).length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pm-m-outreach-list">
            {(columns[stageFilter] ?? []).length === 0 ? (
              <p className="pm-m-task-empty pm-m-task-empty--card">
                No submissions in {STATUS_LABELS[stageFilter] ?? stageFilter}.
              </p>
            ) : (columns[stageFilter] ?? []).map(s => {
              const canMove = member?.isAdmin || member?.id === s.authorId;
              return (
                <div key={s.id} className="pm-m-outreach-item">
                  <SubmissionCard
                    submission={s}
                    member={member}
                    onEdit={onEdit}
                    onReview={onReview}
                    onDelete={onDelete}
                    onCopy={setCopyTarget}
                    selectedIds={selectedIds}
                    toggleSelect={toggleSelect}
                    onSafetyUpdate={onSafetyUpdate}
                    onExpandBlog={onExpandBlog}
                  />
                  {canMove && (
                    <button
                      type="button"
                      className="pm-m-btn pm-m-btn--block"
                      data-m-opener={`outreach-move-${s.id}`}
                      aria-haspopup="dialog"
                      onClick={() => setMoveTarget(s)}
                    >
                      <i className="fas fa-arrow-right-arrow-left" aria-hidden="true" /> Move
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => setDraggingId(active.id)}
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="pm-outreach-board">
          {BOARD_COLUMNS.map(col => (
            <div key={col.id} className="pm-outreach-col">
              <div className="pm-kanban-col-header">
                <span className="pm-kanban-col-dot" style={{ background: col.color }} />
                <span className="pm-kanban-col-label" style={{ color: col.color }}>{col.label}</span>
                <span className="pm-kanban-col-count">{(columns[col.id] ?? []).length}</span>
              </div>
              <SortableContext
                items={(columns[col.id] ?? []).map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <BoardColumnBody columnId={col.id} isEmpty={(columns[col.id] ?? []).length === 0}>
                  {(columns[col.id] ?? []).map(s => (
                    <SortableSubmission
                      key={s.id}
                      submission={s}
                      columnId={col.id}
                      canDrag={member?.isAdmin || member?.id === s.authorId}
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
                        onSafetyUpdate={onSafetyUpdate}
                        onExpandBlog={onExpandBlog}
                      />
                    </SortableSubmission>
                  ))}
                </BoardColumnBody>
              </SortableContext>
            </div>
          ))}
        </div>

        {createPortal(
          <DragOverlay dropAnimation={null}>
            {draggingSubmission && (
              <div className="pm-outreach-card pm-outreach-card--lifted">
                <div className="pm-outreach-card-title">{draggingSubmission.title}</div>
              </div>
            )}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
      )}

      {compact && moveTarget && (
        <MobileSheet
          title={`Move “${moveTarget.title}”`}
          onClose={() => setMoveTarget(null)}
          returnFocusSelector={`[data-m-opener="outreach-move-${moveTarget.id}"]`}
        >
          <div className="pm-m-card">
            {BOARD_COLUMNS.map(col => (
              <button
                key={col.id}
                type="button"
                className="pm-m-row"
                aria-current={moveTarget.status === col.id ? 'true' : undefined}
                disabled={moveTarget.status === col.id}
                onClick={() => {
                  moveSubmission(moveTarget.id, moveTarget.status, col.id);
                  setStageFilter(col.id);
                  setMoveTarget(null);
                }}
              >
                <span className="pm-m-task-group-dot" style={{ background: col.color }} />
                <span className="pm-m-row-main">{col.label}</span>
                {moveTarget.status === col.id ? <span className="pm-m-row-end">Current</span> : null}
              </button>
            ))}
          </div>
        </MobileSheet>
      )}

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
        <div className="pm-outreach-loading"><OrbitLoader size={72} /></div>
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

// Module scope so the initial-tab check below can read it. Courses used to be
// an eighth tab here; it now has its own route at /clubpm/courses.
const TABS = [
  { id: 'composer',        label: 'Composer',        icon: 'fas fa-pen-nib' },
  { id: 'board',           label: 'Board',           icon: 'fas fa-columns' },
  { id: 'calendar',        label: 'Calendar',        icon: 'fas fa-calendar-alt' },
  { id: 'campaigns',       label: 'Campaigns',       icon: 'fas fa-flag' },
  { id: 'crm',             label: 'CRM',             icon: 'fas fa-address-book' },
  { id: 'blog',            label: 'Blog',            icon: 'fas fa-newspaper' },
  { id: 'insights',        label: 'Insights',        icon: 'fas fa-chart-line' },
];

export default function OutreachHub() {
  const { member } = useClubPmAuth();
  const compact = useCompactLayout();
  // The sidebar's Outreach > Blog child deep-links here as ?tab=blog, so the
  // opening tab comes from the URL whenever it names a real one.
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab]             = useState(
    () => TABS.some(t => t.id === tabParam) ? tabParam : 'board'
  );
  // Clicking Hub or Blog in the sidebar while already on this route changes the
  // query string without remounting, so the initializer alone is not enough.
  useEffect(() => {
    setActiveTab(TABS.some(t => t.id === tabParam) ? tabParam : 'board');
  }, [tabParam]);
  const [submissions, setSubmissions]         = useState([]);
  const [projects, setProjects]               = useState([]);
  const [events, setEvents]                   = useState([]);
  const [campaigns, setCampaigns]             = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editSubmission, setEditSubmission]   = useState(null);
  const [showActivity, setShowActivity]       = useState(false);
  const [contacts, setContacts]               = useState([]);

  const loadSubmissions = useCallback(() => {
    get('/api/outreach/submissions')
      .then(subs => setSubmissions(Array.isArray(subs) ? subs : []))
      .catch(console.error);
  }, []);

  const tabContentRef = useRef(null);
  useEffect(() => {
    if (!tabContentRef.current) return;
    const direct = tabContentRef.current.children;
    if (direct?.length) revealStagger(direct, { delay: 60, fromY: 8, duration: 380 });
  }, [activeTab]);

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

  // ── Keyboard shortcuts (registered via global registry) ──────
  useKeyboardShortcuts([
    { id: 'outreach.new',    keys: 'n', scope: 'page', pageId: 'Outreach', description: 'New submission',      action: () => { setEditSubmission(null); setShowCreateModal(true); } },
    { id: 'outreach.comp',   keys: 'c', scope: 'page', pageId: 'Outreach', description: 'Switch to Composer',  action: () => setActiveTab('composer') },
    { id: 'outreach.search', keys: '/', scope: 'page', pageId: 'Outreach', description: 'Focus search',        // .pm-crm-search is the field's wrapper, not the field -- focus the input.
      action: () => document.querySelector('.pm-search-input, .pm-crm-search-input')?.focus() },
    { id: 'outreach.tab.1',  keys: '1', scope: 'page', pageId: 'Outreach', description: 'Composer tab',        action: () => setActiveTab('composer') },
    { id: 'outreach.tab.2',  keys: '2', scope: 'page', pageId: 'Outreach', description: 'Board tab',           action: () => setActiveTab('board') },
    { id: 'outreach.tab.3',  keys: '3', scope: 'page', pageId: 'Outreach', description: 'Calendar tab',        action: () => setActiveTab('calendar') },
    { id: 'outreach.tab.4',  keys: '4', scope: 'page', pageId: 'Outreach', description: 'Campaigns tab',       action: () => setActiveTab('campaigns') },
    { id: 'outreach.tab.5',  keys: '5', scope: 'page', pageId: 'Outreach', description: 'CRM tab',             action: () => setActiveTab('crm') },
    { id: 'outreach.tab.6',  keys: '6', scope: 'page', pageId: 'Outreach', description: 'Insights tab',        action: () => setActiveTab('insights') },
  ]);

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

      {/* Section selector (phones) / tab bar (desktop). Seven tabs do not fit a
          phone without a second scrolling strip, so the phone gets one labelled
          selector that names the section it is on. */}
      {compact ? (
        <div className="pm-m-source pm-m-outreach-source" role="group" aria-label="Outreach section">
          <span className="pm-m-source-label" id="outreach-section-label">Section</span>
          {/* Real buttons, not a <select>: each section keeps its own mounted
              walkthrough anchor, and the tour can click one. */}
          <div className="pm-m-chip-row" role="group" aria-labelledby="outreach-section-label">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                className="pm-m-chip"
                aria-pressed={activeTab === tab.id}
                data-tour-id={{
                  crm: 'outreach.tab.contacts',
                  campaigns: 'outreach.tab.campaigns',
                  blog: 'outreach.tab.blog',
                }[tab.id]}
                onClick={() => setActiveTab(tab.id)}
              >
                <i className={tab.icon} aria-hidden="true" /> {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
      <div className="pm-outreach-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            data-tour-id={{
              crm: 'outreach.tab.contacts',
              campaigns: 'outreach.tab.campaigns',
              blog: 'outreach.tab.blog',
            }[tab.id]}
            className={`pm-outreach-tab-btn${activeTab === tab.id ? ' pm-outreach-tab-btn--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={tab.icon} aria-hidden="true" style={{ marginRight: 6 }} />
            {tab.label}
          </button>
        ))}
      </div>
      )}

      {/* Tab content */}
      <div ref={tabContentRef} className="pm-outreach-tab-content" role="tabpanel">
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
            onSafetyUpdate={(id, patch) => setSubmissions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))}
            onExpandBlog={async (submission) => {
              const isRegen = !!submission.blogSlug;
              if (isRegen && !window.confirm('A blog post already exists for this submission. Regenerate?')) return;
              try {
                const t = toast.loading('Expanding to blog post…');
                const updated = await post(`/api/outreach/submissions/${submission.id}/ai/expand-blog`);
                toast.dismiss(t);
                toast.success(
                  <span>
                    Blog draft {isRegen ? 'updated' : 'created'}.{' '}
                    <a href={`/clubpm/outreach/blog/${updated.blogPostId}/edit`} style={{ color: 'var(--pm-accent-teal)', textDecoration: 'underline' }}>Open editor</a>
                  </span>
                );
                setSubmissions(prev => prev.map(s => s.id === submission.id ? { ...s, blogSlug: updated.blogSlug } : s));
              } catch (err) {
                toast.error(err.message ?? 'Failed to expand');
              }
            }}
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
        {activeTab === 'blog' && <BlogTab />}
        {activeTab === 'insights' && (
          <InsightsTab submissions={submissions} isAdmin={!!member?.isAdmin} />
        )}
      </div>

      {/* FAB — create new submission. On a phone the Composer section already is
          the creation surface, and the button would sit on its sticky Send row. */}
      {!(compact && activeTab === 'composer') && (
        <button
          className="pm-fab"
          onClick={() => { setEditSubmission(null); setShowCreateModal(true); }}
          title="New submission"
          aria-label="Create new submission"
          style={{ bottom: 32 }}
        >
          +
        </button>
      )}

      {/* Create / Edit modal */}
      <SubmissionFormModal
        isOpen={showCreateModal}
        onClose={handleModalClose}
        onSave={handleSave}
        editSubmission={editSubmission}
        projects={projects}
        events={events}
      />

      {/* Activity feed sidebar */}
      <ActivityFeedSidebar
        isOpen={showActivity}
        onClose={() => setShowActivity(false)}
      />
    </div>
  );
}
