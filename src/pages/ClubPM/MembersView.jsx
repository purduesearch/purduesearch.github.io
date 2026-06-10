import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import OrbitLoader from '../../components/OrbitLoader';
import { Link } from 'react-router-dom';
import { get, post } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import KudosButton from '../../components/clubpm/KudosButton';
import AvatarPortrait from '../../components/clubpm/avatar/AvatarPortrait';
import RankIcon from '../../components/clubpm/RankIcon';
import { tzOffset, copyToClipboard } from '../../clubpm/members/memberShared';
import { revealStagger } from '../../clubpm/anim/motion';

const ROLES = ['Admin', 'Lead', 'Member'];

// ── Stats header ──────────────────────────────────────────────

function MembersStats({ members }) {
  const total  = members.length;
  const admins = members.filter(m => m.isAdmin).length;
  const teamMap = {};
  members.forEach(m => {
    const t = m.team || 'Unassigned';
    teamMap[t] = (teamMap[t] || 0) + 1;
  });

  return (
    <div className="pm-members-stats-bar">
      <div className="pm-members-stat">
        <span className="pm-members-stat-num">{total}</span>
        <span className="pm-members-stat-label">Members</span>
      </div>
      <div className="pm-members-stat">
        <span className="pm-members-stat-num">{admins}</span>
        <span className="pm-members-stat-label">Admins</span>
      </div>
      <div className="pm-members-stat">
        <span className="pm-members-stat-num">{Object.keys(teamMap).filter(k => k !== 'Unassigned').length}</span>
        <span className="pm-members-stat-label">Teams</span>
      </div>
      <div className="pm-members-teams-breakdown">
        {Object.entries(teamMap)
          .filter(([k]) => k !== 'Unassigned')
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([team, count]) => (
            <span key={team} className="pm-members-team-chip">
              {team} <span className="pm-members-team-count">{count}</span>
            </span>
          ))}
      </div>
    </div>
  );
}

// ── Member card ───────────────────────────────────────────────

