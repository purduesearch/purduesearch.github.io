import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MiniMonthCalendar from './MiniMonthCalendar';
import {
  buildSlotStarts, decomposeSlots, localTimeZone, SLOT_SIZES,
} from './meetingPollUtils';

const AUDIENCES = [
  { value: 'INVITED', icon: 'fas fa-user-check',  label: 'Invited',  hint: 'Only members you invite' },
  { value: 'PROJECT', icon: 'fas fa-users',       label: 'Project',  hint: 'Whole project team' },
  { value: 'ANYONE',  icon: 'fas fa-link',        label: 'Anyone',   hint: 'Link-holders + guests' },
];

// minutes-past-midnight ⇄ "HH:MM"
const toHM  = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (hm)  => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

function toLocalDatetime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const EMPTY = {
  title: '', description: '', projectId: '',
  audience: 'INVITED', invitedMemberIds: [], allowLinkResponses: false,
  dates: [], startMin: 540, endMin: 1020, slotMinutes: 30,
  responseDeadline: '',
};

export default function MeetingPollModal({ isOpen, onClose, onSave, editPoll, projects = [], members = [] }) {
  const [form, setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const timezone = editPoll?.timezone || localTimeZone();

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSearch('');
    if (editPoll) {
      const { dates, startMin, endMin } = decomposeSlots(editPoll.slotStarts ?? [], editPoll.timezone || localTimeZone());
      setForm({
        title: editPoll.title ?? '',
        description: editPoll.description ?? '',
        projectId: editPoll.projectId ?? editPoll.project?.id ?? '',
        audience: editPoll.audience ?? 'INVITED',
        invitedMemberIds: (editPoll.invitedMembers ?? []).map(m => m.id ?? m),
        allowLinkResponses: editPoll.allowLinkResponses ?? false,
        dates,
        startMin,
        endMin,
        slotMinutes: editPoll.slotMinutes ?? 30,
        responseDeadline: toLocalDatetime(editPoll.responseDeadline),
      });
    } else {
      setForm(EMPTY);
    }
  }, [isOpen, editPoll]);

  if (!isOpen) return null;

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleMember = (id) => set(
    'invitedMemberIds',
    form.invitedMemberIds.includes(id)
      ? form.invitedMemberIds.filter(x => x !== id)
      : [...form.invitedMemberIds, id],
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.title.trim())          { setError('Give the meeting a title.'); return; }
    if (form.dates.length === 0)     { setError('Add at least one candidate date.'); return; }
    if (form.endMin <= form.startMin){ setError('End time must be after start time.'); return; }
    const slotMinutes = Math.floor(Number(form.slotMinutes));
    if (!slotMinutes || slotMinutes < 1) { setError('Enter a slot size of at least 1 minute.'); return; }

    const slotStarts = buildSlotStarts(form.dates, form.startMin, form.endMin, slotMinutes);
    if (slotStarts.length === 0)     { setError('That window produces no time slots.'); return; }
    if (slotStarts.length > 3000)    { setError('That’s a lot of slots — use a larger slot size or fewer dates/hours.'); return; }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      projectId: form.projectId || null,
      audience: form.audience,
      // Redundant on ANYONE polls (everyone may already respond), so it is never
      // sent from there — keeps the stored flag honest if the audience changes.
      allowLinkResponses: form.audience !== 'ANYONE' && form.allowLinkResponses,
      invitedMemberIds: form.audience === 'INVITED' ? form.invitedMemberIds : [],
      slotStarts,
      slotMinutes,
      timezone,
      responseDeadline: form.responseDeadline ? new Date(form.responseDeadline).toISOString() : null,
    };

    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err?.message ?? 'Failed to save poll.');
    } finally {
      setSaving(false);
    }
  }

  const filteredMembers = members.filter(m =>
    !search || (m.displayName ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const smNum = Math.floor(Number(form.slotMinutes)) || 0;
  const slotCount = (form.endMin > form.startMin && smNum > 0)
    ? form.dates.length * Math.ceil((form.endMin - form.startMin) / smNum)
    : 0;

  const modal = (
    <div className="cpm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cpm-event-modal" style={{ borderTop: '3px solid var(--pm-accent-teal, #00e5cc)' }} onClick={e => e.stopPropagation()}>
        <div className="cpm-event-modal-header">
          <h2 className="cpm-event-modal-title">
            <span className="cpm-event-modal-icon" style={{ background: 'var(--pm-accent-teal, #00e5cc)', color: '#04211f' }}>
              <i className="fas fa-calendar-check" />
            </span>
            {editPoll ? 'Edit Meeting Poll' : 'New Meeting Poll'}
          </h2>
          <button type="button" className="cpm-icon-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>

        <form id="poll-form" onSubmit={handleSubmit} className="cpm-event-modal-body">
          {/* Title */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">Title <span style={{ color: '#e17055' }}>*</span></label>
            <input className="cpm-form-input" type="text" value={form.title}
              onChange={e => set('title', e.target.value)} placeholder="What are we scheduling?" autoFocus />
          </div>

          {/* Description */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">Description</label>
            <textarea className="cpm-form-input" rows={2} value={form.description}
              onChange={e => set('description', e.target.value)} placeholder="Optional details / agenda" />
          </div>

          {/* Project */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">Project</label>
            <select className="cpm-form-input" value={form.projectId} onChange={e => set('projectId', e.target.value)}>
              <option value="">— None —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Audience */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">Who can respond</label>
            <div className="pm-poll-audience-grid">
              {AUDIENCES.map(a => {
                const active = form.audience === a.value;
                return (
                  <button key={a.value} type="button" className="pm-poll-audience-btn"
                    style={active ? { borderColor: 'var(--pm-accent-teal,#00e5cc)', background: 'rgba(0,229,204,0.12)' } : {}}
                    onClick={() => set('audience', a.value)}>
                    <i className={a.icon} style={{ color: active ? 'var(--pm-accent-teal,#00e5cc)' : undefined }} />
                    <span className="pm-poll-audience-label">{a.label}</span>
                    <span className="pm-poll-audience-hint">{a.hint}</span>
                  </button>
                );
              })}
            </div>

            {/* Escape hatch: assign people *and* keep a working share link. */}
            {form.audience !== 'ANYONE' && (
              <label className="pm-poll-link-toggle">
                <input
                  type="checkbox"
                  checked={form.allowLinkResponses}
                  onChange={e => set('allowLinkResponses', e.target.checked)}
                />
                <span>
                  <span className="pm-poll-link-toggle-label">
                    <i className="fas fa-link" /> Also let anyone with the link respond
                  </span>
                  <span className="pm-poll-link-toggle-hint">
                    Guests can add their name without signing in. Invited members still get
                    the notification and see it on their calendar.
                  </span>
                </span>
              </label>
            )}
          </div>

          {/* Invited members (INVITED only) */}
          {form.audience === 'INVITED' && (
            <div className="cpm-form-field">
              <label className="cpm-form-label">
                Invite members
                {form.invitedMemberIds.length > 0 && <span className="pm-poll-count-pill">{form.invitedMemberIds.length}</span>}
              </label>

              {/* Selected avatars summary */}
              {form.invitedMemberIds.length > 0 && (
                <div className="pm-poll-selected-avatars">
                  {form.invitedMemberIds.map(id => {
                    const m = members.find(x => x.id === id);
                    if (!m) return null;
                    return (
                      <button key={id} type="button" className="pm-poll-selected-avatar"
                        title={`Remove ${m.displayName}`} onClick={() => toggleMember(id)}>
                        {m.avatarUrl
                          ? <img src={m.avatarUrl} alt="" />
                          : <span className="pm-poll-avatar-initial">{(m.displayName ?? '?')[0].toUpperCase()}</span>}
                        <span className="pm-poll-selected-avatar-x"><i className="fas fa-times" /></span>
                      </button>
                    );
                  })}
                </div>
              )}

              <input className="cpm-form-input" type="text" value={search}
                onChange={e => setSearch(e.target.value)} placeholder="Search members…" style={{ margin: '4px 0 8px' }} />
              <div className="pm-poll-member-picker">
                {filteredMembers.slice(0, 60).map(m => {
                  const active = form.invitedMemberIds.includes(m.id);
                  return (
                    <div key={m.id} className={`cpm-attendee-item${active ? ' selected' : ''}`}
                      onClick={() => toggleMember(m.id)}>
                      <span className="cpm-attendee-check">{active && <i className="fas fa-check" />}</span>
                      {m.avatarUrl
                        ? <img src={m.avatarUrl} alt="" className="cpm-attendee-avatar" />
                        : <span className="cpm-attendee-initial">{(m.displayName ?? '?')[0].toUpperCase()}</span>}
                      <span className="pm-poll-member-name">{m.displayName}</span>
                    </div>
                  );
                })}
                {filteredMembers.length === 0 && <div className="pm-poll-hint" style={{ padding: 8 }}>No members match “{search}”.</div>}
              </div>
            </div>
          )}

          {/* Candidate dates — when2meet-style calendar (click or drag to select) */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">
              Candidate dates <span style={{ color: '#e17055' }}>*</span>
              <span className="pm-poll-hint" style={{ marginTop: 0, marginLeft: 8, display: 'inline' }}>click or drag to select</span>
            </label>
            <MiniMonthCalendar selected={form.dates} onChange={dates => set('dates', dates)} />
          </div>

          {/* Time window + slot size */}
          <div className="cpm-form-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="cpm-form-field" style={{ flex: 1, minWidth: 110 }}>
              <label className="cpm-form-label">From</label>
              <input className="cpm-form-input" type="time" value={toHM(form.startMin)}
                onChange={e => set('startMin', toMin(e.target.value))} />
            </div>
            <div className="cpm-form-field" style={{ flex: 1, minWidth: 110 }}>
              <label className="cpm-form-label">To</label>
              <input className="cpm-form-input" type="time" value={toHM(form.endMin)}
                onChange={e => set('endMin', toMin(e.target.value))} />
            </div>
            <div className="cpm-form-field" style={{ flex: 1, minWidth: 130 }}>
              <label className="cpm-form-label">Slot size (min)</label>
              <input className="cpm-form-input" type="number" min={1} step={1}
                value={form.slotMinutes}
                onChange={e => set('slotMinutes', e.target.value === '' ? '' : Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                placeholder="30" />
              <div className="pm-poll-slot-presets">
                {SLOT_SIZES.map(s => (
                  <button key={s} type="button"
                    className={`pm-poll-slot-preset${Number(form.slotMinutes) === s ? ' is-active' : ''}`}
                    onClick={() => set('slotMinutes', s)}>{s}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Response deadline */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">Response deadline (optional)</label>
            <input className="cpm-form-input" type="datetime-local" value={form.responseDeadline}
              onChange={e => set('responseDeadline', e.target.value)} />
            <span className="pm-poll-hint">Members are reminded ~24h before this. Times shown in {timezone}. {slotCount > 0 && `≈ ${slotCount} slots.`}</span>
          </div>

          {error && <div className="pm-poll-error"><i className="fas fa-exclamation-triangle" /> {error}</div>}
        </form>

        <div className="cpm-event-modal-footer">
          <button type="button" className="cpm-btn cpm-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="poll-form" className="cpm-btn cpm-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : (editPoll ? 'Save changes' : 'Create poll')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
