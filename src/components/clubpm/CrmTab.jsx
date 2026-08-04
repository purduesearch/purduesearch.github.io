import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import OrbitLoader from '../OrbitLoader';
import { get, post, patch, del } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────

const STAGES = [
  { id: 'COLD',      label: 'Cold',      color: '#7f8ea3' },
  { id: 'CONTACTED', label: 'Contacted', color: 'var(--pm-accent-amber)' },
  { id: 'ENGAGED',   label: 'Engaged',   color: '#a29bfe' },
  { id: 'ACTIVE',    label: 'Active',    color: 'var(--pm-accent-teal)' },
  { id: 'DORMANT',   label: 'Dormant',   color: '#636e72' },
];

const CONTACT_TYPES = [
  { value: 'SPONSOR',  label: 'Sponsor',  icon: 'fas fa-handshake' },
  { value: 'PRESS',    label: 'Press',    icon: 'fas fa-newspaper' },
  { value: 'PARTNER',  label: 'Partner',  icon: 'fas fa-link' },
  { value: 'PROSPECT', label: 'Prospect', icon: 'fas fa-user-plus' },
  { value: 'ALUMNI',   label: 'Alumni',   icon: 'fas fa-graduation-cap' },
];

const INTERACTION_TYPES = [
  { value: 'EMAIL',          label: 'Email',          icon: 'fas fa-envelope' },
  { value: 'MEETING',        label: 'Meeting',        icon: 'fas fa-users' },
  { value: 'CALL',           label: 'Call',           icon: 'fas fa-phone' },
  { value: 'NOTE',           label: 'Note',           icon: 'fas fa-sticky-note' },
  { value: 'EVENT_ATTENDED', label: 'Event Attended', icon: 'fas fa-calendar-check' },
];

const EMAIL_INTENTS = ['Sponsor intro', 'Press release', 'Follow-up', 'Partnership proposal', 'Event invitation'];

function fmtDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stageColor(id) {
  return STAGES.find(s => s.id === id)?.color ?? 'var(--pm-accent-teal)';
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

// ── Overlay shell ─────────────────────────────────────────────
//
// Every CRM overlay renders through this. Two things it guarantees that the
// previous inline markup did not:
//
//   1. It portals to <body>. The Outreach Hub runs its tab panels through
//      revealStagger(), which leaves an inline transform on the panel; an
//      element with any transform becomes the containing block for its
//      `position: fixed` children, so an overlay rendered in place anchored
//      itself to the tab panel and spilled past the page instead of covering
//      the viewport. Portalling puts it out of reach of that entirely.
//   2. Escape closes it, and the backdrop click only fires on the backdrop
//      itself rather than on anything that bubbles up from inside.

function Overlay({ className, children, onClose, labelledBy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>,
    document.body
  );
}

// ── CSV parser ────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return {
      name:         row['name']         || row['fullname'] || '',
      email:        row['email']        || '',
      phone:        row['phone']        || row['phonenumber'] || '',
      organization: row['organization'] || row['company']     || row['org'] || '',
      role:         row['role']         || row['title']       || '',
    };
  }).filter(r => r.name);
}

// ── ContactFormModal ──────────────────────────────────────────

