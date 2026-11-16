import { useRef, useState } from 'react';
import { careerApi } from '../../../api/clubPmClient';

export const OPEN_TO_OPTIONS = [
  ['INTERNSHIP', 'Internship'], ['COOP', 'Co-op'], ['FULL_TIME', 'Full-time'], ['RESEARCH', 'Research'],
];
export const CLAIM_UNIT_OPTIONS = ['USD', 'people', 'hours', 'items'];
const TERM = /^\d{4}-(0[1-9]|1[0-2])$/;

// Field lists mirror backend talentDirectoryCore.ts buildSponsorCard / buildPublicCard exactly. Keep them in sync.
export const SPONSOR_CARD_FIELDS = 'your first name and last initial, major, graduation term, headline, what you are open to (internship, co-op, full-time, research), available-from date, target roles, the verified bullets you ticked (in the club’s standard wording, not your custom wording), your certifications (name and provider) and the badges you earned with their verification links';
export const PUBLIC_CARD_FIELDS = 'your first name and last initial, major, graduation term, target roles and the verified bullets you ticked (in the club’s standard wording, not your custom wording)';

const SHARE_COPY = {
  shareWithSponsors: {
    title: 'Share with sponsors',
    plain: `Signed-in club sponsors can find your card in the talent directory and request an intro. They see ${SPONSOR_CARD_FIELDS}. Your email is shared only if you accept an intro.`,
    confirm: `Sponsors will be able to see: ${SPONSOR_CARD_FIELDS}. They will not see your email (unless you accept an intro), photo, Slack id or level. Pending claims are never shown.`,
  },
  showOnPublicPage: {
    title: 'Show on the public Impact page',
    plain: `Your card appears on the club’s public Impact page, visible to anyone, even without an account. It shows ${PUBLIC_CARD_FIELDS}. Never your email, photo, Slack id or level.`,
    confirm: `Anyone on the internet will be able to see: ${PUBLIC_CARD_FIELDS}. They will not see your headline, certifications, badges, email, photo, Slack id or level.`,
  },
};

const errText = (e, fallback) => (e?.message && e.message !== 'Unknown error' ? e.message : fallback);

function ShareToggle({ field, checked, busy, onAsk, onTurnOff }) {
  const copy = SHARE_COPY[field];
  const id = `career-share-${field}`;
  return <div className="pm-career-toggle">
    <label className="pm-career-toggle-label" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} disabled={busy}
        onChange={e => (e.target.checked ? onAsk(field) : onTurnOff(field))} />
      <span>{copy.title}</span>
    </label>
    <p className="pm-career-muted">{copy.plain}</p>
  </div>;
}

