import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { careerApi } from '../../../api/clubPmClient';
import { useClubPmAuth } from '../../../clubpm/ClubPmAuth';

const STATUS_LABEL = {
  PENDING: 'Waiting for your answer', ACCEPTED: 'Accepted', DECLINED: 'Declined', EXPIRED: 'Expired', WITHDRAWN: 'Withdrawn',
};
const NOT_SHARING = 'Turn on sharing with sponsors before accepting.';

const fmt = d => { try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } };
const errText = (e, fallback) => (e?.message && e.message !== 'Unknown error' ? e.message : fallback);

/** Same rule as the backend's exportable(): shareable, not pending, ticked, not hidden. */
export const sharedBullets = bullets => (bullets || []).filter(b => b.shareable && !b.pending && b.selected && !b.hidden).map(b => b.text);

export default function IntroInbox({ bullets = [], onOpenSettings }) {
  const { member } = useClubPmAuth() || {};
  const [intros, setIntros] = useState(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notSharing, setNotSharing] = useState(false);
  const guard = useRef(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try { const r = await careerApi.intros(); if (seq.current === id) { setIntros(r?.intros || []); setFailed(false); } }
    catch { if (seq.current === id) setFailed(true); }
  }, []);
  useEffect(() => { load(); return () => { seq.current++; }; }, [load]);

  const respond = async (row, accept) => {
    if (guard.current) return;
    guard.current = true; setBusy(true); setNotSharing(false);
    try {
      await careerApi.respondIntro(row.id, accept);
      toast.success(accept ? 'Introduction accepted' : 'Request declined');
      setConfirming(null);
      await load();
    } catch (e) {
      if (e?.status === 409 && /sharing/i.test(e.message || '')) setNotSharing(true);
      else { toast.error(errText(e, 'Could not send your answer')); if (e?.status === 409) { setConfirming(null); load(); } }
    } finally { guard.current = false; setBusy(false); }
  };

  const picked = sharedBullets(bullets);

  return <section className="pm-career-section" aria-label="Intro requests">
    <h3>Intro requests</h3>
    {failed && <p className="pm-career-intro-state" role="alert">Intro requests could not be loaded. <button type="button" className="pm-career-link" onClick={load}>Try again</button></p>}
    {!failed && intros === null && <p className="pm-career-intro-state" role="status">Loading intro requests…</p>}
    {!failed && intros && !intros.length && <p className="pm-career-intro-state">No sponsors have asked to meet you.</p>}
    {!failed && intros && intros.length > 0 && <ul className="pm-career-intro-list">{intros.map(r => {
      const open = r.status === 'PENDING';
      return <li key={r.id} className="pm-career-intro">
        <div className="pm-career-intro-head">
          <strong>{r.sponsor?.name}{r.sponsor?.org ? `, ${r.sponsor.org}` : ''}</strong>
          <span className="pm-career-pill">{STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <p className="pm-career-intro-msg">{r.message}</p>
        {r.opportunityId && <p className="pm-career-intro-meta">Opportunity: {r.opportunityId}</p>}
        <p className="pm-career-intro-meta">Received {fmt(r.createdAt)}{open ? `. Expires ${fmt(r.expiresAt)}.` : r.respondedAt ? `. Answered ${fmt(r.respondedAt)}.` : ''}</p>
        {r.status === 'ACCEPTED' && r.sponsor?.email && <p className="pm-career-intro-meta">Their email: {r.sponsor.email}</p>}
        {open && confirming !== r.id && <div className="pm-career-intro-actions">
          <button type="button" className="pm-career-btn" disabled={busy} onClick={() => { setNotSharing(false); setConfirming(r.id); }}>Accept</button>
          <button type="button" className="pm-career-btn pm-career-btn--ghost" disabled={busy} onClick={() => respond(r, false)}>Decline</button>
        </div>}
        {open && confirming === r.id && <div className="pm-career-confirm" role="group" aria-label="Confirm what the sponsor receives">
          <p>If you accept, {r.sponsor?.name} will receive an email with:</p>
          <ul className="pm-career-intro-preview">
            <li>Your email: {member?.email || 'the email on your account'}</li>
            {r.opportunityId && <li>Opportunity reference: {r.opportunityId}</li>}
            {picked.length
              ? <li>Highlights you chose to share:<ul>{picked.map(t => <li key={t}>{t}</li>)}</ul></li>
              : <li>No highlights. You have not ticked any shareable bullets.</li>}
          </ul>
          <p className="pm-career-muted">You will also see their email here.</p>
          {notSharing && <p className="pm-career-error" role="alert">{NOT_SHARING} <button type="button" className="pm-career-link" onClick={onOpenSettings}>Open settings</button></p>}
          <div className="pm-career-intro-actions">
            <button type="button" className="pm-career-btn" disabled={busy} onClick={() => respond(r, true)}>Send my details and accept</button>
            <button type="button" className="pm-career-btn pm-career-btn--ghost" disabled={busy} onClick={() => { setConfirming(null); setNotSharing(false); }}>Cancel</button>
          </div>
        </div>}
      </li>;
    })}</ul>}
  </section>;
}
