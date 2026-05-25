import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { get, post, patch, del } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────

const STAGES = [
  { id: 'COLD',      label: 'Cold',      color: 'var(--pm-text-secondary)' },
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

function typeIcon(contactType) {
  return CONTACT_TYPES.find(t => t.value === contactType)?.icon ?? 'fas fa-user';
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
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
    if (!name.trim()) { toast.error('Name is required.'); return; }
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
    <div className="pm-modal-overlay" onClick={onClose}>
      <div className="pm-modal-panel pm-crm-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-modal-header">
          <h2 className="pm-modal-title">
            <i className={`fas fa-${initial ? 'edit' : 'user-plus'}`} aria-hidden="true" />
            {' '}{initial ? 'Edit Contact' : 'New Contact'}
          </h2>
          <button className="pm-modal-close-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <form className="pm-crm-form" onSubmit={handleSubmit}>
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label">Full Name *</label>
              <input className="cpm-form-input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="cpm-form-group">
              <label className="cpm-form-label">Organization</label>
              <input className="cpm-form-input" value={organization} onChange={e => setOrg(e.target.value)} placeholder="Company / Institution" />
            </div>
          </div>
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label">Email</label>
              <input className="cpm-form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="cpm-form-group">
              <label className="cpm-form-label">Phone</label>
              <input className="cpm-form-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label">Role / Title</label>
              <input className="cpm-form-input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. VP of Engineering" />
            </div>
            <div className="cpm-form-group">
              <label className="cpm-form-label">Contact Type</label>
              <select className="cpm-form-select" value={contactType} onChange={e => setType(e.target.value)}>
                {CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label">Stage</label>
              <select className="cpm-form-select" value={stage} onChange={e => setStage(e.target.value)}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="cpm-form-group">
              <label className="cpm-form-label">Next Follow-Up</label>
              <input className="cpm-form-input" type="date" value={nextFollowUp} onChange={e => setNextFollowUp(e.target.value)} />
            </div>
          </div>
          {campaigns.length > 0 && (
            <div className="cpm-form-group">
              <label className="cpm-form-label">Campaign</label>
              <select className="cpm-form-select" value={campaignId} onChange={e => setCampaign(e.target.value)}>
                <option value="">None</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="cpm-form-group">
            <label className="cpm-form-label">Tags <span style={{ fontWeight: 400, color: 'var(--clubpm-text-secondary)' }}>(comma-separated)</span></label>
            <input className="cpm-form-input" value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="e.g. aerospace, titanium-sponsor" />
          </div>
          <div className="cpm-form-group">
            <label className="cpm-form-label">Notes</label>
            <textarea className="cpm-form-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Context, history, anything relevant…" />
          </div>
          <div className="pm-bv-form-actions">
            <button type="button" className="cpm-btn cpm-btn--secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="cpm-btn cpm-btn--primary" disabled={saving}>
              {saving ? <span className="pm-bulk-spinner" /> : <i className="fas fa-save" />}
              {' '}{initial ? 'Save Changes' : 'Create Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CsvImportModal ────────────────────────────────────────────

function CsvImportModal({ campaigns, onImported, onClose }) {
  const [csvText,     setCsvText]    = useState('');
  const [contactType, setType]       = useState('PROSPECT');
  const [campaignId,  setCampaign]   = useState('');
  const [preview,     setPreview]    = useState([]);
  const [importing,   setImporting]  = useState(false);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result ?? '';
      setCsvText(text);
      setPreview(parseCsv(text).slice(0, 5));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const rows = parseCsv(csvText);
    if (rows.length === 0) { toast.error('No valid rows found in CSV.'); return; }
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
    <div className="pm-modal-overlay" onClick={onClose}>
      <div className="pm-modal-panel pm-crm-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-modal-header">
          <h2 className="pm-modal-title"><i className="fas fa-file-csv" /> CSV Import</h2>
          <button className="pm-modal-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        <div className="pm-crm-form">
          <p className="pm-crm-import-hint">
            Expected columns: <code>name, email, phone, organization, role</code>
          </p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="pm-crm-file-input" />
          <div className="pm-crm-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label">Contact Type</label>
              <select className="cpm-form-select" value={contactType} onChange={e => setType(e.target.value)}>
                {CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {campaigns.length > 0 && (
              <div className="cpm-form-group">
                <label className="cpm-form-label">Campaign</label>
                <select className="cpm-form-select" value={campaignId} onChange={e => setCampaign(e.target.value)}>
                  <option value="">None</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {preview.length > 0 && (
            <div className="pm-crm-import-preview">
              <div className="pm-crm-import-preview-label">Preview ({preview.length} of {parseCsv(csvText).length} rows)</div>
              <ul className="pm-crm-import-preview-list">
                {preview.map((r, i) => (
                  <li key={i}><strong>{r.name}</strong>{r.email ? ` · ${r.email}` : ''}{r.organization ? ` · ${r.organization}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="pm-bv-form-actions">
            <button className="cpm-btn cpm-btn--secondary" onClick={onClose}>Cancel</button>
            <button className="cpm-btn cpm-btn--primary" onClick={handleImport} disabled={!csvText || importing}>
              {importing ? <span className="pm-bulk-spinner" /> : <i className="fas fa-upload" />}
              {' '}Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ContactDrawer ─────────────────────────────────────────────

function ContactDrawer({ contactId, onClose, onUpdated, isAdmin, currentMemberId }) {
  const [contact,     setContact]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState('info');
  const [showIntForm, setShowIntForm] = useState(false);
  const [intType,     setIntType]     = useState('NOTE');
  const [intSummary,  setIntSummary]  = useState('');
  const [intDate,     setIntDate]     = useState('');
  const [savingInt,   setSavingInt]   = useState(false);
  const [showEmail,   setShowEmail]   = useState(false);
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
    try {
      const updated = await patch(`/api/outreach/contacts/${contactId}`, { stage: newStage });
      setContact(updated);
      onUpdated?.(updated);
    } catch (err) {
      toast.error(err.message ?? 'Failed to update stage.');
    }
  };

  const handleLogInteraction = async (e) => {
    e.preventDefault();
    if (!intSummary.trim()) { toast.error('Summary is required.'); return; }
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
      toast.error(err.message ?? 'Failed to log interaction.');
    } finally {
      setSavingInt(false);
    }
  };

  const handleDeleteInteraction = async (iid) => {
    try {
      await del(`/api/outreach/contacts/${contactId}/interactions/${iid}`);
      setContact(prev => prev ? { ...prev, interactions: prev.interactions.filter(i => i.id !== iid) } : prev);
    } catch (err) {
      toast.error(err.message ?? 'Failed to delete.');
    }
  };

  const handleGenerateEmail = async () => {
    if (!emailIntent) { toast.error('Select an intent first.'); return; }
    setLoadingEmail(true);
    setEmailResult(null);
    try {
      const result = await post(`/api/outreach/contacts/${contactId}/email-template`, { intent: emailIntent });
      setEmailResult(result);
    } catch (err) {
      toast.error(err.message ?? 'AI email generation failed.');
    } finally {
      setLoadingEmail(false);
    }
  };

  if (loading) return (
    <div className="pm-crm-drawer-overlay" onClick={onClose}>
      <div className="pm-crm-drawer" onClick={e => e.stopPropagation()}>
        <div className="pm-outreach-loading"><div className="pm-outreach-spinner" /></div>
      </div>
    </div>
  );

  if (!contact) return null;

  const typeMeta = CONTACT_TYPES.find(t => t.value === contact.contactType);
  const stageMeta = STAGES.find(s => s.id === contact.stage);
  const followUpOverdue = isOverdue(contact.nextFollowUpAt);

  return (
    <div className="pm-crm-drawer-overlay" onClick={onClose}>
      <div className="pm-crm-drawer" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pm-crm-drawer-header">
          <div className="pm-crm-drawer-title-row">
            <div className="pm-crm-drawer-avatar">
              <i className={typeMeta?.icon ?? 'fas fa-user'} aria-hidden="true" style={{ color: 'var(--pm-accent-teal)', fontSize: 18 }} />
            </div>
            <div className="pm-crm-drawer-name-block">
              <h2 className="pm-crm-drawer-name">{contact.name}</h2>
              {(contact.role || contact.organization) && (
                <div className="pm-crm-drawer-subt">
                  {contact.role}{contact.role && contact.organization ? ' · ' : ''}{contact.organization}
                </div>
              )}
            </div>
            <button className="pm-modal-close-btn" onClick={onClose} aria-label="Close">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>

          {/* Stage selector */}
          <div className="pm-crm-stage-row">
            {STAGES.map(s => (
              <button
                key={s.id}
                className={`pm-crm-stage-btn${contact.stage === s.id ? ' pm-crm-stage-btn--active' : ''}`}
                style={contact.stage === s.id ? { borderColor: s.color, color: s.color, background: s.color + '18' } : {}}
                onClick={() => handleStageChange(s.id)}
                title={s.label}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Contact links */}
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

          {contact.nextFollowUpAt && (
            <div className={`pm-crm-followup-banner${followUpOverdue ? ' pm-crm-followup-banner--overdue' : ''}`}>
              <i className={`fas fa-${followUpOverdue ? 'exclamation-circle' : 'clock'}`} aria-hidden="true" />
              {' '}Follow-up: {fmtDate(contact.nextFollowUpAt)}{followUpOverdue ? ' (overdue)' : ''}
            </div>
          )}
        </div>

        {/* Sub-tabs */}
        <div className="pm-campaign-drawer-tabs">
          {['info', 'timeline', 'email'].map(t => (
            <button
              key={t}
              className={`pm-campaign-drawer-tab${activeTab === t ? ' pm-campaign-drawer-tab--active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t === 'info' ? 'Info' : t === 'timeline' ? 'Timeline' : 'Email'}
            </button>
          ))}
        </div>

        <div className="pm-crm-drawer-body">
          {/* Info tab */}
          {activeTab === 'info' && (
            <div className="pm-crm-info-grid">
              {contact.tags?.length > 0 && (
                <div className="pm-crm-info-row">
                  <span className="pm-crm-info-label">Tags</span>
                  <div className="pm-crm-tags">
                    {contact.tags.map(t => (
                      <span key={t} className="pm-crm-tag">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {contact.campaign && (
                <div className="pm-crm-info-row">
                  <span className="pm-crm-info-label">Campaign</span>
                  <span className="pm-crm-info-value" style={{ color: contact.campaign.color ?? 'var(--pm-accent-teal)' }}>
                    <i className="fas fa-flag" aria-hidden="true" style={{ marginRight: 5 }} />{contact.campaign.name}
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
                  <span className="pm-crm-info-label">Last Contact</span>
                  <span className="pm-crm-info-value">{fmtDate(contact.lastContactedAt)}</span>
                </div>
              )}
              {contact.notes && (
                <div className="pm-crm-info-row pm-crm-info-row--full">
                  <span className="pm-crm-info-label">Notes</span>
                  <p className="pm-crm-notes">{contact.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Timeline tab */}
          {activeTab === 'timeline' && (
            <div>
              <button
                className="cpm-btn cpm-btn--secondary pm-crm-log-btn"
                onClick={() => setShowIntForm(v => !v)}
              >
                <i className="fas fa-plus" aria-hidden="true" /> Log Interaction
              </button>

              {showIntForm && (
                <form className="pm-crm-int-form" onSubmit={handleLogInteraction}>
                  <div className="pm-crm-form-row">
                    <div className="cpm-form-group">
                      <label className="cpm-form-label">Type</label>
                      <select className="cpm-form-select" value={intType} onChange={e => setIntType(e.target.value)}>
                        {INTERACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="cpm-form-group">
                      <label className="cpm-form-label">Date</label>
                      <input className="cpm-form-input" type="date" value={intDate} onChange={e => setIntDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="cpm-form-group">
                    <label className="cpm-form-label">Summary *</label>
                    <textarea className="cpm-form-textarea" value={intSummary} onChange={e => setIntSummary(e.target.value)} rows={2} placeholder="What happened?" required />
                  </div>
                  <div className="pm-bv-form-actions">
                    <button type="button" className="cpm-btn cpm-btn--secondary" onClick={() => setShowIntForm(false)}>Cancel</button>
                    <button type="submit" className="cpm-btn cpm-btn--primary" disabled={savingInt}>
                      {savingInt ? <span className="pm-bulk-spinner" /> : <i className="fas fa-plus" />} Log
                    </button>
                  </div>
                </form>
              )}

              {(contact.interactions ?? []).length === 0 ? (
                <div className="pm-outreach-empty" style={{ padding: '20px 0' }}>
                  <i className="fas fa-history" aria-hidden="true" />
                  <p>No interactions logged yet.</p>
                </div>
              ) : (
                <ul className="pm-crm-timeline">
                  {(contact.interactions ?? []).map(int => {
                    const meta = INTERACTION_TYPES.find(t => t.value === int.type);
                    return (
                      <li key={int.id} className="pm-crm-timeline-item">
                        <div className="pm-crm-timeline-dot">
                          <i className={meta?.icon ?? 'fas fa-circle'} aria-hidden="true" />
                        </div>
                        <div className="pm-crm-timeline-body">
                          <div className="pm-crm-timeline-meta">
                            <span className="pm-crm-timeline-type">{meta?.label ?? int.type}</span>
                            <span className="pm-crm-timeline-date">{fmtDate(int.occurredAt)}</span>
                            {int.member && <span className="pm-crm-timeline-by">by {int.member.displayName}</span>}
                          </div>
                          <div className="pm-crm-timeline-summary">{int.summary}</div>
                        </div>
                        {(isAdmin || int.memberId === currentMemberId) && (
                          <button
                            className="pm-crm-timeline-del"
                            onClick={() => handleDeleteInteraction(int.id)}
                            title="Delete"
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

          {/* Email tab */}
          {activeTab === 'email' && (
            <div className="pm-crm-email-panel">
              {!contact.email && (
                <div className="pm-crm-email-no-addr">
                  <i className="fas fa-exclamation-circle" aria-hidden="true" />
                  No email address on file for this contact.
                </div>
              )}
              <div className="cpm-form-group">
                <label className="cpm-form-label">Email Intent</label>
                <select className="cpm-form-select" value={emailIntent} onChange={e => { setEmailIntent(e.target.value); setEmailResult(null); }}>
                  <option value="">Select intent…</option>
                  {EMAIL_INTENTS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <button
                className="cpm-btn cpm-btn--primary"
                style={{ width: '100%' }}
                onClick={handleGenerateEmail}
                disabled={!emailIntent || loadingEmail}
              >
                {loadingEmail ? <span className="pm-bulk-spinner" /> : <i className="fas fa-robot" />}
                {' '}Generate with AI
              </button>

              {emailResult && (
                <div className="pm-crm-email-result">
                  <div className="pm-crm-email-subject">
                    <strong>Subject:</strong> {emailResult.subject}
                  </div>
                  <pre className="pm-crm-email-body">{emailResult.body}</pre>
                  <div className="pm-crm-email-actions">
                    <button className="cpm-btn cpm-btn--secondary" onClick={() => { navigator.clipboard.writeText(emailResult.body); toast.success('Body copied!'); }}>
                      <i className="fas fa-copy" /> Copy Body
                    </button>
                    {contact.email && (
                      <a href={emailResult.mailto} className="cpm-btn cpm-btn--primary pm-crm-mailto-btn">
                        <i className="fas fa-envelope" /> Open in Mail
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ContactCard ───────────────────────────────────────────────

function ContactCard({ contact, onOpen, index }) {
  const typeMeta = CONTACT_TYPES.find(t => t.value === contact.contactType);
  const followUpOverdue = isOverdue(contact.nextFollowUpAt);

  return (
    <Draggable draggableId={contact.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`pm-crm-card${snapshot.isDragging ? ' pm-crm-card--dragging' : ''}`}
          onClick={() => onOpen(contact.id)}
          role="button"
          tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen(contact.id)}
          style={provided.draggableProps.style}
        >
          <div className="pm-crm-card-header">
            <i className={typeMeta?.icon ?? 'fas fa-user'} aria-hidden="true" style={{ color: 'var(--pm-accent-teal)', marginRight: 6 }} />
            <span className="pm-crm-card-name">{contact.name}</span>
          </div>
          {contact.organization && (
            <div className="pm-crm-card-org">{contact.organization}</div>
          )}
          {contact.tags?.length > 0 && (
            <div className="pm-crm-tags pm-crm-tags--compact">
              {contact.tags.slice(0, 2).map(t => <span key={t} className="pm-crm-tag">{t}</span>)}
              {contact.tags.length > 2 && <span className="pm-crm-tag pm-crm-tag--more">+{contact.tags.length - 2}</span>}
            </div>
          )}
          <div className="pm-crm-card-footer">
            {contact.nextFollowUpAt && (
              <span className={`pm-crm-card-followup${followUpOverdue ? ' pm-crm-card-followup--overdue' : ''}`}>
                <i className="fas fa-clock" aria-hidden="true" /> {fmtDate(contact.nextFollowUpAt)}
              </span>
            )}
            {contact._count?.interactions > 0 && (
              <span className="pm-crm-card-int-count">
                <i className="fas fa-history" aria-hidden="true" /> {contact._count.interactions}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
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

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStage = destination.droppableId;

    // Optimistic update
    setColumns(prev => {
      const next = { ...prev };
      const srcList  = [...(prev[source.droppableId] ?? [])];
      const dstList  = [...(prev[destination.droppableId] ?? [])];
      const [moved]  = srcList.splice(source.index, 1);
      dstList.splice(destination.index, 0, { ...moved, stage: newStage });
      next[source.droppableId] = srcList;
      next[destination.droppableId] = dstList;
      return next;
    });

    try {
      await patch(`/api/outreach/contacts/${draggableId}`, { stage: newStage });
    } catch (err) {
      toast.error('Failed to update stage.');
      load(); // revert
    }
  };

  const handleCreate = async (data) => {
    const created = await post('/api/outreach/contacts', data);
    setContacts(prev => [created, ...prev]);
    buildColumns([created, ...contacts]);
    setShowForm(false);
    toast.success(`Contact "${created.name}" created.`);
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
    if (!window.confirm('Delete this contact?')) return;
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

  const totalCount = contacts.length;

  return (
    <div className="pm-crm-tab">
      {/* Header */}
      <div className="pm-crm-header">
        <div>
          <h2 className="pm-campaigns-title">
            <i className="fas fa-address-book" aria-hidden="true" /> CRM
          </h2>
          <p className="pm-campaigns-subtitle">
            Manage sponsors, press, partners, prospects, and alumni.
          </p>
        </div>
        <div className="pm-crm-header-actions">
          <button className="cpm-btn cpm-btn--secondary" onClick={() => setShowCsvModal(true)}>
            <i className="fas fa-file-csv" aria-hidden="true" /> Import CSV
          </button>
          <button className="cpm-btn cpm-btn--primary" onClick={() => { setEditContact(null); setShowForm(true); }}>
            <i className="fas fa-user-plus" aria-hidden="true" /> New Contact
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="pm-crm-filters">
        <div className="pm-board-campaign-filter" role="group">
          <button className={`pm-campaign-chip${!typeFilter ? ' pm-campaign-chip--active' : ''}`} onClick={() => setTypeFilter('')}>
            All ({totalCount})
          </button>
          {CONTACT_TYPES.map(t => {
            const count = contacts.filter(c => c.contactType === t.value).length;
            return (
              <button
                key={t.value}
                className={`pm-campaign-chip${typeFilter === t.value ? ' pm-campaign-chip--active' : ''}`}
                onClick={() => setTypeFilter(prev => prev === t.value ? '' : t.value)}
              >
                <i className={t.icon} aria-hidden="true" /> {t.label} ({count})
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
            placeholder="Search name, org, email…"
          />
          {q && (
            <button className="pm-crm-search-clear" onClick={() => setQ('')} aria-label="Clear">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="pm-outreach-loading" style={{ minHeight: 200 }}>
          <div className="pm-outreach-spinner" />
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="pm-crm-board">
            {STAGES.map(stage => {
              const stageContacts = columns[stage.id] ?? [];
              return (
                <div key={stage.id} className="pm-crm-col">
                  <div className="pm-kanban-col-header">
                    <span className="pm-kanban-col-dot" style={{ background: stage.color }} />
                    <span className="pm-kanban-col-label" style={{ color: stage.color }}>{stage.label}</span>
                    <span className="pm-kanban-col-count">{stageContacts.length}</span>
                  </div>
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`pm-crm-col-body${snapshot.isDraggingOver ? ' drag-over' : ''}`}
                      >
                        {stageContacts.length === 0 && !snapshot.isDraggingOver && (
                          <div className="pm-outreach-col-empty">No contacts</div>
                        )}
                        {stageContacts.map((c, index) => (
                          <ContactCard
                            key={c.id}
                            contact={c}
                            index={index}
                            onOpen={setOpenDrawerId}
                          />
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Modals */}
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

      {/* Contact drawer */}
      {openDrawerId && (
        <ContactDrawer
          contactId={openDrawerId}
          onClose={() => setOpenDrawerId(null)}
          onUpdated={handleDrawerUpdate}
          isAdmin={isAdmin}
          currentMemberId={currentMemberId}
        />
      )}
    </div>
  );
}
