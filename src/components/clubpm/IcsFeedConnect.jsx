import React, { useEffect, useState } from 'react';
import { getIcsFeed, saveIcsFeed, removeIcsFeed } from '../../api/clubPmClient';
import ConfirmInline from './ConfirmInline';

/**
 * Connects a private iCal feed (Google/Outlook/Apple "secret address") so
 * meeting polls can pre-fill availability. The URL is write-only from the
 * client's perspective — the server never sends it back, only the host.
 */
export default function IcsFeedConnect() {
  const [feed, setFeed]     = useState(null);
  const [url, setUrl]       = useState('');
  const [label, setLabel]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    getIcsFeed().then(setFeed).catch(() => setFeed({ connected: false }));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try {
      const saved = await saveIcsFeed(url.trim(), label.trim() || undefined);
      setResult(`Connected — ${saved.eventCount} events in the next 60 days.`);
      setUrl(''); setLabel('');
      setFeed(await getIcsFeed());
    } catch (err) {
      setError(err.message ?? 'Could not connect that calendar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    await removeIcsFeed();
    setResult(null);
    setFeed(await getIcsFeed());
  }

  if (!feed) return null;

  if (feed.connected) {
    return (
      <div className="pm-ics-feed">
        <div className="pm-ics-feed-status">
          <i className="fas fa-calendar-alt" aria-hidden="true" />
          <div>
            <div className="pm-ics-feed-label">{feed.label ?? feed.host}</div>
            <div className="pm-ics-feed-meta">
              {feed.host}
              {feed.checkedAt && ` · checked ${new Date(feed.checkedAt).toLocaleDateString()}`}
            </div>
          </div>
          <ConfirmInline
            label="Remove"
            prompt="Disconnect this calendar?"
            confirmLabel="Remove"
            icon={null}
            onConfirm={handleRemove}
            className="cpm-btn cpm-btn-ghost"
          />
        </div>
        <p className="pm-ics-feed-hint">
          Meeting polls can now shade the slots you're busy. Your calendar is read on demand and never shared.
        </p>
      </div>
    );
  }

  return (
    <form className="pm-ics-feed" onSubmit={handleSave}>
      <label className="cpm-form-label" htmlFor="ics-url">Personal calendar feed</label>
      <input
        id="ics-url"
        className="cpm-form-input"
        type="url"
        placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
        value={url}
        onChange={e => setUrl(e.target.value)}
        required
      />
      <input
        className="cpm-form-input"
        type="text"
        placeholder="Label (optional) — e.g. Purdue schedule"
        value={label}
        onChange={e => setLabel(e.target.value)}
      />
      <p className="pm-ics-feed-hint">
        In Google Calendar: Settings → Settings for my calendars → your calendar → <strong>Secret address in iCal format</strong>.
        Treat it like a password — it grants read access to your calendar. It's stored encrypted and never shown again.
      </p>
      {error  && <div className="pm-ics-feed-error">{error}</div>}
      {result && <div className="pm-ics-feed-ok">{result}</div>}
      <button type="submit" className="cpm-btn cpm-btn-primary" disabled={busy || !url.trim()}>
        {busy ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Checking…</> : 'Connect calendar'}
      </button>
    </form>
  );
}