function MemberCard({ member, onClick }) {
  const { displayName, slackHandle, role, isAdmin, title, email, team, timezone, _count } = member;

  const taskCount    = _count?.tasks    ?? 0;
  const projectCount = _count?.projects ?? 0;
  const roleLabel    = isAdmin ? 'Admin' : (role === 'LEAD' ? 'Lead' : 'Member');
  const offset       = tzOffset(timezone);

  return (
    <div className="pm-member-card pm-member-card--enriched" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className="pm-member-top">
        <span className="pm-member-avatar-wrap">
          <AvatarPortrait member={member} size={56} className="pm-member-avatar" />
          {member.rank ? (
            <span className="cpm-member-badge-rank-overlay" aria-hidden="true">
              <RankIcon member={member} size={24} />
            </span>
          ) : null}
        </span>
        <div className="pm-member-info">
          <div className="pm-member-name">{displayName}</div>
          {slackHandle && <div className="pm-member-handle">@{slackHandle}</div>}
          {title && <div className="pm-member-title">{title}</div>}
          <div className="pm-member-badges">
            <span className={`pm-member-role-badge ${isAdmin ? 'admin' : role?.toLowerCase() || 'member'}`}>
              {roleLabel}
            </span>
            {team && <span className="pm-member-team-badge">{team}</span>}
          </div>
        </div>
      </div>

      <div className="pm-member-card-body">
        {email && (
          <button
            className="pm-member-email-btn"
            onClick={e => { e.stopPropagation(); copyToClipboard(email); }}
            title="Click to copy email"
          >
            <i className="fas fa-envelope" />
            <span>{email}</span>
          </button>
        )}
        {offset && (
          <div className="pm-member-tz">
            <i className="fas fa-clock" />
            <span>{offset}</span>
          </div>
        )}
      </div>

      <div className="pm-member-stats">
        <span className="pm-member-stat">
          <i className="fas fa-tasks" />
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </span>
        <span className="pm-member-stat">
          <i className="fas fa-folder" />
          {projectCount} project{projectCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="pm-member-card-actions" onClick={e => e.stopPropagation()}>
        <Link
          to={`/clubpm/profile/${member.id}`}
          className="pm-member-card-profile-btn"
          title="View full profile"
        >
          <i className="fas fa-user" />
        </Link>
        <KudosButton memberId={member.id} displayName={displayName} />
      </div>
    </div>
  );
}

// ── ContributorImportModal ────────────────────────────────────

function ContributorImportModal({ onClose, onImported }) {
  const [projects, setProjects]       = useState([]);
  const [projectId, setProjectId]     = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [result, setResult]           = useState(null);
  const [manualLinks, setManualLinks] = useState({});
  const [importing, setImporting]     = useState(false);
  const [done, setDone]               = useState(null);

  useEffect(() => {
    get('/api/projects').then(data => {
      const withRepo = (data ?? []).filter(p => p.githubRepo);
      setProjects(withRepo);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleDiscover = async () => {
    if (!projectId) return;
    setDiscovering(true);
    setResult(null);
    try {
      const data = await get(`/api/github/projects/${projectId}/contributors`);
      setResult(data);
    } catch (err) {
      console.error('[contributor-import] discover failed:', err);
    } finally {
      setDiscovering(false);
    }
  };

  const handleImport = async () => {
    const links = [
      ...(result?.linked ?? []).map(c => ({ memberId: c.memberId, githubLogin: c.login })),
      ...Object.entries(manualLinks)
        .filter(([, memberId]) => memberId)
        .map(([login, memberId]) => ({ memberId, githubLogin: login })),
    ];
    if (links.length === 0) return;
    setImporting(true);
    try {
      const res = await post(`/api/github/projects/${projectId}/import-members`, { links });
      setDone(res);
      onImported?.();
    } catch (err) {
      console.error('[contributor-import] import failed:', err);
    } finally {
      setImporting(false);
    }
  };

  return createPortal(
    <div className="cpm-gh-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-gh-modal cpm-gh-contributor-modal" role="dialog" aria-label="Import GitHub contributors">
        <div className="cpm-gh-modal-header">
          <span>Import GitHub Contributors</span>
          <button className="cpm-gh-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="cpm-gh-modal-body">
          {done ? (
            <div className="pm-gh-import-done">
              <i className="fas fa-check-circle" style={{ color: 'var(--clubpm-accent-green)', fontSize: '2rem' }} />
              <p>Added {done.added} contributor{done.added !== 1 ? 's' : ''} to the project.</p>
              <button className="clubpm-btn-primary" onClick={onClose}>Done</button>
            </div>
          ) : (
            <>
              <div className="pm-gh-import-row">
                <label>Project</label>
                <select value={projectId} onChange={e => { setProjectId(e.target.value); setResult(null); }}>
                  <option value="">Select a project with a GitHub repo…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.githubRepo})</option>)}
                </select>
                <button className="clubpm-btn-secondary" onClick={handleDiscover} disabled={!projectId || discovering}>
                  {discovering ? 'Discovering…' : 'Discover'}
                </button>
              </div>

              {result && (
                <>
                  {result.linked.length > 0 && (
                    <div className="pm-gh-contrib-section">
                      <div className="pm-gh-contrib-section-title">
                        Matched ({result.linked.length})
                      </div>
                      {result.linked.map(c => (
                        <div key={c.login} className="pm-gh-contrib-row">
                          {c.avatarUrl && <img src={c.avatarUrl} alt="" className="pm-gh-contrib-avatar" />}
                          <span className="pm-gh-contrib-login">@{c.login}</span>
                          <span className="pm-gh-contrib-arrow">→</span>
                          <span className="pm-gh-contrib-name">{c.displayName}</span>
                          <span className="pm-gh-contrib-commits">{c.contributions} commits</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {result.unmatched.length > 0 && (
                    <div className="pm-gh-contrib-section">
                      <div className="pm-gh-contrib-section-title">
                        Unmatched — link manually ({result.unmatched.length})
                      </div>
                      {result.unmatched.map(c => (
                        <div key={c.login} className="pm-gh-contrib-row">
                          {c.avatarUrl && <img src={c.avatarUrl} alt="" className="pm-gh-contrib-avatar" />}
                          <span className="pm-gh-contrib-login">@{c.login}</span>
                          <span className="pm-gh-contrib-commits">{c.contributions} commits</span>
                          <input
                            className="pm-gh-contrib-member-input"
                            placeholder="ClubPM member ID (or skip)"
                            value={manualLinks[c.login] ?? ''}
                            onChange={e => setManualLinks(prev => ({ ...prev, [c.login]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="cpm-gh-modal-footer">
                    <button className="clubpm-btn-primary" onClick={handleImport} disabled={importing}>
                      {importing ? 'Importing…' : 'Import to Project'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Member detail drawer ──────────────────────────────────────

function MemberDrawer({ member, onClose, isOwnProfile }) {
  const offset = tzOffset(member.timezone);

  return createPortal(
    <>
      <div className="pm-drawer-overlay" onClick={onClose} />
      <div className="pm-member-drawer open">
        <button className="pm-member-drawer-close" onClick={onClose}>×</button>

        <div className="pm-member-drawer-profile">
          <span className="pm-member-avatar-wrap pm-member-avatar-wrap--lg">
            <AvatarPortrait member={member} size={88} className="pm-member-drawer-avatar" />
            {member.rank ? (
              <span className="cpm-member-badge-rank-overlay" aria-hidden="true">
                <RankIcon member={member} size={36} />
              </span>
            ) : null}
          </span>
          <div className="pm-member-drawer-name">{member.displayName}</div>
          {member.title && <div className="pm-member-drawer-title">{member.title}</div>}
          <div className="pm-member-drawer-badges">
            <span className={`pm-member-role-badge ${member.isAdmin ? 'admin' : 'member'}`}>
              {member.isAdmin ? 'Admin' : member.role === 'LEAD' ? 'Lead' : 'Member'}
            </span>
            {member.team && <span className="pm-member-team-badge">{member.team}</span>}
          </div>
        </div>

        <div className="pm-member-drawer-meta">
          {member.slackHandle && (
            <div className="pm-member-drawer-row">
              <i className="fab fa-slack" />
              <span>@{member.slackHandle}</span>
            </div>
          )}
          {member.email && (
            <div className="pm-member-drawer-row pm-member-drawer-row--clickable" onClick={() => copyToClipboard(member.email)} title="Copy email">
              <i className="fas fa-envelope" />
              <span>{member.email}</span>
              <i className="fas fa-copy pm-member-copy-icon" />
            </div>
          )}
          {offset && (
            <div className="pm-member-drawer-row">
              <i className="fas fa-clock" />
              <span>{offset} ({member.timezone})</span>
            </div>
          )}
          {member.githubLogin && (
            <div className="pm-member-drawer-row">
              <i className="fab fa-github" />
              <a href={`https://github.com/${member.githubLogin}`} target="_blank" rel="noreferrer">
                @{member.githubLogin}
              </a>
            </div>
          )}
        </div>

        {member.bio && (
          <div className="pm-member-drawer-bio">{member.bio}</div>
        )}

        {isOwnProfile ? (
          <Link to="/clubpm/profile" className="pm-member-edit-profile-btn" onClick={onClose}>
            <i className="fas fa-user" /> Open my profile
          </Link>
        ) : (
          <Link to={`/clubpm/profile/${member.id}`} className="pm-member-edit-profile-btn" onClick={onClose}>
            <i className="fas fa-external-link-alt" /> View full profile
          </Link>
        )}
      </div>
    </>,
    document.body
  );
}

// ── Main view ─────────────────────────────────────────────────

export default function MembersView() {
  const { member: currentMember } = useClubPmAuth();
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterTeam, setFilterTeam]         = useState('');
  const [filterRole, setFilterRole]         = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [showImport, setShowImport]         = useState(false);

  const fetchMembers = useCallback(() => {
    get('/api/members')
      .then(data => setMembers(data))
      .catch(err => console.error('Failed to load members:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter(m => {
      const matchesSearch = !q ||
        m.displayName?.toLowerCase().includes(q) ||
        m.slackHandle?.toLowerCase().includes(q) ||
        m.title?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.team?.toLowerCase().includes(q);

      const matchesTeam = !filterTeam || m.team === filterTeam;

      const roleLabel = m.isAdmin ? 'Admin' : (m.role === 'LEAD' ? 'Lead' : 'Member');
      const matchesRole = !filterRole || roleLabel === filterRole;

      return matchesSearch && matchesTeam && matchesRole;
    });
  }, [members, search, filterTeam, filterRole]);

  const teams = useMemo(() => {
    const t = new Set(members.map(m => m.team).filter(Boolean));
    return [...t].sort();
  }, [members]);

  const gridRef = useRef(null);
  // Only animate when loading flips true → false AFTER we've observed loading.
  // Initial mount (before fetch starts) must NOT animate, and filter/search
  // changes (which only mutate `filtered`) also must not re-trigger.
  const sawLoadingRef = useRef(false);
  useEffect(() => {
    if (loading) {
      sawLoadingRef.current = true;
      return;
    }
    if (!sawLoadingRef.current) return;
    sawLoadingRef.current = false;
    if (!gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('.pm-member-card');
    if (cards.length) revealStagger(cards, { delay: 50, duration: 480 });
  }, [loading]);

  return (
    <div className="pm-members-page">
      <div className="pm-members-header">
        <h1 className="pm-page-title">Members</h1>
        <button className="clubpm-btn-secondary pm-gh-import-contrib-btn" onClick={() => setShowImport(true)}>
          <i className="fab fa-github" aria-hidden="true" /> Import Contributors
        </button>
      </div>

      {!loading && <MembersStats members={members} />}

      <div className="pm-members-controls">
        <input
          className="pm-members-search"
          type="text"
          placeholder="Search by name, handle, title, team…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="pm-members-filters">
          <select
            className="pm-members-filter-select"
            value={filterTeam}
            onChange={e => setFilterTeam(e.target.value)}
          >
            <option value="">All teams</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            className="pm-members-filter-select"
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
          >
            <option value="">All roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {(filterTeam || filterRole) && (
            <button className="pm-members-filter-clear" onClick={() => { setFilterTeam(''); setFilterRole(''); }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><OrbitLoader size={80} /></div>
      ) : filtered.length === 0 ? (
        <div className="pm-empty-state">No members found.</div>
      ) : (
        <div ref={gridRef} className="pm-members-grid">
          {filtered.map(m => (
            <MemberCard
              key={m.id}
              member={m}
              onClick={() => setSelectedMember(m)}
            />
          ))}
        </div>
      )}

      {selectedMember && (
        <MemberDrawer
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          isOwnProfile={currentMember?.id === selectedMember.id}
        />
      )}

      {showImport && (
        <ContributorImportModal
          onClose={() => setShowImport(false)}
          onImported={fetchMembers}
        />
      )}
    </div>
  );
}
