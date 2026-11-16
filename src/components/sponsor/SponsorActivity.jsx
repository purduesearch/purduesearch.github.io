// Sent introduction requests and (when the API enables it) the posting form.
import { useEffect, useRef, useState } from 'react';
import { SponsorApiError, createPosting, getIntros } from '../../api/sponsorClient';

const STATUS_LABEL = {
  PENDING: 'Waiting for the member',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
};
const when = iso => { try { return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' }); } catch { return ''; } };

export function IntroList({ refreshKey, onUnauthorized }) {
  const [state, setState] = useState({ status: 'loading', intros: [] });
  useEffect(() => {
    let live = true;
    getIntros()
      .then(({ intros }) => { if (live) setState({ status: 'ok', intros }); })
      .catch(err => {
        if (!live) return;
        if (err instanceof SponsorApiError && err.status === 401) onUnauthorized();
        else setState({ status: 'error', intros: [] });
      });
    return () => { live = false; };
  }, [refreshKey, onUnauthorized]);

  return (
    <section className="sponsor-section" aria-labelledby="sponsor-intros">
      <h2 id="sponsor-intros">Your introduction requests</h2>
      {state.status === 'loading' && <p className="sponsor-note" role="status">Loading…</p>}
      {state.status === 'error' && <p className="sponsor-error" role="alert">Your requests could not be loaded right now.</p>}
      {state.status === 'ok' && state.intros.length === 0 && <p className="sponsor-note">You have not sent any requests yet.</p>}
      {state.intros.length > 0 && (
        <ul className="sponsor-intros">
          {state.intros.map(i => (
            <li key={i.id} className="sponsor-intro">
              <div className="sponsor-intro-head">
                <strong>{i.member.sharing ? i.member.name : 'Member no longer sharing'}</strong>
                <span className={`sponsor-status sponsor-status--${String(i.status).toLowerCase()}`}>{STATUS_LABEL[i.status] || i.status}</span>
              </div>
              <p className="sponsor-intro-message">{i.message}</p>
              <p className="sponsor-card-meta">Sent {when(i.createdAt)}</p>
              {i.memberEmail && (
                <p className="sponsor-intro-email">
                  <i className="fas fa-envelope" aria-hidden="true" /> <a href={`mailto:${i.memberEmail}`}>{i.memberEmail}</a>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const EMPTY_POSTING = { title: '', url: '', location: '', employmentType: '', description: '', closesAt: '' };

export function PostingForm({ onUnauthorized }) {
  const [form, setForm] = useState(EMPTY_POSTING);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (inFlight.current) return;
    if (!form.title.trim() || !form.url.trim()) { setError('A title and a link are required.'); return; }
    inFlight.current = true;
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      await createPosting(body);
      setForm(EMPTY_POSTING);
      setDone(true);
    } catch (err) {
      if (err instanceof SponsorApiError && err.status === 401) onUnauthorized();
      else setError(err.status === 400 ? err.message : 'The posting could not be saved. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="sponsor-section" aria-labelledby="sponsor-postings">
      <h2 id="sponsor-postings">Post an opportunity</h2>
      <form className="sponsor-form" onSubmit={submit} noValidate>
        <label htmlFor="sp-title">Title</label>
        <input id="sp-title" type="text" maxLength={200} value={form.title} onChange={set('title')} />
        <label htmlFor="sp-url">Link to the posting</label>
        <input id="sp-url" type="url" value={form.url} onChange={set('url')} placeholder="https://" />
        <label htmlFor="sp-loc">Location</label>
        <input id="sp-loc" type="text" maxLength={200} value={form.location} onChange={set('location')} />
        <label htmlFor="sp-type">Employment type</label>
        <select id="sp-type" value={form.employmentType} onChange={set('employmentType')}>
          <option value="">Not specified</option>
          <option value="INTERNSHIP">Internship</option>
          <option value="COOP">Co-op</option>
          <option value="FULL_TIME">Full-time</option>
          <option value="RESEARCH">Research</option>
        </select>
        <label htmlFor="sp-desc">Description</label>
        <textarea id="sp-desc" rows={4} value={form.description} onChange={set('description')} />
        <label htmlFor="sp-closes">Closes on</label>
        <input id="sp-closes" type="date" value={form.closesAt} onChange={set('closesAt')} />
        {error && <p className="sponsor-error" role="alert">{error}</p>}
        {done && <p className="sponsor-note" role="status">Posting saved.</p>}
        <div className="sponsor-actions">
          <button type="submit" className="sponsor-btn" disabled={busy}>{busy ? 'Saving…' : 'Save posting'}</button>
        </div>
      </form>
    </section>
  );
}
