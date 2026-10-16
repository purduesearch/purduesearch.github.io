import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { skillsApi } from '../../../api/clubPmClient';

export default function ProfileSkillsSummary() {
  const [data, setData] = useState(null);
  useEffect(() => { let live = true; skillsApi.me().then(r => { if (live) setData(r); }).catch(() => {}); return () => { live = false; }; }, []);
  const skills = data?.groups.flatMap(g => g.skills) ?? [];
  return <section className="cpm-profile-card"><h3>Skills</h3><p className="cpm-skills-notice">Explore the work behind your experience and choose what you want to learn next.</p><div className="pm-sk-pills">{skills.slice(0, 4).map(s => <Link key={s.skillId} className="pm-sk-pill" to={`/clubpm/skills?skill=${s.skillId}`}>{s.name}</Link>)}</div><Link className="pm-sk-text-link" to="/clubpm/skills">Open your Skills workspace{skills.length ? ` · ${skills.length} skills` : ''} →</Link></section>;
}
