import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import AvatarPortrait from '../avatar/AvatarPortrait';
import { get, assignCourse } from '../../../api/clubPmClient';

// Admin assignment: enrol members in a course with an optional due date.
//
// `POST /:id/assign` upserts, so re-assigning someone who has already started
// only updates their due date and assigner — it never resets their progress.
// Nothing acts on `dueDate` automatically (no overdue cron, no Slack nudge —
// deliberately out of scope); it is shown in the catalog, the matrix and the
// member drawer for a human to act on.

export default function CourseAssignModal({
  courseId,
  courseTitle,
  enrolledMemberIds = [],
  onClose,
  onAssigned,
}) {
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery]       = useState('');
  const [picked, setPicked]     = useState(() => new Set());
  const [dueDate, setDueDate]   = useState('');
  const [saving, setSaving]     = useState(false);

  const enrolled = useMemo(() => new Set(enrolledMemberIds), [enrolledMemberIds]);

  useEffect(() => {
    let cancelled = false;
    get('/api/members')
      .then((data) => { if (!cancelled) setMembers(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? members.filter((m) => (
        (m.displayName ?? '').toLowerCase().includes(q)
          || (m.slackHandle ?? '').toLowerCase().includes(q)
          || (m.title ?? '').toLowerCase().includes(q)
      ))
      : members;
    // Members who still need assigning float to the top.
    return [...rows].sort((a, b) => {
      const ea = enrolled.has(a.id) ? 1 : 0;
      const eb = enrolled.has(b.id) ? 1 : 0;
      if (ea !== eb) return ea - eb;
      return (a.displayName ?? '').localeCompare(b.displayName ?? '');
    });
  }, [members, query, enrolled]);

  const toggle = useCallback((id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = () => {
    setPicked((prev) => {
      const next = new Set(prev);
      const unpicked = visible.filter((m) => !next.has(m.id));
      if (unpicked.length === 0) visible.forEach((m) => next.delete(m.id));
      else unpicked.forEach((m) => next.add(m.id));
      return next;
    });
  };

  const handleAssign = async () => {
    const memberIds = [...picked];
    if (!memberIds.length) { toast.error('Pick at least one member'); return; }
    setSaving(true);
    try {
      // A bare yyyy-mm-dd parses as UTC midnight, which lands on the previous
      // day for anyone west of Greenwich. Pin it to the end of the local day so
      // "due the 5th" means the whole of the 5th.
      const due = dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null;
      await assignCourse(courseId, memberIds, due);
      toast.success(`Assigned to ${memberIds.length} member${memberIds.length === 1 ? '' : 's'}`);
      onAssigned?.();
      onClose();
    } catch (err) {
      toast.error(err.message ?? 'Could not assign this course');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <>
      <div className="pm-drawer-overlay" onClick={onClose} />
      <div className="pm-course-assign-modal" role="dialog" aria-modal="true" aria-label="Assign course">
        <div className="pm-course-assign-head">
          <h2>
            <i className="fas fa-user-plus" aria-hidden="true" /> Assign “{courseTitle}”
          </h2>
          <button type="button" className="cpm-blog-meta-panel-close" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="pm-course-assign-controls">
          <input
            className="cpm-form-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members"
            aria-label="Search members"
          />
          <label className="pm-course-assign-due">
            <span className="cpm-form-label">Due date</span>
            <input
              className="cpm-form-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <p className="cpm-course-drawer-note">Loading members…</p>
        ) : loadError ? (
          <p className="cpm-course-drawer-note">Could not load the member roster.</p>
        ) : (
          <>
            <div className="pm-course-assign-toolbar">
              <button type="button" className="clubpm-btn-secondary" onClick={selectAllVisible}>
                {visible.every((m) => picked.has(m.id)) && visible.length > 0
                  ? 'Clear shown'
                  : 'Select shown'}
              </button>
              <span className="cpm-blog-meta-hint">{picked.size} selected</span>
            </div>

            <ul className="pm-course-assign-list">
              {visible.map((m) => {
                const already = enrolled.has(m.id);
                return (
                  <li key={m.id}>
                    <label className="pm-course-assign-row">
                      <input
                        type="checkbox"
                        checked={picked.has(m.id)}
                        onChange={() => toggle(m.id)}
                      />
                      <AvatarPortrait member={m} size={28} />
                      <span className="pm-course-assign-name">
                        {m.displayName}
                        {m.title && <span className="cpm-blog-meta-hint"> — {m.title}</span>}
                      </span>
                      {already && (
                        <span className="cpm-tag" title="Already enrolled — assigning updates the due date">
                          Enrolled
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
              {visible.length === 0 && (
                <li><p className="cpm-course-drawer-note">No members match “{query}”.</p></li>
              )}
            </ul>
          </>
        )}

        <div className="pm-course-assign-actions">
          <span className="cpm-blog-meta-hint">
            Re-assigning someone who has already started only updates their due date.
          </span>
          <button type="button" className="clubpm-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="clubpm-btn-primary"
            onClick={handleAssign}
            disabled={saving || picked.size === 0}
          >
            {saving ? 'Assigning…' : `Assign${picked.size ? ` (${picked.size})` : ''}`}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
