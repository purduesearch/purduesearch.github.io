import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { get } from '../../api/clubPmClient';

const TYPE_OPTIONS = [
  { value: 'SOCIAL_POST',   label: 'Social Post' },
  { value: 'NEWSLETTER',    label: 'Newsletter' },
  { value: 'PHOTO',         label: 'Photo' },
  { value: 'VIDEO',         label: 'Video' },
  { value: 'ANNOUNCEMENT',  label: 'Announcement' },
  { value: 'EVENT_PROMO',   label: 'Event Promo' },
];

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin',  label: 'LinkedIn' },
  { value: 'twitter',   label: 'Twitter' },
  { value: 'website',   label: 'Website' },
];

const MAX_MEDIA_URLS = 5;

const PLATFORM_LIMITS = {
  instagram: 2200,
  linkedin:  3000,
  twitter:   280,
  website:   null,
};

const PLATFORM_ICONS = {
  instagram: 'fab fa-instagram',
  linkedin:  'fab fa-linkedin',
  twitter:   'fab fa-twitter',
  website:   'fas fa-globe',
};

// ── Hashtag autocomplete helpers ──────────────────────────────────────────────

function getHashtagAtCursor(value, cursorPos) {
  const before = value.slice(0, cursorPos);
  const match = before.match(/#([a-zA-Z][a-zA-Z0-9_]*)$/);
  return match ? match[1] : null;
}

function insertHashtag(tag, value, cursorPos) {
  const before = value.slice(0, cursorPos);
  const after = value.slice(cursorPos);
  const replaced = before.replace(/#([a-zA-Z][a-zA-Z0-9_]*)$/, `#${tag} `);
  return replaced + after;
}

function useHashtagAutocomplete(content, setContent) {
  const [dropdownItems, setDropdownItems] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const dropdownRef = useRef(null);
  const debounceTimer = useRef(null);
  // Keep a ref to the textarea so we can read/set cursor position
  const textareaRef = useRef(null);

  const closeDropdown = useCallback(() => {
    setDropdownItems(null);
    setSelectedIdx(0);
  }, []);

  const fetchHashtags = useCallback((term) => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        const data = await get(`/api/outreach/hashtags?q=${encodeURIComponent(term)}`);
        // data is expected to be an array of { tag, count } objects
        const items = Array.isArray(data) ? data.slice(0, 8) : [];
        if (items.length === 0) {
          setDropdownItems(null);
        } else {
          setDropdownItems(items);
          setSelectedIdx(0);
        }
      } catch {
        setDropdownItems(null);
      }
    }, 200);
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => clearTimeout(debounceTimer.current);
  }, []);

  const onInput = useCallback((e) => {
    const ta = e.target;
    const term = getHashtagAtCursor(ta.value, ta.selectionStart);
    if (term) {
      fetchHashtags(term);
    } else {
      clearTimeout(debounceTimer.current);
      closeDropdown();
    }
  }, [fetchHashtags, closeDropdown]);

  const insertSuggestion = useCallback((tag) => {
    const ta = textareaRef.current;
    const cursorPos = ta ? ta.selectionStart : content.length;
    const newValue = insertHashtag(tag, content, cursorPos);
    setContent(newValue);
    closeDropdown();
    // Restore focus and move cursor after inserted text
    if (ta) {
      requestAnimationFrame(() => {
        ta.focus();
        const before = content.slice(0, cursorPos);
        const replaced = before.replace(/#([a-zA-Z][a-zA-Z0-9_]*)$/, `#${tag} `);
        const newCursor = replaced.length;
        ta.setSelectionRange(newCursor, newCursor);
      });
    }
  }, [content, setContent, closeDropdown]);

  const onKeyDown = useCallback((e) => {
    if (!dropdownItems || dropdownItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => (i + 1) % dropdownItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => (i - 1 + dropdownItems.length) % dropdownItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = dropdownItems[selectedIdx];
      if (item) insertSuggestion(item.tag);
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  }, [dropdownItems, selectedIdx, insertSuggestion, closeDropdown]);

  const onBlur = useCallback(() => {
    // Delay so a click on a suggestion item registers before the dropdown closes
    setTimeout(() => {
      // Check if focus moved inside the dropdown
      if (dropdownRef.current && dropdownRef.current.contains(document.activeElement)) return;
      closeDropdown();
    }, 150);
  }, [closeDropdown]);

  return {
    dropdownItems,
    selectedIdx,
    onKeyDown,
    onInput,
    onBlur,
    insertSuggestion,
    dropdownRef,
    textareaRef,
  };
}

// ── Character counters ─────────────────────────────────────────────────────────

function CharCounters({ content, platforms }) {
  const limited = platforms.filter(p => PLATFORM_LIMITS[p] != null);
  if (limited.length === 0) return null;

  const len = content.length;
  const twitterLimit = 280;
  const showThread = platforms.includes('twitter') && len > twitterLimit;
  const threadCount = Math.ceil(len / twitterLimit);

  return (
    <div>
      <div className="pm-char-counter-row">
        {limited.map(p => {
          const limit = PLATFORM_LIMITS[p];
          const pct = len / limit;
          let chipClass = 'pm-char-chip';
          if (pct >= 1) chipClass += ' pm-char-chip--error';
          else if (pct >= 0.8) chipClass += ' pm-char-chip--warn';
          return (
            <span key={p} className={chipClass}>
              <i className={PLATFORM_ICONS[p]} aria-hidden="true" />
              {len}/{limit}
            </span>
          );
        })}
      </div>
      {showThread && (
        <p className="pm-char-thread-note">
          Thread needed ({threadCount} tweets)
        </p>
      )}
    </div>
  );
}

function formatEventOption(ev) {
  if (!ev) return '';
  const d = ev.startTime ? new Date(ev.startTime) : null;
  const dateStr = d
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  return dateStr ? `${ev.title} — ${dateStr}` : ev.title;
}

function buildInitialState(editSubmission) {
  if (!editSubmission) {
    return {
      title: '',
      type: 'SOCIAL_POST',
      content: '',
      platform: [],
      projectId: '',
      eventId: '',
      mediaUrls: [''],
      scheduledAt: '',
      status: 'DRAFT',
    };
  }
  return {
    title: editSubmission.title ?? '',
    type: editSubmission.type ?? 'SOCIAL_POST',
    content: editSubmission.content ?? '',
    platform: editSubmission.platform ?? [],
    projectId: editSubmission.projectId ?? '',
    eventId: editSubmission.eventId ?? '',
    mediaUrls: editSubmission.mediaUrls?.length ? editSubmission.mediaUrls : [''],
    scheduledAt: editSubmission.scheduledAt
      ? editSubmission.scheduledAt.slice(0, 16)
      : '',
    status: editSubmission.status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT',
  };
}

export default function SubmissionFormModal({
  isOpen,
  onClose,
  onSave,
  editSubmission,
  projects = [],
  events = [],
}) {
  const [form, setForm] = useState(() => buildInitialState(editSubmission));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const setContent = useCallback((value) => {
    setForm(prev => ({ ...prev, content: value }));
  }, []);

  const hashtagAC = useHashtagAutocomplete(form.content, setContent);

  // Re-init form when editSubmission changes or modal opens
  useEffect(() => {
    setForm(buildInitialState(editSubmission));
    setError(null);
    setSaving(false);
  }, [editSubmission, isOpen]);

  if (!isOpen) return null;

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function togglePlatform(val) {
    setForm(prev => {
      const next = prev.platform.includes(val)
        ? prev.platform.filter(p => p !== val)
        : [...prev.platform, val];
      return { ...prev, platform: next };
    });
  }

  function setMediaUrl(index, value) {
    setForm(prev => {
      const next = [...prev.mediaUrls];
      next[index] = value;
      return { ...prev, mediaUrls: next };
    });
  }

  function addMediaUrl() {
    if (form.mediaUrls.length >= MAX_MEDIA_URLS) return;
    setForm(prev => ({ ...prev, mediaUrls: [...prev.mediaUrls, ''] }));
  }

  function removeMediaUrl(index) {
    setForm(prev => {
      const next = prev.mediaUrls.filter((_, i) => i !== index);
      return { ...prev, mediaUrls: next.length ? next : [''] };
    });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        content: form.content.trim() || undefined,
        platform: form.platform,
        projectId: form.projectId || undefined,
        eventId: form.eventId || undefined,
        mediaUrls: form.mediaUrls.map(u => u.trim()).filter(Boolean),
        scheduledAt: form.scheduledAt || undefined,
        status: form.status,
      };
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Failed to save submission.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    background: 'var(--clubpm-surface-300)',
    border: '1px solid var(--clubpm-border)',
    color: 'var(--clubpm-text-primary)',
    fontSize: 13,
    boxSizing: 'border-box',
    outline: 'none',
  };

  const isEditing = Boolean(editSubmission);

  return createPortal(
    <div
      className="cpm-modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="pm-submission-modal">
        {/* Header */}
        <div className="pm-submission-modal-header">
          <span className="pm-submission-modal-title">
            {isEditing ? 'Edit Submission' : 'New Submission'}
          </span>
          <button
            className="pm-submission-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="pm-submission-modal-body">
          {/* Title */}
          <div className="pm-submission-field">
            <label className="pm-submission-label">
              Title <span className="pm-submission-required">*</span>
            </label>
            <input
              type="text"
              style={inputStyle}
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="e.g. April Hydroponic Update"
              required
            />
          </div>

          {/* Type */}
          <div className="pm-submission-field">
            <label className="pm-submission-label">Type</label>
            <select
              style={inputStyle}
              value={form.type}
              onChange={e => setField('type', e.target.value)}
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div className="pm-submission-field" style={{ position: 'relative' }}>
            <label className="pm-submission-label">
              Content
              <span className="pm-submission-hint"> (caption / post text)</span>
            </label>
            <textarea
              ref={hashtagAC.textareaRef}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
              value={form.content}
              onChange={e => {
                setField('content', e.target.value);
                hashtagAC.onInput(e);
              }}
              onKeyDown={hashtagAC.onKeyDown}
              onBlur={hashtagAC.onBlur}
              placeholder="Write your caption or post body here…"
              rows={4}
            />
            {hashtagAC.dropdownItems && hashtagAC.dropdownItems.length > 0 && (
              <div className="pm-hashtag-dropdown" ref={hashtagAC.dropdownRef}>
                {hashtagAC.dropdownItems.map((item, idx) => (
                  <div
                    key={item.tag}
                    className={`pm-hashtag-item${idx === hashtagAC.selectedIdx ? ' pm-hashtag-item--active' : ''}`}
                    onMouseDown={e => {
                      e.preventDefault(); // prevent textarea blur before click registers
                      hashtagAC.insertSuggestion(item.tag);
                    }}
                  >
                    <span>#{item.tag}</span>
                    <span className="pm-hashtag-count">{item.count} uses</span>
                  </div>
                ))}
              </div>
            )}
            <CharCounters content={form.content} platforms={form.platform} />
          </div>

          {/* Platforms */}
          <div className="pm-submission-field">
            <label className="pm-submission-label">Platforms</label>
            <div className="pm-submission-checkboxes">
              {PLATFORM_OPTIONS.map(opt => (
                <label key={opt.value} className="pm-submission-checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.platform.includes(opt.value)}
                    onChange={() => togglePlatform(opt.value)}
                    className="pm-submission-checkbox"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Project linker */}
          <div className="pm-submission-field">
            <label className="pm-submission-label">Link to Project</label>
            <select
              style={inputStyle}
              value={form.projectId}
              onChange={e => setField('projectId', e.target.value)}
            >
              <option value="">None</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Event linker */}
          <div className="pm-submission-field">
            <label className="pm-submission-label">Link to Event</label>
            <select
              style={inputStyle}
              value={form.eventId}
              onChange={e => setField('eventId', e.target.value)}
            >
              <option value="">None</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{formatEventOption(ev)}</option>
              ))}
            </select>
          </div>

          {/* Media URLs */}
          <div className="pm-submission-field">
            <label className="pm-submission-label">
              Media URLs
              <span className="pm-submission-hint"> (up to {MAX_MEDIA_URLS})</span>
            </label>
            <div className="pm-submission-media-list">
              {form.mediaUrls.map((url, i) => (
                <div key={i} className="pm-submission-media-row">
                  <input
                    type="url"
                    style={{ ...inputStyle, flex: 1 }}
                    value={url}
                    onChange={e => setMediaUrl(i, e.target.value)}
                    placeholder="https://…"
                  />
                  {form.mediaUrls.length > 1 && (
                    <button
                      type="button"
                      className="pm-submission-media-remove"
                      onClick={() => removeMediaUrl(i)}
                      aria-label="Remove URL"
                    >
                      <i className="fas fa-times" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {form.mediaUrls.length < MAX_MEDIA_URLS && (
              <button
                type="button"
                className="pm-submission-add-url-btn"
                onClick={addMediaUrl}
              >
                <i className="fas fa-plus" aria-hidden="true" /> Add URL
              </button>
            )}
          </div>

          {/* Schedule date/time */}
          <div className="pm-submission-field">
            <label className="pm-submission-label">
              Schedule Date &amp; Time
              <span className="pm-submission-hint"> (optional)</span>
            </label>
            <input
              type="datetime-local"
              style={inputStyle}
              value={form.scheduledAt}
              onChange={e => setField('scheduledAt', e.target.value)}
            />
          </div>

          {/* Status toggle */}
          <div className="pm-submission-field">
            <label className="pm-submission-label">Save as</label>
            <div className="pm-submission-status-toggle">
              <label className="pm-submission-radio-label">
                <input
                  type="radio"
                  name="submission-status"
                  value="DRAFT"
                  checked={form.status === 'DRAFT'}
                  onChange={() => setField('status', 'DRAFT')}
                  className="pm-submission-radio"
                />
                <span className="pm-submission-radio-pill pm-submission-radio-pill--draft">
                  Draft
                </span>
              </label>
              <label className="pm-submission-radio-label">
                <input
                  type="radio"
                  name="submission-status"
                  value="SUBMITTED"
                  checked={form.status === 'SUBMITTED'}
                  onChange={() => setField('status', 'SUBMITTED')}
                  className="pm-submission-radio"
                />
                <span className="pm-submission-radio-pill pm-submission-radio-pill--submitted">
                  Submit for Review
                </span>
              </label>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="pm-submission-error">{error}</p>
          )}

          {/* Footer actions */}
          <div className="pm-submission-modal-footer">
            <button
              type="button"
              className="cpm-filter-clear-btn"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cpm-filter-apply-btn"
              disabled={saving}
            >
              {saving
                ? (isEditing ? 'Saving…' : 'Creating…')
                : (isEditing ? 'Save Changes' : (form.status === 'SUBMITTED' ? 'Submit for Review' : 'Save Draft'))
              }
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
