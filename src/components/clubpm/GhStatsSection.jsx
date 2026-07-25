import { useEffect, useState } from 'react';
import { get, listProjectRepos } from '../../api/clubPmClient';
import OrbitLoader from '../OrbitLoader';

export default function GhStatsSection({ memberId }) {
  // Flattened list of repos across all projects: { repoId, projectId, label }.
  // A project can now have zero, one, or many linked repos (multi-repo), so
  // this replaces the old "pick a project" selector with "pick a repo".
  const [repoOptions, setRepoOptions] = useState([]);
  const [repoId, setRepoId] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    get('/api/projects').then(async data => {
      const projects = data ?? [];
      const perProject = await Promise.all(
        projects.map(p =>
          listProjectRepos(p.id)
            .then(res => (res?.repos ?? []).map(r => ({
              repoId: r.id,
              projectId: p.id,
              label: projects.length > 1 ? `${p.name} — ${r.slug}` : r.slug,
            })))
            .catch(() => [])
        )
      );
      if (cancelled) return;
      const options = perProject.flat();
      setRepoOptions(options);
      if (options.length === 1) setRepoId(options[0].repoId);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!repoId) { setStats(null); return; }
    setLoading(true);
    get(`/api/github/repos/${repoId}/members/${memberId}/stats`)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [memberId, repoId]);

  if (repoOptions.length === 0) return null;

  return (
    <div className="pm-member-drawer-section">
      <div className="pm-member-drawer-section-title">
        <i className="fab fa-github" aria-hidden="true" /> GitHub (30d)
      </div>
      {repoOptions.length > 1 && (
        <select className="pm-gh-stats-project-select"
          value={repoId} onChange={e => setRepoId(e.target.value)}>
          <option value="">Select a repo…</option>
          {repoOptions.map(o => <option key={o.repoId} value={o.repoId}>{o.label}</option>)}
        </select>
      )}
      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}><OrbitLoader size={48} /></div>}
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