function ContactFormModal({ initial, campaigns, onSave, onClose }) {
  const [name,         setName]         = useState(initial?.name ?? '');
  const [email,        setEmail]        = useState(initial?.email ?? '');
  const [phone,        setPhone]        = useState(initial?.phone ?? '');
  const [organization, setOrg]          = useState(initial?.organization ?? '');
  const [role,         setRole]         = useState(initial?.role ?? '');
  const [contactType,  setType]         = useState(initial?.contactType ?? 'PROSPECT');
  const [stage,        setStage]        = useState(initial?.stage ?? 'COLD');
  const [notes,        setNotes]        = useState(initial?.notes ?? '');
  const [nextFollowUp, setNextFollowUp] = useState(initial?.nextFollowUpAt ? initial.nextFollowUpAt.slice(0, 10) : '');
  const [campaignId,   setCampaign]     = useState(initial?.campaignId ?? '');
  const [tagsStr,      setTagsStr]      = useState((initial?.tags ?? []).join(', '));
  const [saving,       setSaving]       = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Enter a name before saving.'); return; }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        organization: organization.trim() || null,
        role: role.trim() || null,
        contactType,
        stage,
        notes: notes.trim() || null,
        nextFollowUpAt: nextFollowUp || null,
        campaignId: campaignId || null,
        tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay className="pm-modal-overlay" onClose={onClose} labelledBy="crm-contact-form-title">
      <div className="pm-modal-panel pm-crm-modal" data-tour-id="outreach.contact.form">
        <div className="pm-modal-header">
          <h2 className="pm-modal-title" id="crm-contact-form-title">
            <i className={`fas fa-${initial ? 'pen' : 'user-plus'}`} aria-hidden="true" />
            {' '}{initial ? 'Edit contact' : 'New contact'}
          </h2>
          <button type="button" className="pm-modal-close-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <form className="pm-crm-form" onSubmit={handleSubmit}>
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label" htmlFor="crm-name">Full name</label>
              <input id="crm-name" className="cpm-form-input" value={name} onChange={e => setName(e.target.value)} required autoFocus />
            </div>
            <div className="cpm-form-group">
              <label className="cpm-form-label" htmlFor="crm-org">Organization</label>
              <input id="crm-org" className="cpm-form-input" value={organization} onChange={e => setOrg(e.target.value)} placeholder="Company or institution" />
            </div>
          </div>
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label" htmlFor="crm-email">Email</label>
              <input id="crm-email" className="cpm-form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="cpm-form-group">
              <label className="cpm-form-label" htmlFor="crm-phone">Phone</label>
              <input id="crm-phone" className="cpm-form-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label" htmlFor="crm-role">Role or title</label>
              <input id="crm-role" className="cpm-form-input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. VP of Engineering" />
            </div>
            <div className="cpm-form-group">
              <label className="cpm-form-label" htmlFor="crm-type">Contact type</label>
              <select id="crm-type" className="cpm-form-select" value={contactType} onChange={e => setType(e.target.value)}>
                {CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label" htmlFor="crm-stage">Stage</label>
              <select id="crm-stage" className="cpm-form-select" value={stage} onChange={e => setStage(e.target.value)}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="cpm-form-group" data-tour-id="outreach.contact.followup">
              <label className="cpm-form-label" htmlFor="crm-followup">Next follow-up</label>
              <input id="crm-followup" className="cpm-form-input" type="date" value={nextFollowUp} onChange={e => setNextFollowUp(e.target.value)} />
            </div>
          </div>
          {campaigns.length > 0 && (
            <div className="cpm-form-group">
              <label className="cpm-form-label" htmlFor="crm-campaign">Campaign</label>
              <select id="crm-campaign" className="cpm-form-select" value={campaignId} onChange={e => setCampaign(e.target.value)}>
                <option value="">None</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="cpm-form-group">
            <label className="cpm-form-label" htmlFor="crm-tags">Tags</label>
            <input id="crm-tags" className="cpm-form-input" value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="aerospace, titanium-sponsor" />
            <span className="cpm-form-hint">Separate with commas.</span>
          </div>
          <div className="cpm-form-group">
            <label className="cpm-form-label" htmlFor="crm-notes">Notes</label>
            <textarea id="crm-notes" className="cpm-form-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Context, history, anything relevant" />
          </div>
          <div className="pm-crm-form-actions">
            <button type="button" className="cpm-btn cpm-btn--secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="cpm-btn cpm-btn--primary" disabled={saving}>
              {saving ? <span className="pm-bulk-spinner" aria-hidden="true" /> : <i className="fas fa-check" aria-hidden="true" />}
              {' '}{initial ? 'Save changes' : 'Create contact'}
            </button>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

// ── CsvImportModal ────────────────────────────────────────────

function CsvImportModal({ campaigns, onImported, onClose }) {
  const [csvText,     setCsvText]    = useState('');
  const [contactType, setType]       = useState('PROSPECT');
  const [campaignId,  setCampaign]   = useState('');
  const [rowCount,    setRowCount]   = useState(0);
  const [preview,     setPreview]    = useState([]);
  const [importing,   setImporting]  = useState(false);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result ?? '';
      const rows = parseCsv(text);
      setCsvText(text);
      setRowCount(rows.length);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const rows = parseCsv(csvText);
    if (rows.length === 0) { toast.error('That file has no rows with a name column.'); return; }
    setImporting(true);
    try {
      const { created } = await post('/api/outreach/contacts/import', { rows, contactType, campaignId: campaignId || null });
      toast.success(`Imported ${created} contact${created !== 1 ? 's' : ''}.`);
      onImported();
      onClose();
    } catch (err) {
      toast.error(err.message ?? 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Overlay className="pm-modal-overlay" onClose={onClose} labelledBy="crm-csv-title">
      <div className="pm-modal-panel pm-crm-modal">
        <div className="pm-modal-header">
          <h2 className="pm-modal-title" id="crm-csv-title">
            <i className="fas fa-file-csv" aria-hidden="true" /> Import from CSV
          </h2>
          <button type="button" className="pm-modal-close-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>
        <div className="pm-crm-form">
          <p className="pm-crm-import-hint">
            Columns read: <code>name</code>, <code>email</code>, <code>phone</code>, <code>organization</code>, <code>role</code>.
            Rows without a name are skipped.
          </p>
          <input
            ref={fileRef}
            id="crm-csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="pm-crm-file-input"
          />
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label" htmlFor="crm-csv-type">Contact type</label>
              <select id="crm-csv-type" className="cpm-form-select" value={contactType} onChange={e => setType(e.target.value)}>
                {CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {campaigns.length > 0 && (
              <div className="cpm-form-group">
                <label className="cpm-form-label" htmlFor="crm-csv-campaign">Campaign</label>
                <select id="crm-csv-campaign" className="cpm-form-select" value={campaignId} onChange={e => setCampaign(e.target.value)}>
                  <option value="">None</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {preview.length > 0 && (
            <div className="pm-crm-import-preview">
              <div className="pm-crm-import-preview-label">
                Preview <span className="pm-crm-num">{preview.length}</span> of <span className="pm-crm-num">{rowCount}</span> rows
              </div>
              <ul className="pm-crm-import-preview-list">
                {preview.map((r, i) => (
                  <li key={i}>
                    <strong>{r.name}</strong>
                    {r.email ? <span> · {r.email}</span> : null}
                    {r.organization ? <span> · {r.organization}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="pm-crm-form-actions">
            <button type="button" className="cpm-btn cpm-btn--secondary" onClick={onClose} disabled={importing}>Cancel</button>
            <button type="button" className="cpm-btn cpm-btn--primary" onClick={handleImport} disabled={!csvText || importing}>
              {importing ? <span className="pm-bulk-spinner" aria-hidden="true" /> : <i className="fas fa-upload" aria-hidden="true" />}
              {' '}Import{rowCount ? ` ${rowCount}` : ''}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ── ContactDrawer ─────────────────────────────────────────────

function ContactDrawer({ contactId, onClose, onUpdated, onEdit, onDelete, isAdmin, currentMemberId }) {
  const [contact,     setContact]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState('info');
  const [showIntForm, setShowIntForm] = useState(false);
  const [intType,     setIntType]     = useState('NOTE');
  const [intSummary,  setIntSummary]  = useState('');
  const [intDate,     setIntDate]     = useState('');
  const [savingInt,   setSavingInt]   = useState(false);
  const [emailIntent, setEmailIntent] = useState('');
  const [emailResult, setEmailResult] = useState(null);
  const [loadingEmail,setLoadingEmail]= useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    get(`/api/outreach/contacts/${contactId}`)
      .then(setContact)
      .catch(() => setContact(null))
      .finally(() => setLoading(false));
  }, [contactId]);

  useEffect(() => { reload(); }, [reload]);

  const handleStageChange = async (newStage) => {
    const prev = contact;
    setContact(c => c ? { ...c, stage: newStage } : c);
    try {
      const updated = await patch(`/api/outreach/contacts/${contactId}`, { stage: newStage });
      setContact(updated);
      onUpdated?.(updated);
    } catch (err) {
      setContact(prev);
      toast.error(err.message ?? 'Could not change the stage.');
    }
  };

  const handleLogInteraction = async (e) => {
    e.preventDefault();
    if (!intSummary.trim()) { toast.error('Add a summary before logging.'); return; }
    setSavingInt(true);
    try {
      const interaction = await post(`/api/outreach/contacts/${contactId}/interactions`, {
        type:      intType,
        summary:   intSummary.trim(),
        occurredAt: intDate || undefined,
      });
      setContact(prev => prev ? { ...prev, interactions: [interaction, ...(prev.interactions ?? [])] } : prev);
      setShowIntForm(false);
      setIntSummary(''); setIntDate('');
      toast.success('Interaction logged.');
    } catch (err) {
      toast.error(err.message ?? 'Could not log the interaction.');
    } finally {
      setSavingInt(false);
    }
  };

  const handleDeleteInteraction = async (iid) => {
    try {
      await del(`/api/outreach/contacts/${contactId}/interactions/${iid}`);
      setContact(prev => prev ? { ...prev, interactions: prev.interactions.filter(i => i.id !== iid) } : prev);
    } catch (err) {
      toast.error(err.message ?? 'Could not delete the interaction.');
    }
  };

  const handleGenerateEmail = async () => {
    if (!emailIntent) { toast.error('Pick an intent first.'); return; }
    setLoadingEmail(true);
    setEmailResult(null);
    try {
      const result = await post(`/api/outreach/contacts/${contactId}/email-template`, { intent: emailIntent });
      setEmailResult(result);
    } catch (err) {
      toast.error(err.message ?? 'Could not draft the email.');
    } finally {
      setLoadingEmail(false);
    }
  };

  if (loading) return (
    <Overlay className="pm-crm-drawer-overlay" onClose={onClose}>
      <aside className="pm-crm-drawer">
        <div className="pm-crm-drawer-loading"><OrbitLoader size={72} /></div>
      </aside>
    </Overlay>
  );

  if (!contact) return (
    <Overlay className="pm-crm-drawer-overlay" onClose={onClose}>
      <aside className="pm-crm-drawer">
        <div className="pm-crm-drawer-loading">
          <p className="pm-crm-empty-note">That contact could not be loaded. It may have been deleted.</p>
          <button type="button" className="cpm-btn cpm-btn--secondary" onClick={onClose}>Close</button>
        </div>
      </aside>
    </Overlay>
  );

  const typeMeta = CONTACT_TYPES.find(t => t.value === contact.contactType);
  const stageIndex = STAGES.findIndex(s => s.id === contact.stage);
  const followUpOverdue = isOverdue(contact.nextFollowUpAt);

  return (
    <Overlay className="pm-crm-drawer-overlay" onClose={onClose} labelledBy="crm-drawer-name">
      <aside className="pm-crm-drawer" style={{ '--stage': stageColor(contact.stage) }}>
        <header className="pm-crm-drawer-header">
          <div className="pm-crm-drawer-title-row">
            <span className="pm-crm-drawer-avatar" aria-hidden="true">
              <i className={typeMeta?.icon ?? 'fas fa-user'} />
            </span>
            <div className="pm-crm-drawer-name-block">
              <h2 className="pm-crm-drawer-name" id="crm-drawer-name">{contact.name}</h2>
              {(contact.role || contact.organization) && (
                <p className="pm-crm-drawer-subt">
                  {contact.role}{contact.role && contact.organization ? ' · ' : ''}{contact.organization}
                </p>
              )}
            </div>
            <button type="button" className="pm-modal-close-btn" onClick={onClose} aria-label="Close">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>

          {/* Stage rail — a position in the pipeline, so it reads as a position. */}
          <div className="pm-crm-stage-row" role="group" aria-label="Pipeline stage">
            {STAGES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`pm-crm-stage-btn${contact.stage === s.id ? ' pm-crm-stage-btn--active' : ''}${i < stageIndex ? ' pm-crm-stage-btn--passed' : ''}`}
                style={{ '--stage': s.color }}
                aria-pressed={contact.stage === s.id}
                onClick={() => handleStageChange(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {(contact.email || contact.phone) && (
            <div className="pm-crm-drawer-links">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="pm-crm-drawer-link">
                  <i className="fas fa-envelope" aria-hidden="true" /> {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="pm-crm-drawer-link">
                  <i className="fas fa-phone" aria-hidden="true" /> {contact.phone}
                </a>
              )}
            </div>
          )}

          {contact.nextFollowUpAt && (
            <div className={`pm-crm-followup-banner${followUpOverdue ? ' pm-crm-followup-banner--overdue' : ''}`}>
              <i className={`fas fa-${followUpOverdue ? 'exclamation-circle' : 'clock'}`} aria-hidden="true" />
              {followUpOverdue
                ? ` Follow-up was due ${fmtDate(contact.nextFollowUpAt)}`
                : ` Follow up by ${fmtDate(contact.nextFollowUpAt)}`}
            </div>
          )}

          <div className="pm-crm-drawer-actions">
            <button type="button" className="cpm-btn cpm-btn--secondary cpm-btn--sm" onClick={() => onEdit(contact)}>
              <i className="fas fa-pen" aria-hidden="true" /> Edit
            </button>
            {(isAdmin || contact.ownerId === currentMemberId) && (
              <button type="button" className="cpm-btn cpm-btn--danger cpm-btn--sm" onClick={() => onDelete(contact.id)}>
                <i className="fas fa-trash-alt" aria-hidden="true" /> Delete
              </button>
            )}
          </div>
        </header>

        <div className="pm-campaign-drawer-tabs" role="tablist">
          {[['info', 'Info'], ['timeline', 'Timeline'], ['email', 'Email']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              data-tour-id={id === 'timeline' ? 'outreach.contact.timeline' : undefined}
              aria-selected={activeTab === id}
              className={`pm-campaign-drawer-tab${activeTab === id ? ' pm-campaign-drawer-tab--active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pm-crm-drawer-body" role="tabpanel">
          {activeTab === 'info' && (
            <div className="pm-crm-info-grid">
              {contact.tags?.length > 0 && (
                <div className="pm-crm-info-row">
                  <span className="pm-crm-info-label">Tags</span>
                  <div className="pm-crm-tags">
                    {contact.tags.map(t => <span key={t} className="pm-crm-tag">{t}</span>)}
                  </div>
                </div>
              )}
              {contact.campaign && (
                <div className="pm-crm-info-row">
                  <span className="pm-crm-info-label">Campaign</span>
                  <span className="pm-crm-info-value" style={{ color: contact.campaign.color ?? 'var(--pm-accent-teal)' }}>
                    <i className="fas fa-flag" aria-hidden="true" /> {contact.campaign.name}
                  </span>
                </div>
              )}
              {contact.owner && (
                <div className="pm-crm-info-row">
                  <span className="pm-crm-info-label">Owner</span>
                  <span className="pm-crm-info-value">{contact.owner.displayName}</span>
                </div>
              )}
              {contact.lastContactedAt && (
                <div className="pm-crm-info-row">
                  <span className="pm-crm-info-label">Last contact</span>
                  <span className="pm-crm-info-value">{fmtDate(contact.lastContactedAt)}</span>
                </div>
              )}
              {contact.notes && (
                <div className="pm-crm-info-row pm-crm-info-row--full">
                  <span className="pm-crm-info-label">Notes</span>
                  <p className="pm-crm-notes">{contact.notes}</p>
                </div>
              )}
              {!contact.tags?.length && !contact.campaign && !contact.owner && !contact.lastContactedAt && !contact.notes && (
                <p className="pm-crm-empty-note">Nothing recorded yet. Use Edit to add tags, a campaign, or notes.</p>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div data-tour-id="outreach.contact.history">
              <button
                type="button"
                className="cpm-btn cpm-btn--secondary pm-crm-log-btn"
                onClick={() => setShowIntForm(v => !v)}
                aria-expanded={showIntForm}
              >
                <i className={`fas fa-${showIntForm ? 'times' : 'plus'}`} aria-hidden="true" />
                {showIntForm ? ' Cancel' : ' Log interaction'}
              </button>

              {showIntForm && (
                <form className="pm-crm-int-form" onSubmit={handleLogInteraction}>
                  <div className="pm-crm-form-row">
                    <div className="cpm-form-group">
                      <label className="cpm-form-label" htmlFor="crm-int-type">Type</label>
                      <select id="crm-int-type" className="cpm-form-select" value={intType} onChange={e => setIntType(e.target.value)}>
                        {INTERACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="cpm-form-group">
                      <label className="cpm-form-label" htmlFor="crm-int-date">Date</label>
                      <input id="crm-int-date" className="cpm-form-input" type="date" value={intDate} onChange={e => setIntDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="cpm-form-group">
                    <label className="cpm-form-label" htmlFor="crm-int-summary">Summary</label>
                    <textarea id="crm-int-summary" className="cpm-form-textarea" value={intSummary} onChange={e => setIntSummary(e.target.value)} rows={2} placeholder="What happened?" required />
                  </div>
                  <div className="pm-crm-form-actions">
                    <button type="submit" className="cpm-btn cpm-btn--primary" disabled={savingInt}>
                      {savingInt ? <span className="pm-bulk-spinner" aria-hidden="true" /> : <i className="fas fa-check" aria-hidden="true" />} Log it
                    </button>
                  </div>
                </form>
              )}

              {(contact.interactions ?? []).length === 0 ? (
                <p className="pm-crm-empty-note">No interactions yet. Log the first call, email, or meeting.</p>
              ) : (
                <ul className="pm-crm-timeline">
                  {(contact.interactions ?? []).map(int => {
                    const meta = INTERACTION_TYPES.find(t => t.value === int.type);
                    return (
                      <li key={int.id} className="pm-crm-timeline-item">
                        <span className="pm-crm-timeline-dot" aria-hidden="true">
                          <i className={meta?.icon ?? 'fas fa-circle'} />
                        </span>
                        <div className="pm-crm-timeline-body">
                          <div className="pm-crm-timeline-meta">
                            <span className="pm-crm-timeline-type">{meta?.label ?? int.type}</span>
                            <span className="pm-crm-timeline-date">{fmtDate(int.occurredAt)}</span>
                            {int.member && <span className="pm-crm-timeline-by">{int.member.displayName}</span>}
                          </div>
                          <p className="pm-crm-timeline-summary">{int.summary}</p>
                        </div>
                        {(isAdmin || int.memberId === currentMemberId) && (
                          <button
                            type="button"
                            className="pm-crm-timeline-del"
                            onClick={() => handleDeleteInteraction(int.id)}
                            aria-label={`Delete ${meta?.label ?? int.type} from ${fmtDate(int.occurredAt)}`}
                          >
                            <i className="fas fa-times" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'email' && (
            <div className="pm-crm-email-panel">
              {!contact.email && (
                <div className="pm-crm-email-no-addr">
                  <i className="fas fa-exclamation-circle" aria-hidden="true" />
                  {' '}No email address on file. You can still draft copy and paste it elsewhere.
                </div>
              )}
              <div className="cpm-form-group">
                <label className="cpm-form-label" htmlFor="crm-email-intent">What is this email for?</label>
                <select
                  id="crm-email-intent"
                  className="cpm-form-select"
                  value={emailIntent}
                  onChange={e => { setEmailIntent(e.target.value); setEmailResult(null); }}
                >
                  <option value="">Choose an intent</option>
                  {EMAIL_INTENTS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <button
                type="button"
                className="cpm-btn cpm-btn--primary cpm-btn--block"
                onClick={handleGenerateEmail}
                disabled={!emailIntent || loadingEmail}
              >
                {loadingEmail ? <span className="pm-bulk-spinner" aria-hidden="true" /> : <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />}
                {' '}{loadingEmail ? 'Drafting' : 'Draft with AI'}
              </button>

              {emailResult && (
                <div className="pm-crm-email-result">
                  <div className="pm-crm-email-subject">
                    <span className="pm-crm-info-label">Subject</span>
                    {emailResult.subject}
                  </div>
                  <pre className="pm-crm-email-body">{emailResult.body}</pre>
                  <div className="pm-crm-email-actions">
                    <button
                      type="button"
                      className="cpm-btn cpm-btn--secondary"
                      onClick={() => { navigator.clipboard.writeText(emailResult.body); toast.success('Body copied.'); }}
                    >
                      <i className="fas fa-copy" aria-hidden="true" /> Copy body
                    </button>
                    {contact.email && (
                      <a href={emailResult.mailto} className="cpm-btn cpm-btn--primary">
                        <i className="fas fa-envelope" aria-hidden="true" /> Open in mail
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </Overlay>
  );
}

// ── ContactCard ───────────────────────────────────────────────

const ContactCardBody = React.forwardRef(function ContactCardBody(
  { contact, className = '', style, ...rest }, ref
) {
  const typeMeta = CONTACT_TYPES.find(t => t.value === contact.contactType);
  const followUpOverdue = isOverdue(contact.nextFollowUpAt);

  return (
    <article ref={ref} className={`pm-crm-card ${className}`.trim()} style={style} {...rest}>
      <div className="pm-crm-card-header">
        <i className={typeMeta?.icon ?? 'fas fa-user'} aria-hidden="true" />
        <span className="pm-crm-card-name">{contact.name}</span>
      </div>
      {contact.organization && <div className="pm-crm-card-org">{contact.organization}</div>}
      {contact.tags?.length > 0 && (
        <div className="pm-crm-tags pm-crm-tags--compact">
          {contact.tags.slice(0, 2).map(t => <span key={t} className="pm-crm-tag">{t}</span>)}
          {contact.tags.length > 2 && <span className="pm-crm-tag pm-crm-tag--more">+{contact.tags.length - 2}</span>}
        </div>
      )}
      {(contact.nextFollowUpAt || contact._count?.interactions > 0) && (
        <div className="pm-crm-card-footer">
          {contact.nextFollowUpAt && (
            <span className={`pm-crm-card-followup${followUpOverdue ? ' pm-crm-card-followup--overdue' : ''}`}>
              <i className="fas fa-clock" aria-hidden="true" /> {fmtDate(contact.nextFollowUpAt)}
            </span>
          )}
          {contact._count?.interactions > 0 && (
            <span className="pm-crm-card-int-count">
              <i className="fas fa-history" aria-hidden="true" />
              <span className="pm-crm-num">{contact._count.interactions}</span>
            </span>
          )}
        </div>
      )}
    </article>
  );
});

function ContactCard({ contact, onOpen, tourId }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: contact.id,
    data: { stage: contact.stage },
  });

  return (
    <ContactCardBody
      ref={setNodeRef}
      contact={contact}
      data-tour-id={tourId}
      className={isDragging ? 'pm-crm-card--ghost' : ''}
      role="button"
      tabIndex={0}
      aria-label={`Open ${contact.name}`}
      onClick={() => onOpen(contact.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(contact.id); }
      }}
      {...listeners}
      {...attributes}
    />
  );
}

// ── StageColumn ───────────────────────────────────────────────

function StageColumn({ stage, contacts, onOpen, draggingId, tourCardId }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const showBerth = isOver && draggingId && !contacts.some(c => c.id === draggingId);

  return (
    <section className="pm-crm-col" style={{ '--stage': stage.color }}>
      <div className="pm-crm-col-head">
        <span className="pm-crm-col-dot" aria-hidden="true" />
        <h3 className="pm-crm-col-label">{stage.label}</h3>
        <span className="pm-crm-col-count pm-crm-num">{contacts.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`pm-crm-col-body${isOver ? ' pm-crm-col-body--over' : ''}`}
      >
        {contacts.map(c => (
          <ContactCard
            key={c.id}
            contact={c}
            onOpen={onOpen}
            tourId={c.id === tourCardId ? 'outreach.contact.card' : undefined}
          />
        ))}
        {showBerth && <div className="pm-crm-berth" aria-hidden="true">Drop to mark {stage.label}</div>}
        {contacts.length === 0 && !showBerth && (
          <p className="pm-crm-col-empty">No contacts</p>
        )}
      </div>
    </section>
  );
}

// ── CrmTab (exported) ─────────────────────────────────────────

export default function CrmTab({ isAdmin, currentMemberId, campaigns = [] }) {
  const [contacts,      setContacts]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [typeFilter,    setTypeFilter]    = useState('');
  const [q,             setQ]             = useState('');
  const [columns,       setColumns]       = useState({});
  const [showForm,      setShowForm]      = useState(false);
  const [editContact,   setEditContact]   = useState(null);
  const [openDrawerId,  setOpenDrawerId]  = useState(null);
  const [showCsvModal,  setShowCsvModal]  = useState(false);
  const [draggingId,    setDraggingId]    = useState(null);

  // A short activation distance keeps the card's click-to-open intact: a press
  // that never travels 5px is a click, anything further is a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const buildColumns = useCallback((list) => {
    const cols = {};
    STAGES.forEach(s => { cols[s.id] = []; });
    list.forEach(c => {
      if (cols[c.stage]) cols[c.stage].push(c);
      else cols['COLD'].push(c);
    });
    setColumns(cols);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (q)          params.set('q', q);
    get(`/api/outreach/contacts?${params}`)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setContacts(list);
        buildColumns(list);
      })
      .catch(() => { setContacts([]); setColumns({}); })
      .finally(() => setLoading(false));
  }, [typeFilter, q, buildColumns]);

  useEffect(() => { load(); }, [load]);

  const draggingContact = draggingId ? contacts.find(c => c.id === draggingId) : null;

  // The one card a walkthrough can reliably point at. Taken in board order (left
  // column first) rather than list order, because the board is what the learner
  // is looking at — the first card in `contacts` may sit in a column that is
  // scrolled off or empty of anything else.
  const tourCardId = useMemo(() => {
    for (const s of STAGES) {
      const first = (columns[s.id] ?? [])[0];
      if (first) return first.id;
    }
    return null;
  }, [columns]);

  const handleDragEnd = async ({ active, over }) => {
    setDraggingId(null);
    if (!over) return;

    const newStage = over.id;
    const moved = contacts.find(c => c.id === active.id);
    if (!moved || moved.stage === newStage) return;

    const optimistic = contacts.map(c => c.id === active.id ? { ...c, stage: newStage } : c);
    setContacts(optimistic);
    buildColumns(optimistic);

    try {
      await patch(`/api/outreach/contacts/${active.id}`, { stage: newStage });
    } catch (err) {
      setContacts(contacts);
      buildColumns(contacts);
      toast.error(err.message ?? 'Could not change the stage.');
    }
  };

  const handleCreate = async (data) => {
    const created = await post('/api/outreach/contacts', data);
    const newList = [created, ...contacts];
    setContacts(newList);
    buildColumns(newList);
    setShowForm(false);
    toast.success(`Added ${created.name}.`);
  };

  const handleUpdate = async (data) => {
    const updated = await patch(`/api/outreach/contacts/${editContact.id}`, data);
    const newList = contacts.map(c => c.id === updated.id ? updated : c);
    setContacts(newList);
    buildColumns(newList);
    setEditContact(null);
    toast.success('Contact updated.');
  };

  const handleDelete = async (id) => {
    const target = contacts.find(c => c.id === id);
    if (!window.confirm(`Delete ${target?.name ?? 'this contact'} and their interaction history?`)) return;
    try {
      await del(`/api/outreach/contacts/${id}`);
      const newList = contacts.filter(c => c.id !== id);
      setContacts(newList);
      buildColumns(newList);
      if (openDrawerId === id) setOpenDrawerId(null);
      toast.success('Contact deleted.');
    } catch (err) {
      toast.error(err.message ?? 'Delete failed.');
    }
  };

  const handleDrawerUpdate = (updated) => {
    const newList = contacts.map(c => c.id === updated.id ? { ...c, ...updated } : c);
    setContacts(newList);
    buildColumns(newList);
  };

  return (
    <div className="pm-crm-tab">
      <div className="pm-crm-header">
        <div className="pm-crm-header-copy">
          <h2 className="pm-campaigns-title">
            <i className="fas fa-address-book" aria-hidden="true" /> CRM
          </h2>
          <p className="pm-campaigns-subtitle">
            Sponsors, press, partners, prospects, and alumni — and where each one stands.
          </p>
        </div>
        <div className="pm-crm-header-actions">
          <button type="button" className="cpm-btn cpm-btn--secondary" onClick={() => setShowCsvModal(true)}>
            <i className="fas fa-file-csv" aria-hidden="true" /> Import CSV
          </button>
          <button
            type="button"
            className="cpm-btn cpm-btn--primary"
            data-tour-id="outreach.contact.new"
            onClick={() => { setEditContact(null); setShowForm(true); }}
          >
            <i className="fas fa-user-plus" aria-hidden="true" /> New contact
          </button>
        </div>
      </div>

      <div className="pm-crm-filters">
        <div className="pm-board-campaign-filter" role="group" aria-label="Filter by contact type">
          <button
            type="button"
            className={`pm-campaign-chip${!typeFilter ? ' pm-campaign-chip--active' : ''}`}
            onClick={() => setTypeFilter('')}
          >
            All <span className="pm-crm-num">{contacts.length}</span>
          </button>
          {CONTACT_TYPES.map(t => {
            const count = contacts.filter(c => c.contactType === t.value).length;
            return (
              <button
                key={t.value}
                type="button"
                className={`pm-campaign-chip${typeFilter === t.value ? ' pm-campaign-chip--active' : ''}`}
                onClick={() => setTypeFilter(prev => prev === t.value ? '' : t.value)}
              >
                <i className={t.icon} aria-hidden="true" /> {t.label} <span className="pm-crm-num">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="pm-crm-search">
          <i className="fas fa-search" aria-hidden="true" />
          <input
            className="pm-crm-search-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name, org, email"
            aria-label="Search contacts"
          />
          {q && (
            <button type="button" className="pm-crm-search-clear" onClick={() => setQ('')} aria-label="Clear search">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="pm-outreach-loading" style={{ minHeight: 200 }}>
          <OrbitLoader size={72} />
        </div>
      ) : contacts.length === 0 ? (
        <div className="pm-crm-blank">
          <i className="fas fa-address-book" aria-hidden="true" />
          <p>{q || typeFilter ? 'No contacts match those filters.' : 'No contacts yet.'}</p>
          {!q && !typeFilter && (
            <button type="button" className="cpm-btn cpm-btn--primary" onClick={() => { setEditContact(null); setShowForm(true); }}>
              <i className="fas fa-user-plus" aria-hidden="true" /> Add the first contact
            </button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={({ active }) => setDraggingId(active.id)}
          onDragCancel={() => setDraggingId(null)}
          onDragEnd={handleDragEnd}
        >
          <div className="pm-crm-board">
            {STAGES.map(stage => (
              <StageColumn
                key={stage.id}
                stage={stage}
                contacts={columns[stage.id] ?? []}
                onOpen={setOpenDrawerId}
                draggingId={draggingId}
                tourCardId={tourCardId}
              />
            ))}
          </div>

          {createPortal(
            <DragOverlay dropAnimation={null}>
              {draggingContact && (
                <ContactCardBody
                  contact={draggingContact}
                  className="pm-crm-card--lifted"
                  style={{ '--stage': stageColor(draggingContact.stage) }}
                />
              )}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      )}

      {(showForm || editContact) && (
        <ContactFormModal
          initial={editContact}
          campaigns={campaigns}
          onSave={editContact ? handleUpdate : handleCreate}
          onClose={() => { setShowForm(false); setEditContact(null); }}
        />
      )}

      {showCsvModal && (
        <CsvImportModal
          campaigns={campaigns}
          onImported={load}
          onClose={() => setShowCsvModal(false)}
        />
      )}

      {openDrawerId && !editContact && (
        <ContactDrawer
          contactId={openDrawerId}
          onClose={() => setOpenDrawerId(null)}
          onUpdated={handleDrawerUpdate}
          onEdit={(c) => { setEditContact(c); }}
          onDelete={handleDelete}
          isAdmin={isAdmin}
          currentMemberId={currentMemberId}
        />
      )}
    </div>
  );
}
