// Talent directory for signed-in sponsors. Shows exactly what GET /api/sponsor/directory returns. Filters only
// narrow; the sort is alphabetical or by graduation term. Nothing here scores or ranks people.
import { useCallback, useEffect, useRef, useState } from 'react';
import { SponsorApiError, getDirectory, requestIntro } from '../../api/sponsorClient';

export const OPEN_TO_LABELS = { INTERNSHIP: 'Internship', COOP: 'Co-op', FULL_TIME: 'Full-time', RESEARCH: 'Research' };
const MAX_MESSAGE = 1000;
const EMPTY = { role: '', tool: '', gradTerm: '', openTo: '', sort: 'name' };

function introErrorText(err) {
  if (err.status === 429) return 'You have reached the limit of 20 introduction requests per 7 days. Try again later.';
  if (err.status === 409) return 'You already have a pending request with this member.';
  if (err.status === 404) return 'This member is not available. They may have stopped sharing.';
  if (err.status === 400) return err.message;
  return 'The request could not be sent. Please try again.';
}

function IntroForm({ member, onUnauthorized, onSent, onCancel }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);
  const trimmed = message.trim();
  const tooLong = message.length > MAX_MESSAGE;

  const submit = async e => {
    e.preventDefault();
    if (inFlight.current) return;
    if (!trimmed) { setError('Write a short message so the member knows why you are reaching out.'); return; }
    if (tooLong) { setError(`Keep the message to ${MAX_MESSAGE} characters or fewer.`); return; }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await requestIntro(member.memberId, trimmed);
      setSent(true);
      onSent();
    } catch (err) {
      if (err instanceof SponsorApiError && err.status === 401) onUnauthorized();
      else setError(introErrorText(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p className="sponsor-note" role="status">
        Request sent. {member.name} will see it first, and contact details are shared only if they accept.
      </p>
    );
  }
  return (
    <form className="sponsor-form" onSubmit={submit} noValidate>
      <label htmlFor={`intro-${member.memberId}`}>Message to {member.name}</label>
      <textarea
        id={`intro-${member.memberId}`}
        rows={4}
        value={message}
        onChange={e => setMessage(e.target.value)}
        aria-describedby={`intro-count-${member.memberId}`}
      />
      <p id={`intro-count-${member.memberId}`} className={`sponsor-counter${tooLong ? ' is-over' : ''}`}>
        {message.length} / {MAX_MESSAGE}
      </p>
      {error && <p className="sponsor-error" role="alert">{error}</p>}
      <div className="sponsor-actions">
        <button type="submit" className="sponsor-btn" disabled={busy}>
          <i className="fas fa-paper-plane" aria-hidden="true" /> {busy ? 'Sending…' : 'Send request'}
        </button>
        <button type="button" className="sponsor-btn sponsor-btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Card({ member, onUnauthorized, onIntroSent }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const meta = [member.major, member.gradTerm && `Graduating ${member.gradTerm}`, member.availableFrom && `Available ${member.availableFrom}`].filter(Boolean);
  return (
    <li className="sponsor-card">
      <h3>{member.name}</h3>
      {member.headline && <p className="sponsor-card-headline">{member.headline}</p>}
      {meta.length > 0 && <p className="sponsor-card-meta">{meta.join(' · ')}</p>}
      {member.openTo.length > 0 && (
        <p className="sponsor-card-meta">Open to: {member.openTo.map(v => OPEN_TO_LABELS[v] || v).join(', ')}</p>
      )}
      {member.targets.length > 0 && (
        <p className="sponsor-card-meta">
          <i className="fas fa-bullseye" aria-hidden="true" /> {member.targets.map(t => t.title).join(', ')}
        </p>
      )}
      <button type="button" className="sponsor-link-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {open ? 'Hide details' : 'Show details'} <i className={`fas fa-chevron-down${open ? ' is-flipped' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="sponsor-card-detail">
          {member.bullets.length > 0 && (
            <>
              <h4>Verified work</h4>
              <ul>{member.bullets.map(b => <li key={b}>{b}</li>)}</ul>
            </>
          )}
          {member.certifications.length > 0 && (
            <>
              <h4>Certifications</h4>
              <ul>
                {member.certifications.map(c => (
                  <li key={`${c.name}-${c.provider}`}>{c.name}{c.provider ? `, ${c.provider}` : ''}</li>
                ))}
              </ul>
            </>
          )}
          {member.badges.length > 0 && (
            <>
              <h4>Badges</h4>
              <ul>
                {member.badges.map(b => (
                  <li key={b.verifyUrl}>
                    {b.name}{' '}
                    <a href={b.verifyUrl} target="_blank" rel="noopener noreferrer">Verify</a>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!member.bullets.length && !member.certifications.length && !member.badges.length && (
            <p className="sponsor-note">This member has not shared further details yet.</p>
          )}
        </div>
      )}
      {asking ? (
        <IntroForm
          member={member}
          onUnauthorized={onUnauthorized}
          onSent={onIntroSent}
          onCancel={() => setAsking(false)}
        />
      ) : (
        <button type="button" className="sponsor-btn" onClick={() => setAsking(true)}>
          <i className="fas fa-envelope" aria-hidden="true" /> Request an introduction
        </button>
      )}
    </li>
  );
}

export default function SponsorDirectory({ onUnauthorized, onIntroSent }) {
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [state, setState] = useState({ status: 'loading', members: [] });
  const [roles, setRoles] = useState({});
  const unauth = useRef(onUnauthorized);
  unauth.current = onUnauthorized;

  const load = useCallback(async filters => {
    setState(s => ({ ...s, status: 'loading' }));
    try {
      const { members } = await getDirectory(filters);
      setRoles(prev => {
        const next = { ...prev };
        members.forEach(m => m.targets.forEach(t => { next[t.code] = t.title; }));
        return next;
      });
      setState({ status: 'ok', members });
    } catch (err) {
      if (err instanceof SponsorApiError && err.status === 401) { unauth.current(); return; }
      setState({
        status: 'error',
        members: [],
        message: err.status === 400 ? err.message : 'The directory could not be loaded right now. Please try again.',
      });
    }
  }, []);

  useEffect(() => { load(applied); }, [applied, load]);

  const set = key => e => setDraft(d => ({ ...d, [key]: e.target.value }));
  const apply = e => { e.preventDefault(); setApplied({ ...draft, tool: draft.tool.trim(), gradTerm: draft.gradTerm.trim() }); };
  const reset = () => { setDraft(EMPTY); setApplied(EMPTY); };

  return (
    <section className="sponsor-section" aria-labelledby="sponsor-directory">
      <h2 id="sponsor-directory">Member directory</h2>
      <p className="sponsor-note">
        You see only members who chose to share with sponsors, and only results that have been verified. A member&apos;s
        contact details are shared with you only after they accept your introduction request. Filters only narrow the list.
      </p>

      <form className="sponsor-filters" onSubmit={apply}>
        <div className="sponsor-field">
          <label htmlFor="sf-role">Target role</label>
          <select id="sf-role" value={draft.role} onChange={set('role')}>
            <option value="">Any role</option>
            {Object.entries(roles).sort((a, b) => a[1].localeCompare(b[1])).map(([code, title]) => (
              <option key={code} value={code}>{title}</option>
            ))}
          </select>
        </div>
        <div className="sponsor-field">
          <label htmlFor="sf-tool">Tool or skill</label>
          <input id="sf-tool" type="text" maxLength={60} value={draft.tool} onChange={set('tool')} placeholder="e.g. SolidWorks" />
        </div>
        <div className="sponsor-field">
          <label htmlFor="sf-grad">Graduation term</label>
          <input id="sf-grad" type="text" inputMode="numeric" value={draft.gradTerm} onChange={set('gradTerm')} placeholder="2028 or 2028-05" />
        </div>
        <div className="sponsor-field">
          <label htmlFor="sf-open">Open to</label>
          <select id="sf-open" value={draft.openTo} onChange={set('openTo')}>
            <option value="">Anything</option>
            {Object.entries(OPEN_TO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="sponsor-field">
          <label htmlFor="sf-sort">Sort by</label>
          <select id="sf-sort" value={draft.sort} onChange={set('sort')}>
            <option value="name">Name (A to Z)</option>
            <option value="gradTerm">Graduation term</option>
          </select>
        </div>
        <div className="sponsor-actions">
          <button type="submit" className="sponsor-btn"><i className="fas fa-filter" aria-hidden="true" /> Apply filters</button>
          <button type="button" className="sponsor-btn sponsor-btn--ghost" onClick={reset}>Clear</button>
        </div>
      </form>

      {state.status === 'loading' && <p className="sponsor-note" role="status">Loading…</p>}
      {state.status === 'error' && <p className="sponsor-error" role="alert">{state.message}</p>}
      {state.status === 'ok' && state.members.length === 0 && (
        <p className="sponsor-note">No members match right now. Try fewer filters.</p>
      )}
      {state.status === 'ok' && state.members.length > 0 && (
        <ul className="sponsor-cards">
          {state.members.map(m => (
            <Card key={m.memberId} member={m} onUnauthorized={onUnauthorized} onIntroSent={onIntroSent} />
          ))}
        </ul>
      )}
    </section>
  );
}
