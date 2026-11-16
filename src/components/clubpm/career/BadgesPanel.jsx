// Career view badges: eligible, claimed and revoked Open Badges. A claim signs an immutable credential on the
// server; nothing is published automatically (decision 9). Exports and LinkedIn links happen in the browser.
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { careerApi } from '../../../api/clubPmClient';

const fmt = d => { try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } };
const errText = (e, fallback) => (e?.message && e.message !== 'Unknown error' ? e.message : fallback);

function stateOf(b) {
  if (b.award?.revokedAt) return 'revoked';
  if (b.award) return 'claimed';
  if (b.eligible) return 'eligible';
  if (b.needsConfirmation) return 'confirm';
  return 'progress';
}
const STATE_LABEL = {
  revoked: 'Revoked', claimed: 'Claimed', eligible: 'Ready to claim', confirm: 'Needs admin confirmation', progress: 'In progress',
};

function ClaimConfirm({ badge, busy, onConfirm, onCancel }) {
  return <div className="pm-career-confirm" role="group" aria-label={`Confirm claiming ${badge.name}`}>
    <p>Claiming signs a credential that anyone with its link can check. They will see:</p>
    <ul className="pm-career-badge-preview">
      <li>The issuer: Purdue SEARCH</li>
      <li>The badge name and its criteria: {badge.name}{badge.description ? `. ${badge.description}` : ''}</li>
      <li>Your value: {badge.resultText || badge.value}</li>
      <li>The date it was issued</li>
    </ul>
    <p className="pm-career-muted">The credential holds a salted hash of your email, never the email itself, and does not include your name. Nothing is published for you: the badge is only seen where you share its link.</p>
    <p className="pm-career-muted">You can revoke it later, but a revoked badge cannot be claimed again.</p>
    <div className="pm-career-intro-actions">
      <button type="button" className="pm-career-btn" disabled={busy} onClick={onConfirm}>Claim and sign badge</button>
      <button type="button" className="pm-career-btn pm-career-btn--ghost" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

function RevokeConfirm({ badge, busy, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const fieldId = `badge-revoke-${badge.id}`;
  return <div className="pm-career-confirm" role="group" aria-label={`Confirm revoking ${badge.name}`}>
    <p><strong>Revoking is permanent.</strong> The verify page will show this badge as revoked, and you cannot claim it again.</p>
    <label className="pm-career-edit-label" htmlFor={fieldId}>Reason (optional, only you see it)</label>
    <input id={fieldId} className="pm-career-input" maxLength={200} value={reason} onChange={e => setReason(e.target.value)} />
    <div className="pm-career-intro-actions">
      <button type="button" className="pm-career-btn pm-career-badge-danger" disabled={busy} onClick={() => onConfirm(reason.trim())}>Revoke permanently</button>
      <button type="button" className="pm-career-btn pm-career-btn--ghost" disabled={busy} onClick={onCancel}>Keep badge</button>
    </div>
  </div>;
}

export default function BadgesPanel() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null); // { id, kind: 'claim' | 'revoke' }
  const [manualLink, setManualLink] = useState(null); // { id, url } when the clipboard is unavailable
  const guard = useRef(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try { const r = await careerApi.badges(); if (seq.current === id) { setData(r || { canIssue: false, badges: [] }); setFailed(false); } }
    catch { if (seq.current === id) setFailed(true); }
  }, []);
  useEffect(() => { load(); return () => { seq.current++; }; }, [load]);

  const run = async (fn, okText, fallback) => {
    if (guard.current) return;
    guard.current = true; setBusy(true);
    try { await fn(); toast.success(okText); setConfirming(null); await load(); }
    catch (e) { toast.error(errText(e, fallback)); if (e?.status === 409 || e?.status === 404) { setConfirming(null); load(); } }
    finally { guard.current = false; setBusy(false); }
  };
  const claim = b => run(() => careerApi.claimBadge(b.id), `${b.name} badge claimed`, 'Could not claim this badge');
  const revoke = (b, reason) => run(() => careerApi.revokeBadge(b.award.id, reason || undefined), `${b.name} badge revoked`, 'Could not revoke this badge');

  const copyLink = async b => {
    const url = b.award.verifyUrl;
    setManualLink(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(url);
      toast.success('Verify link copied');
    } catch { setManualLink({ id: b.id, url }); }
  };

  const badges = data?.badges || [];
  return <section className="pm-career-section pm-career-badges" aria-label="Badges">
    <h3>Badges</h3>
    {failed && <p className="pm-career-intro-state" role="alert">Badges could not be loaded. <button type="button" className="pm-career-link" onClick={load}>Try again</button></p>}
    {!failed && !data && <p className="pm-career-intro-state" role="status">Loading badges…</p>}
    {data && !data.canIssue && <p className="pm-career-muted" role="note">Badge issuing is not set up yet, so badges cannot be claimed right now. Badges you already hold still work.</p>}
    {data && !badges.length && <p className="pm-career-muted">No badges are offered right now.</p>}
    {badges.length > 0 && <ul className="pm-career-badge-list">{badges.map(b => {
      const st = stateOf(b);
      const a = b.award;
      return <li key={b.id} className={`pm-career-badge pm-career-badge--${st}`}>
        <div className="pm-career-badge-head">
          <strong>{b.name}</strong>
          <span className={`pm-career-pill pm-career-badge-status pm-career-badge-status--${st}`}>
            <i className={`fas ${st === 'claimed' ? 'fa-circle-check' : st === 'revoked' ? 'fa-ban' : st === 'eligible' ? 'fa-award' : 'fa-hourglass-half'}`} aria-hidden="true" /> {STATE_LABEL[st]}
          </span>
        </div>
        {b.description && <p className="pm-career-badge-desc">{b.description}</p>}
        <p className="pm-career-badge-meta">
          {a ? `Value on the badge: ${a.value}. Issued ${fmt(a.issuedAt)}.` : `Your count: ${b.value} of ${b.threshold} needed.`}
          {st === 'revoked' && ` Revoked ${fmt(a.revokedAt)}.`}
        </p>
        {st === 'revoked' && a.revokedReason && <p className="pm-career-badge-meta">Your reason: {a.revokedReason}</p>}
        {st === 'confirm' && <p className="pm-career-badge-meta">Your count meets the threshold. A club admin needs to confirm it before you can claim.</p>}

        {st === 'eligible' && confirming?.id !== b.id && <div className="pm-career-intro-actions">
          <button type="button" className="pm-career-btn" disabled={busy || !data.canIssue} onClick={() => setConfirming({ id: b.id, kind: 'claim' })}>Claim badge</button>
        </div>}
        {st === 'eligible' && confirming?.id === b.id && confirming.kind === 'claim' &&
          <ClaimConfirm badge={b} busy={busy} onConfirm={() => claim(b)} onCancel={() => setConfirming(null)} />}

        {st === 'claimed' && confirming?.id !== b.id && <div className="pm-career-intro-actions">
          {a.linkedInUrl && <a className="pm-career-btn" href={a.linkedInUrl} target="_blank" rel="noopener noreferrer"><i className="fab fa-linkedin" aria-hidden="true" /> Add to LinkedIn</a>}
          <button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={() => copyLink(b)}><i className="fas fa-link" aria-hidden="true" /> Copy verify link</button>
          <a className="pm-career-btn pm-career-btn--ghost" href={a.verifyUrl} target="_blank" rel="noopener noreferrer"><i className="fas fa-up-right-from-square" aria-hidden="true" /> Open verify page</a>
          <button type="button" className="pm-career-btn pm-career-btn--ghost" disabled={busy} onClick={() => setConfirming({ id: b.id, kind: 'revoke' })}>Revoke</button>
        </div>}
        {st === 'claimed' && manualLink?.id === b.id && <p className="pm-career-badge-meta" role="status">Copying is not available here. Select and copy this link: <code className="pm-career-badge-url">{manualLink.url}</code></p>}
        {st === 'claimed' && confirming?.id === b.id && confirming.kind === 'revoke' &&
          <RevokeConfirm badge={b} busy={busy} onConfirm={reason => revoke(b, reason)} onCancel={() => setConfirming(null)} />}
      </li>;
    })}</ul>}
  </section>;
}
