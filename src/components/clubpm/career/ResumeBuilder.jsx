import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { careerApi } from '../../../api/clubPmClient';

/** Only bullets that are verified, not pending, and ticked ever reach the paper, the copy text or an export. */
export const isExportable = b => b.shareable && !b.pending && b.selected && !b.hidden;

export function resumeText({ name, headline, bullets, certifications, skills = [] }) {
  const lines = [];
  if (name) lines.push(name);
  if (headline) lines.push(headline);
  if (lines.length) lines.push('');
  if (bullets.length) { lines.push('Impact'); bullets.forEach(b => lines.push(`- ${b.text}`)); }
  if (certifications.length) {
    if (lines.length) lines.push('');
    lines.push('Certifications');
    certifications.forEach(c => lines.push(`- ${[c.name, c.issuer, c.date].filter(Boolean).join(', ')}`));
  }
  return lines.join('\n');
}

function linkedInUrl(badge) {
  const d = badge.issuedAt ? new Date(badge.issuedAt) : null;
  const p = new URLSearchParams({ startTask: 'CERTIFICATION_NAME', name: badge.name, organizationName: 'Purdue SEARCH' });
  if (d && !Number.isNaN(d.getTime())) { p.set('issueYear', String(d.getUTCFullYear())); p.set('issueMonth', String(d.getUTCMonth() + 1)); }
  return `https://www.linkedin.com/profile/add?${p.toString()}`;
}

export default function ResumeBuilder({ name, profile, bullets, certifications = [], skills = [], badges = [] }) {
  const [busy, setBusy] = useState(false);
  const included = bullets.filter(isExportable);
  const text = resumeText({ name, headline: profile?.headline, bullets: included, certifications, skills });

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success('Résumé text copied'); }
    catch { toast.error('Could not copy. Select the text in the preview instead.'); }
  };
  const download = async () => {
    if (busy) return;
    setBusy(true);
    try { await careerApi.downloadResumeJson(); }
    catch (e) { toast.error(e?.message || 'Could not download the JSON Resume'); }
    finally { setBusy(false); }
  };

  return <section className="pm-career-resume" aria-label="Résumé preview">
    <div className="pm-career-paper" data-testid="career-paper">
      <h3>{name || 'Your name'}</h3>
      {profile?.headline && <p className="pm-career-paper-sub">{profile.headline}</p>}
      <h4>Impact</h4>
      {included.length
        ? <ul>{included.map(b => <li key={b.key}>{b.text}</li>)}</ul>
        : <p className="pm-career-paper-empty">Tick at least one verified bullet to see it here.</p>}
      {certifications.length > 0 && <>
        <h4>Certifications</h4>
        <ul>{certifications.map((c, i) => <li key={`${c.name}-${i}`}>{[c.name, c.issuer, c.date].filter(Boolean).join(', ')}</li>)}</ul>
      </>}
      {skills.length > 0 && <p className="pm-career-paper-skills"><b>Skills:</b> {skills.join(' · ')}</p>}
    </div>
    <div className="pm-career-exports">
      <button type="button" className="pm-career-btn" onClick={copy} disabled={!included.length}><i className="fas fa-copy" aria-hidden="true" /> Copy text</button>
      <Link className="pm-career-btn" to="/clubpm/career/print"><i className="fas fa-print" aria-hidden="true" /> Print / PDF</Link>
      <button type="button" className="pm-career-btn" onClick={download} disabled={busy}><i className="fas fa-file-code" aria-hidden="true" /> JSON Resume</button>
    </div>
    {badges.length > 0 && <div className="pm-career-linkedin">
      <h4>Badges</h4>
      <ul>{badges.map(b => <li key={b.achievementId}><span>{b.name}</span>
        <a className="pm-career-btn" href={linkedInUrl(b)} target="_blank" rel="noopener noreferrer"><i className="fab fa-linkedin" aria-hidden="true" /> Add to LinkedIn profile</a></li>)}</ul>
    </div>}
    <p className="pm-career-note">Exports include only counted or lead-verified items you have ticked. Pending items never leave this page.</p>
  </section>;
}
