import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  buildSlotStarts, decomposeSlots, localTimeZone, fmtDayLabel, SLOT_SIZES,
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
  audience: 'INVITED', invitedMemberIds: [],
  dates: [], startMin: 540, endMin: 1020, slotMinutes: 30,
  responseDeadline: '',
};

export default function MeetingPollModal({ isOpen, onClose, onSave, editPoll, projects = [], members = [] }) {
  const [form, setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [newDate, setNewDate] = useState('');
  const [error, setError] = useState('');
  const timezone = editPoll?.timezone || localTimeZone();

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSearch('');
    setNewDate('');
    if (editPoll) {
      const { dates, startMin, endMin } = decomposeSlots(editPoll.slotStarts ?? [], editPoll.timezone || localTimeZone());
      setForm({
        title: editPoll.title ?? '',
        description: editPoll.description ?? '',
        projectId: editPoll.projectId ?? editPoll.project?.id ?? '',
        audience: editPoll.audience ?? 'INVITED',
        invitedMemberIds: (editPoll.invitedMembers ?? []).map(m => m.id ?? m),
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

  function addDate() {
    if (!newDate || form.dates.includes(newDate)) { setNewDate(''); return; }
    set('dates', [...form.dates, newDate].sort());
    setNewDate('');
  }
  const removeDate = (d) => set('dates', form.dates.filter(x => x !== d));

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

    const slotStarts = buildSlotStarts(form.dates, form.startMin, form.endMin, form.slotMinutes);
    if (slotStarts.length === 0)     { setError('That window produces no time slots.'); return; }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      projectId: form.projectId || null,
      audience: form.audience,
      invitedMemberIds: form.audience === 'INVITED' ? form.invitedMemberIds : [],
      slotStarts,
      slotMinutes: form.slotMinutes,
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
  const slotCount = form.endMin > form.startMin
    ? form.dates.length * Math.ceil((form.endMin - form.startMin) / form.slotMinutes)
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
          </div>

          {/* Invited members (INVITED only) */}
          {form.audience === 'INVITED' && (
            <div className="cpm-form-field">
              <label className="cpm-form-label">Invite members ({form.invitedMemberIds.length})</label>
              <input className="cpm-form-input" type="text" value={search}
                onChange={e => setSearch(e.target.value)} placeholder="Search members…" style={{ marginBottom: 8 }} />
              <div className="pm-poll-member-list">
                {filteredMembers.slice(0, 40).map(m => {
                  const active = form.invitedMemberIds.includes(m.id);
                  return (
                    <button key={m.id} type="button" className="pm-poll-member-chip"
                      style={active ? { borderColor: 'var(--pm-accent-teal,#00e5cc)', background: 'rgba(0,229,204,0.12)' } : {}}
                      onClick={() => toggleMember(m.id)}>
                      {active && <i className="fas fa-check" style={{ fontSize: 10 }} />}
                      {m.displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Candidate dates */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">Candidate dates <span style={{ color: '#e17055' }}>*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="cpm-form-input" type="date" value={newDate}
                onChange={e => setNewDate(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDate(); } }} />
              <button type="button" className="cpm-btn cpm-btn-ghost" onClick={addDate}>Add</button>
            </div>
            {form.dates.length > 0 && (
              <div className="pm-poll-date-chips">
                {form.dates.map(d => (
                  <span key={d} className="pm-poll-date-chip">
                    {fmtDayLabel(d)}
                    <button type="button" onClick={() => removeDate(d)} aria-label="Remove date"><i className="fas fa-times" /></button>
                  </span>
                ))}
              </div>
            )}
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
            <div className="cpm-form-field" style={{ flex: 1, minWidth: 110 }}>
              <label className="cpm-form-label">Slot size</label>
              <select className="cpm-form-input" value={form.slotMinutes}
                onChange={e => set('slotMinutes', Number(e.target.value))}>
                {SLOT_SIZES.map(s => <option key={s} value={s}>{s} min</option>)}
              </select>
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
