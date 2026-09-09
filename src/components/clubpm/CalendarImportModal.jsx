import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { previewEventImport, importEvents } from '../../api/clubPmClient';

const EVENT_TYPES = ['MEETING', 'DEADLINE', 'WORKSHOP', 'SOCIAL', 'OTHER'];

function fmt(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Admin-only: pull events from a public/shared calendar URL into the club
 * calendar. One-shot — preview, pick, import. Events already imported are
 * matched by ICS UID server-side and cannot be duplicated.
 */
export default function CalendarImportModal({ isOpen, onClose, onImported }) {
  const [url, setUrl]         = useState('');
  const [preview, setPreview] = useState(null);
  const [picked, setPicked]   = useState(new Set());
  const [types, setTypes]     = useState({});
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);

  if (!isOpen) return null;

  function reset() {
    setUrl(''); setPreview(null); setPicked(new Set()); setTypes({}); setError(null);
  }

  async function handlePreview(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const data = await previewEventImport(url.trim());
      setPreview(data);
      setPicked(new Set(data.events.filter(ev => !ev.alreadyImported).map(ev => ev.uid)));
    } catch (err) {
      setError(err.message ?? 'Could not read that calendar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setBusy(true); setError(null);
    try {
      const chosen = preview.events
        .filter(ev => picked.has(ev.uid))
        .map(ev => ({ ...ev, type: types[ev.uid] ?? 'OTHER' }));
      const res = await importEvents(chosen, preview.source);
      await onImported(res);
      reset();
      onClose();
    } catch (err) {
      setError(err.message ?? 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  const importable = preview?.events.filter(ev => !ev.alreadyImported) ?? [];

  return createPortal(
    <div className="cpm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pm-cal-import-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-cal-import-head">
          <h2><i className="fas fa-file-import" /> Import events</h2>
          <button type="button" className="cpm-icon-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>

        {!preview && (
          <form onSubmit={handlePreview} className="pm-cal-import-form">
            <label className="cpm-form-label" htmlFor="import-url">Calendar address (iCal / .ics)</label>
            <input
              id="import-url"
              className="cpm-form-input"
              type="url"
              placeholder="https://calendar.google.com/calendar/ical/…/public/basic.ics"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
            />
            <p className="pm-cal-import-hint">
              Events land on the shared club calendar. Re-importing the same feed won't duplicate anything —
              events are matched by their calendar ID.
            </p>
            {error && <div className="pm-cal-import-error">{error}</div>}
            <div className="pm-cal-import-actions">
              <button type="button" className="cpm-btn cpm-btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="cpm-btn cpm-btn-primary" disabled={busy || !url.trim()}>
                {busy ? <><i className="fas fa-spinner fa-spin" /> Reading…</> : 'Preview'}
              </button>
            </div>
          </form>
        )}

        {preview && (
          <>
            <div className="pm-cal-import-summary">
              <span><strong>{preview.events.length}</strong> events from {preview.source}</span>
              <button
                type="button"
                className="cpm-link-btn"
                onClick={() => setPicked(
                  picked.size === importable.length
                    ? new Set()
                    : new Set(importable.map(ev => ev.uid))
                )}
              >
                {picked.size === importable.length ? 'Select none' : 'Select all'}
              </button>
            </div>

            <div className="pm-cal-import-list">
              {preview.events.map(ev => (
                <label key={ev.uid} className={`pm-cal-import-row${ev.alreadyImported ? ' is-imported' : ''}`}>
                  <input
                    type="checkbox"
                    checked={picked.has(ev.uid)}
                    disabled={ev.alreadyImported}
                    onChange={() => setPicked(prev => {
                      const next = new Set(prev);
                      if (next.has(ev.uid)) next.delete(ev.uid); else next.add(ev.uid);
                      return next;
                    })}
                  />
                  <span className="pm-cal-import-when">{fmt(ev.start)}</span>
                  <span className="pm-cal-import-title">{ev.title}</span>
                  {ev.alreadyImported
                    ? <span className="pm-cal-import-badge">already imported</span>
                    : (
                      <select
                        className="cpm-form-input pm-cal-import-type"
                        value={types[ev.uid] ?? 'OTHER'}
                        onChange={e => setTypes(t => ({ ...t, [ev.uid]: e.target.value }))}
                        onClick={e => e.preventDefault()}
                      >
                        {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                </label>
              ))}
            </div>

            {error && <div className="pm-cal-import-error">{error}</div>}
            <div className="pm-cal-import-actions">
              <button type="button" className="cpm-btn cpm-btn-ghost" onClick={reset}>Back</button>
              <button type="button" className="cpm-btn cpm-btn-primary" disabled={busy || picked.size === 0} onClick={handleImport}>
                {busy ? <><i className="fas fa-spinner fa-spin" /> Importing…</> : `Import ${picked.size} event${picked.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
