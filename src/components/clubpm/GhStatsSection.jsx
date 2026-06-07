import { useEffect, useState } from 'react';
import { get } from '../../api/clubPmClient';

export default function GhStatsSection({ memberId }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    get('/api/projects').then(data => {
      const withRepo = (data ?? []).filter(p => p.githubRepo);
      setProjects(withRepo);
      if (withRepo.length === 1) setProjectId(withRepo[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) { setStats(null); return; }
    setLoading(true);
    get(`/api/github/members/${memberId}/stats?projectId=${projectId}`)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [memberId, projectId]);

  if (projects.length === 0) return null;

  return (
    <div className="pm-member-drawer-section">
      <div className="pm-member-drawer-section-title">
        <i className="fab fa-github" aria-hidden="true" /> GitHub (30d)
      </div>
      {projects.length > 1 && (
        <select className="pm-gh-stats-project-select"
          value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">Select a project…</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {loading && <div className="pm-spinner-wrap" style={{ padding: '8px 0' }}><div className="pm-spinner" /></div>}
      {stats && !loading && (
        <div className="pm-gh-stats-row">
          <div className="pm-gh-stat-tile">
            <span className="pm-gh-stat-num">{stats.commits30d}</span>
            <span className="pm-gh-stat-label">Commits</span>
          </div>
          <div className="pm-gh-stat-tile">
            <span className="pm-gh-stat-num">{stats.prsOpened30d}</span>
            <span className="pm-gh-stat-label">PRs opened</span>
          </div>
          <div className="pm-gh-stat-tile">
            <span className="pm-gh-stat-num">{stats.reviews30d}</span>
            <span className="pm-gh-stat-label">Reviews</span>
          </div>
        </div>
      )}
    </div>
  );
}
