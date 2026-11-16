import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { careerApi } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import { isExportable } from '../../components/clubpm/career/ResumeBuilder';

const PRINT_PATH = '/clubpm/career/print';
const OPEN_LABELS = { INTERNSHIP: 'Internship', COOP: 'Co-op', FULL_TIME: 'Full-time', RESEARCH: 'Research' };

export default function CareerPrint() {
  const { member, loading } = useClubPmAuth() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.body.classList.add('pm-career-print-body');
    document.documentElement.classList.add('pm-career-print-html');
    return () => {
      document.body.classList.remove('pm-career-print-body');
      document.documentElement.classList.remove('pm-career-print-html');
    };
  }, []);

  const hasMember = !!member;
  useEffect(() => {
    if (!hasMember) return undefined;
    let live = true;
    careerApi.me().then(r => { if (live) setData(r); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [hasMember]);

  if (loading) return <div className="pm-career-print"><p role="status">Loading…</p></div>;
  if (!member) return <Navigate to={`/clubpm/login?returnTo=${encodeURIComponent(PRINT_PATH)}`} replace />;

  const actions = <div className="pm-career-print-actions">
    <Link to="/clubpm/profile?tab=skills&view=career">← Back to Career</Link>
    <button type="button" onClick={() => window.print()}><i className="fas fa-print" aria-hidden="true" /> Print</button>
  </div>;
  if (error) return <div className="pm-career-print">{actions}<p role="alert">Your résumé could not be loaded.</p></div>;
  if (!data) return <div className="pm-career-print">{actions}<p role="status">Loading…</p></div>;

  const profile = data.profile || {};
  const bullets = (data.bullets || []).filter(isExportable);
  const certs = data.certifications || [];
  const skills = data.skills || [];
  const targets = data.targets || [];
  const meta = [profile.major, profile.gradTerm && `Graduating ${profile.gradTerm}`].filter(Boolean).join(' · ');
  const open = (profile.openTo || []).map(k => OPEN_LABELS[k] || k).join(', ');

  return <div className="pm-career-print">
    {actions}
    <article className="pm-career-print-page">
      <h1>{member.displayName || member.name || ''}</h1>
      {profile.headline && <p className="pm-career-print-headline">{profile.headline}</p>}
      {meta && <p className="pm-career-print-meta">{meta}</p>}
      {targets.length > 0 && <p className="pm-career-print-meta">Target roles: {targets.map(t => t.title).join(', ')}</p>}
      {open && <p className="pm-career-print-meta">Open to: {open}</p>}
      {bullets.length > 0 && <section><h2>Impact</h2><ul>{bullets.map(b => <li key={b.key}>{b.text}</li>)}</ul></section>}
      {certs.length > 0 && <section><h2>Certifications</h2><ul>{certs.map((c, i) => <li key={`${c.name}-${i}`}>{[c.name, c.issuer, c.date].filter(Boolean).join(', ')}</li>)}</ul></section>}
      {skills.length > 0 && <section><h2>Skills</h2><p>{skills.join(' · ')}</p></section>}
      {data.attribution && <footer className="pm-career-print-attr">{data.attribution}</footer>}
    </article>
  </div>;
}