export default function CareerSettings({ profile, claims = [], onSaved, onClose }) {
  const p = profile || {};
  const [major, setMajor] = useState(p.major || '');
  const [headline, setHeadline] = useState(p.headline || '');
  const [gradTerm, setGradTerm] = useState(p.gradTerm || '');
  const [availableFrom, setAvailableFrom] = useState(p.availableFrom || '');
  const [openTo, setOpenTo] = useState(Array.isArray(p.openTo) ? p.openTo : []);
  const [pendingShare, setPendingShare] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [shareError, setShareError] = useState('');
  const [claimError, setClaimError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [claim, setClaim] = useState({ label: '', value: '', unit: '', evidenceUrl: '' });
  const guard = useRef(false);

  const run = async (fn, setErr, fallback) => {
    if (guard.current) return false;
    guard.current = true; setBusy(true); setErr('');
    try { await fn(); if (onSaved) await onSaved(); return true; }
    catch (e) { setErr(errText(e, fallback)); return false; }
    finally { guard.current = false; setBusy(false); }
  };

  const saveProfile = async e => {
    e.preventDefault();
    setSaved(false);
    for (const [label, v] of [['Graduation term', gradTerm], ['Available from', availableFrom]]) {
      if (v && !TERM.test(v.trim())) { setProfileError(`${label} must look like YYYY-MM.`); return; }
    }
    const ok = await run(() => careerApi.updateProfile({
      major: major.trim() || null, headline: headline.trim() || null,
      gradTerm: gradTerm.trim() || null, availableFrom: availableFrom.trim() || null, openTo,
    }), setProfileError, 'Could not save your profile');
    setSaved(ok);
  };
  const toggleOpen = (key, on) => setOpenTo(cur => (on ? [...new Set([...cur, key])] : cur.filter(k => k !== key)));

  const confirmShare = async () => {
    const field = pendingShare;
    const ok = await run(() => careerApi.updateProfile({ [field]: true }), setShareError, 'Could not change sharing');
    if (ok) setPendingShare(null);
  };
  const turnOff = field => run(() => careerApi.updateProfile({ [field]: false }), setShareError, 'Could not change sharing');

  const submitClaim = async e => {
    e.preventDefault();
    const label = claim.label.trim();
    const value = Number(claim.value);
    const url = claim.evidenceUrl.trim();
    if (!label || label.length > 80) { setClaimError('Describe your claim in 80 characters or fewer.'); return; }
    if (claim.value === '' || !Number.isFinite(value) || value < 0) { setClaimError('Enter a number of at least 0.'); return; }
    let ok = false;
    try { const u = new URL(url); ok = u.protocol === 'https:' && url.length <= 500; } catch { ok = false; }
    if (!ok) { setClaimError('The evidence link must be a valid https link (500 characters max).'); return; }
    const done = await run(() => careerApi.createClaim({ label, value, unit: claim.unit || null, evidenceUrl: url }), setClaimError, 'Could not add that claim');
    if (done) setClaim({ label: '', value: '', unit: '', evidenceUrl: '' });
  };
  const removeClaim = id => run(() => careerApi.deleteClaim(id), setClaimError, 'Could not delete that claim');

  const deletable = c => c.status === 'PENDING' || c.status === 'NEEDS_PROOF';
  const statusLabel = s => (s === 'VERIFIED' ? 'Verified' : s === 'NEEDS_PROOF' ? 'Needs proof' : s === 'DECLINED' ? 'Declined' : 'Pending review');

  return <section className="pm-career-section pm-career-settings" aria-label="Career settings">
    <div className="pm-career-settings-head">
      <h3>Career settings</h3>
      {onClose && <button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={onClose}>Close settings</button>}
    </div>

    <form className="pm-career-form" onSubmit={saveProfile} aria-label="Profile details">
      <div className="pm-career-field"><label htmlFor="career-major">Major</label>
        <input id="career-major" className="pm-career-input" maxLength={100} value={major} onChange={e => setMajor(e.target.value)} /></div>
      <div className="pm-career-field"><label htmlFor="career-headline">Headline</label>
        <input id="career-headline" className="pm-career-input" maxLength={160} value={headline} onChange={e => setHeadline(e.target.value)} /></div>
      <div className="pm-career-field"><label htmlFor="career-grad">Graduation term (YYYY-MM)</label>
        <input id="career-grad" className="pm-career-input" inputMode="numeric" placeholder="2028-05" maxLength={7} value={gradTerm} onChange={e => setGradTerm(e.target.value)} /></div>
      <div className="pm-career-field"><label htmlFor="career-avail">Available from (YYYY-MM)</label>
        <input id="career-avail" className="pm-career-input" inputMode="numeric" placeholder="2027-06" maxLength={7} value={availableFrom} onChange={e => setAvailableFrom(e.target.value)} /></div>
      <fieldset className="pm-career-field pm-career-fieldset"><legend>Open to</legend>
        {OPEN_TO_OPTIONS.map(([key, label]) => <label key={key} className="pm-career-opt">
          <input type="checkbox" checked={openTo.includes(key)} onChange={e => toggleOpen(key, e.target.checked)} /> <span>{label}</span>
        </label>)}
      </fieldset>
      {profileError && <p className="pm-career-error" role="alert">{profileError}</p>}
      {saved && !profileError && <p className="pm-career-muted" role="status">Saved.</p>}
      <button type="submit" className="pm-career-btn" disabled={busy}>Save details</button>
    </form>

    <div className="pm-career-sharing">
      <h4>Sharing</h4>
      <p className="pm-career-muted">Both switches are off until you turn them on, and they work separately.</p>
      <ShareToggle field="shareWithSponsors" checked={!!p.shareWithSponsors} busy={busy} onAsk={setPendingShare} onTurnOff={turnOff} />
      <ShareToggle field="showOnPublicPage" checked={!!p.showOnPublicPage} busy={busy} onAsk={setPendingShare} onTurnOff={turnOff} />
      {pendingShare && <div className="pm-career-confirm" role="alertdialog" aria-label="Confirm sharing">
        <p>{SHARE_COPY[pendingShare].confirm}</p>
        <div className="pm-career-row-actions">
          <button type="button" className="pm-career-btn" onClick={confirmShare} disabled={busy}>Yes, turn it on</button>
          <button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={() => { setPendingShare(null); setShareError(''); }}>Cancel</button>
        </div>
      </div>}
      {shareError && <p className="pm-career-error" role="alert">{shareError}</p>}
    </div>

    <div className="pm-career-claims">
      <h4>Your claims</h4>
      <p className="pm-career-muted">A claim is a number you enter yourself, with a link that backs it up. It is shareable only after a lead verifies it. Pending claims never leave your view.</p>
      {claims.length > 0 && <ul className="pm-career-claim-list">{claims.map(c => <li key={c.id}>
        <span>{c.label}: {c.value}{c.unit ? ` ${c.unit}` : ''} <em>({statusLabel(c.status)})</em></span>
        {deletable(c) && <button type="button" className="pm-career-btn pm-career-btn--ghost" onClick={() => removeClaim(c.id)} disabled={busy} aria-label={`Delete claim: ${c.label}`}>Delete</button>}
      </li>)}</ul>}
      <form className="pm-career-form" onSubmit={submitClaim} aria-label="Add a claim" noValidate>
        <div className="pm-career-field"><label htmlFor="claim-label">What did you do?</label>
          <input id="claim-label" className="pm-career-input" maxLength={80} value={claim.label} onChange={e => setClaim({ ...claim, label: e.target.value })} /></div>
        <div className="pm-career-field"><label htmlFor="claim-value">Number</label>
          <input id="claim-value" className="pm-career-input" type="number" inputMode="decimal" min="0" step="any" value={claim.value} onChange={e => setClaim({ ...claim, value: e.target.value })} /></div>
        <div className="pm-career-field"><label htmlFor="claim-unit">Unit</label>
          <select id="claim-unit" className="pm-career-input" value={claim.unit} onChange={e => setClaim({ ...claim, unit: e.target.value })}>
            <option value="">No unit</option>
            {CLAIM_UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
          </select></div>
        <div className="pm-career-field"><label htmlFor="claim-url">Evidence link (https)</label>
          <input id="claim-url" className="pm-career-input" type="url" maxLength={500} placeholder="https://" value={claim.evidenceUrl} onChange={e => setClaim({ ...claim, evidenceUrl: e.target.value })} /></div>
        {claimError && <p className="pm-career-error" role="alert">{claimError}</p>}
        <button type="submit" className="pm-career-btn" disabled={busy}>Add claim</button>
      </form>
    </div>
  </section>;
}
