import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const EVENT_TYPE_CONFIG = {
  MEETING:  { icon: 'fas fa-users',              color: '#00cec9', label: 'Meeting'  },
  DEADLINE: { icon: 'fas fa-flag',               color: '#e17055', label: 'Deadline' },
  WORKSHOP: { icon: 'fas fa-chalkboard-teacher', color: '#fdcb6e', label: 'Workshop' },
  SOCIAL:   { icon: 'fas fa-star',               color: '#a29bfe', label: 'Social'   },
  OTHER:    { icon: 'fas fa-calendar-day',        color: '#636e72', label: 'Other'    },
};

const RECURRENCE_OPTIONS = [
  { value: 'weekly',   label: 'Weekly'   },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly',  label: 'Monthly'  },
];

function toLocalDateString(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toLocalTimeString(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combineDatetime(dateStr, timeStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T${timeStr || '00:00'}:00`).toISOString();
}

const EMPTY = {
  title: '', type: 'MEETING',
  startDate: '', startTime: '',
  endDate: '', endTime: '',
  location: '', isVirtual: false,
  projectId: '', notes: '',
  isRecurring: false, recurrencePattern: 'weekly', recurrenceEndDate: '',
  attendeeIds: [],
};

export default function EventFormModal({ isOpen, onClose, onSave, editEvent, projects = [], members = [] }) {
  const [form, setForm]         = useState(EMPTY);
  const [showAll, setShowAll]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editEvent) {
      setForm({
        title: editEvent.title ?? '',
        type: editEvent.type ?? 'MEETING',
        startDate: toLocalDateString(editEvent.startTime),
        startTime: toLocalTimeString(editEvent.startTime),
        endDate: toLocalDateString(editEvent.endTime),
        endTime: toLocalTimeString(editEvent.endTime),
        location: editEvent.location ?? '',
        isVirtual: editEvent.isVirtual ?? false,
        projectId: editEvent.projectId ?? '',
        notes: editEvent.notes ?? '',
        isRecurring: editEvent.isRecurring ?? false,
        recurrencePattern: editEvent.recurrencePattern ?? 'weekly',
        recurrenceEndDate: toLocalDateString(editEvent.recurrenceEndDate),
        attendeeIds: (editEvent.attendees ?? []).map(a => a.id ?? a),
      });
    } else {
      setForm(EMPTY);
    }
    setShowAll(false);
    setSearch('');
  }, [isOpen, editEvent]);

  if (!isOpen) return null;

  const typeCfg = EVENT_TYPE_CONFIG[form.type] ?? EVENT_TYPE_CONFIG.OTHER;

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleAttendee(id) {
    setForm(prev => ({
      ...prev,
      attendeeIds: prev.attendeeIds.includes(id)
        ? prev.attendeeIds.filter(x => x !== id)
        : [...prev.attendeeIds, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.startDate) return;
    const payload = {
      title: form.title.trim(),
      type: form.type,
      startTime: combineDatetime(form.startDate, form.startTime),
      endTime: form.endDate ? combineDatetime(form.endDate, form.endTime) : undefined,
      location: form.isVirtual ? undefined : (form.location.trim() || undefined),
      isVirtual: form.isVirtual,
      projectId: form.projectId || undefined,
      notes: form.notes.trim() || undefined,
      isRecurring: form.isRecurring,
      recurrencePattern: form.isRecurring ? form.recurrencePattern : undefined,
      recurrenceEndDate: form.isRecurring && form.recurrenceEndDate
        ? new Date(form.recurrenceEndDate).toISOString() : undefined,
      attendeeIds: form.attendeeIds,
    };
    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const filteredMembers = members.filter(m =>
    !search || (m.displayName ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const visibleMembers = showAll ? filteredMembers : filteredMembers.slice(0, 8);
  const canSubmit = form.title.trim() && form.startDate && !saving;

  const modal = (
    <div
      className="cpm-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="cpm-event-modal"
        style={{ borderTop: `3px solid ${typeCfg.color}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="cpm-event-modal-header">
          <h2 className="cpm-event-modal-title">
            <span
              className="cpm-event-modal-icon"
              style={{ background: typeCfg.color, color: '#fff' }}
            >
              <i className={typeCfg.icon} />
            </span>
            {editEvent ? 'Edit Event' : 'New Event'}
          </h2>
          <button
            type="button"
            className="cpm-icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <form id="event-form" onSubmit={handleSubmit} className="cpm-event-modal-body">

          {/* Title */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">
              Title <span style={{ color: '#e17055' }}>*</span>
            </label>
            <input
              className="cpm-form-input"
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What's happening?"
              required
              autoFocus
            />
          </div>

          {/* Type */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">Type</label>
            <div className="cpm-event-type-grid">
              {Object.entries(EVENT_TYPE_CONFIG).map(([type, cfg]) => {
                const active = form.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    className="cpm-event-type-btn"
                    style={active ? {
                      borderColor: cfg.color,
                      background: `${cfg.color}18`,
                      color: cfg.color,
                    } : {}}
                    onClick={() => set('type', type)}
                  >
                    <i className={cfg.icon} style={{ color: active ? cfg.color : undefined }} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">
              Starts <span style={{ color: '#e17055' }}>*</span>
            </label>
            <div className="cpm-datetime-row">
              <input
                className="cpm-form-input"
                type="date"
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
                required
              />
              <input
                className="cpm-form-input"
                type="time"
                value={form.startTime}
                onChange={e => set('startTime', e.target.value)}
              />
            </div>
          </div>

          {/* End */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">
              Ends <span style={{ color: 'var(--clubpm-text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <div className="cpm-datetime-row">
              <input
                className="cpm-form-input"
                type="date"
                value={form.endDate}
                onChange={e => set('endDate', e.target.value)}
              />
              <input
                className="cpm-form-input"
                type="time"
                value={form.endTime}
                onChange={e => set('endTime', e.target.value)}
              />
            </div>
          </div>

          {/* Location + Virtual */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">Location</label>
            <div className="cpm-location-row">
              <input
                className="cpm-form-input"
                type="text"
                value={form.isVirtual ? '' : form.location}
                onChange={e => set('location', e.target.value)}
                placeholder={form.isVirtual ? 'Virtual / Online' : 'Room, building, or address'}
                disabled={form.isVirtual}
              />
              <button
                type="button"
                className={`cpm-virtual-btn${form.isVirtual ? ' active' : ''}`}
                onClick={() => set('isVirtual', !form.isVirtual)}
              >
                <i className="fas fa-video" />
                Virtual
              </button>
            </div>
          </div>

          {/* Project */}
          {projects.length > 0 && (
            <div className="cpm-form-field">
              <label className="cpm-form-label">
                Project <span style={{ color: 'var(--clubpm-text-muted)', fontWeight: 400 }}>(optional)</span>
              </label>
              <select
                className="cpm-form-select"
                value={form.projectId}
                onChange={e => set('projectId', e.target.value)}
              >
                <option value="">None</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">
              Notes <span style={{ color: 'var(--clubpm-text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              className="cpm-form-input"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Additional details, agenda, or links…"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Recurring toggle */}
          <div>
            <label
              className="cpm-toggle-row"
              onClick={() => set('isRecurring', !form.isRecurring)}
            >
              <span className="cpm-toggle-row-label">
                <i className="fas fa-redo" style={{ color: 'var(--clubpm-text-muted)', fontSize: 12 }} />
                Recurring event
              </span>
              <input
                type="checkbox"
                className="cpm-toggle-switch"
                checked={form.isRecurring}
                onChange={() => {}}
              />
            </label>

            {form.isRecurring && (
              <div className="cpm-recurrence-panel">
                <div className="cpm-form-field" style={{ marginBottom: 0 }}>
                  <label className="cpm-form-label">Repeat</label>
                  <select
                    className="cpm-form-select"
                    value={form.recurrencePattern}
                    onChange={e => set('recurrencePattern', e.target.value)}
                  >
                    {RECURRENCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="cpm-form-field" style={{ marginBottom: 0 }}>
                  <label className="cpm-form-label">
                    Until <span style={{ color: 'var(--clubpm-text-muted)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    className="cpm-form-input"
                    type="date"
                    value={form.recurrenceEndDate}
                    onChange={e => set('recurrenceEndDate', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Attendees */}
          {members.length > 0 && (
            <div className="cpm-form-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="cpm-form-label">
                  Attendees
                  {form.attendeeIds.length > 0 && (
                    <span style={{ marginLeft: 6, color: 'var(--clubpm-accent-cyan)', fontWeight: 700 }}>
                      {form.attendeeIds.length}
                    </span>
                  )}
                </label>
                {form.attendeeIds.length > 0 && (
                  <button
                    type="button"
                    className="cpm-link-btn"
                    onClick={() => set('attendeeIds', [])}
                  >
                    Clear all
                  </button>
                )}
              </div>

              {members.length > 5 && (
                <input
                  className="cpm-form-input"
                  type="text"
                  placeholder="Search members…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ marginBottom: 4 }}
                />
              )}

              <div className="cpm-attendee-list">
                {visibleMembers.map(m => {
                  const selected = form.attendeeIds.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      className={`cpm-attendee-item${selected ? ' selected' : ''}`}
                      onClick={() => toggleAttendee(m.id)}
                    >
                      <span className="cpm-attendee-check">
                        {selected && <i className="fas fa-check" />}
                      </span>
                      {m.avatarUrl
                        ? <img src={m.avatarUrl} alt="" className="cpm-attendee-avatar" />
                        : <span className="cpm-attendee-initial">
                            {(m.displayName ?? '?')[0].toUpperCase()}
                          </span>
                      }
                      <span style={{ fontSize: 13, color: 'var(--clubpm-text-secondary)' }}>
                        {m.displayName}
                      </span>
                    </div>
                  );
                })}

                {filteredMembers.length > 8 && (
                  <button
                    type="button"
                    className="cpm-link-btn"
                    style={{ alignSelf: 'flex-start', padding: '4px 8px', fontSize: 12 }}
                    onClick={() => setShowAll(v => !v)}
                  >
                    {showAll ? 'Show less' : `Show all ${filteredMembers.length} members`}
                  </button>
                )}

                {filteredMembers.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--clubpm-text-muted)', padding: '4px 8px' }}>
                    No members match
                  </span>
                )}
              </div>
            </div>
          )}

        </form>

        {/* Footer */}
        <div className="cpm-event-modal-footer">
          <button
            type="button"
            className="cpm-btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="event-form"
            className="cpm-btn-primary"
            disabled={!canSubmit}
            style={{ padding: '9px 20px', fontSize: 13 }}
          >
            {saving
              ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Saving…</>
              : <><i className="fas fa-check" style={{ marginRight: 6 }} />{editEvent ? 'Save Changes' : 'Create Event'}</>
            }
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
