import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import OrbitLoader from '../../components/OrbitLoader';
import { Link, useSearchParams } from 'react-router-dom';
import { get, post, listProjectRepos, openDm } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import KudosButton from '../../components/clubpm/KudosButton';
import AvatarPortrait from '../../components/clubpm/avatar/AvatarPortrait';
import RankIcon from '../../components/clubpm/RankIcon';
import LeaderboardPanel from '../../components/clubpm/LeaderboardPanel';
import { tzOffset, copyToClipboard } from '../../clubpm/members/memberShared';
import { revealStagger } from '../../clubpm/anim/motion';
import { MemberName } from '../../clubpm/cosmetics/CosmeticStylesContext';
import toast from 'react-hot-toast';
import DmInbox from '../../components/clubpm/members/DmInbox';
import DmPanel from '../../components/clubpm/members/DmPanel';
import { SlackReconnectNotice } from '../../components/clubpm/chat/ChatComposer';

const ROLES = ['Admin', 'Lead', 'Member'];

// ── Stats header ──────────────────────────────────────────────

function MembersStats({ members }) {
  const total  = members.length;
  const admins = members.filter(m => m.isAdmin).length;

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
    </div>
  );
}

// ── Member card ───────────────────────────────────────────────

function MemberCard({ member, onClick, onMessage, selectable = false, selected = false, onToggleSelect }) {
  const { displayName, slackHandle, role, isAdmin, title, email, timezone, _count } = member;

  const taskCount    = _count?.tasks    ?? 0;
  const projectCount = _count?.projects ?? 0;
  const roleLabel    = isAdmin ? 'Admin' : (role === 'LEAD' ? 'Lead' : 'Member');
  const offset       = tzOffset(timezone);

  return (
    <div
      className={`pm-member-card pm-member-card--enriched${selected ? ' pm-member-card--selected' : ''}`}
      onClick={() => (selectable ? onToggleSelect?.(member) : onClick())}
      role="button"
      tabIndex={0}
      aria-pressed={selectable ? selected : undefined}
      onKeyDown={e => e.key === 'Enter' && (selectable ? onToggleSelect?.(member) : onClick())}
    >
      {selectable && (
        <div className={`pm-member-select${selected ? ' selected' : ''}`} aria-hidden="true">
          {selected && <i className="fas fa-check" />}
        </div>
      )}
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
          <div className="pm-member-name">
            <MemberName memberId={member.id}>{displayName}</MemberName>
          </div>
          {slackHandle && <div className="pm-member-handle">@{slackHandle}</div>}
          {title && <div className="pm-member-title">{title}</div>}
          <div className="pm-member-badges">
            <span className={`pm-member-role-badge ${isAdmin ? 'admin' : role?.toLowerCase() || 'member'}`}>
              {roleLabel}
            </span>
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
        {onMessage && (
          <button
            type="button"
            className="pm-member-card-message-btn"
            title={`Message ${displayName}`}
            aria-label={`Message ${displayName}`}
            onClick={() => onMessage(member)}
          >
            <i className="fas fa-comment" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── ContributorImportModal ────────────────────────────────────

function ContributorImportModal({ onClose, onImported }) {
  // Flattened list of repos across all projects: { repoId, projectId, label }.
  // Contributor discovery is inherently per-repo (multi-repo), so the old
  // "pick a project" selector is now "pick a repo".
  const [repoOptions, setRepoOptions] = useState([]);
  const [repoId, setRepoId]           = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [result, setResult]           = useState(null);
  const [manualLinks, setManualLinks] = useState({});
  const [importing, setImporting]     = useState(false);
  const [done, setDone]               = useState(null);

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
              label: `${p.name} (${r.slug})`,
            })))
            .catch(() => [])
        )
      );
      if (cancelled) return;
      setRepoOptions(perProject.flat());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const selectedRepo = repoOptions.find(o => o.repoId === repoId);

  const handleDiscover = async () => {
    if (!repoId) return;
    setDiscovering(true);
    setResult(null);
    try {
      const data = await get(`/api/github/repos/${repoId}/contributors`);
      setResult(data);
    } catch (err) {
      console.error('[contributor-import] discover failed:', err);
    } finally {
      setDiscovering(false);
    }
  };

  const handleImport = async () => {
    if (!selectedRepo) return;
    const links = [
      ...(result?.linked ?? []).map(c => ({ memberId: c.memberId, githubLogin: c.login })),
      ...Object.entries(manualLinks)
        .filter(([, memberId]) => memberId)
        .map(([login, memberId]) => ({ memberId, githubLogin: login })),
    ];
    if (links.length === 0) return;
    setImporting(true);
    try {
      const res = await post(`/api/github/projects/${selectedRepo.projectId}/import-members`, { links });
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
                <label>Repo</label>
                <select value={repoId} onChange={e => { setRepoId(e.target.value); setResult(null); }}>
                  <option value="">
                    {repoOptions.length === 0 ? 'No projects have a linked GitHub repo' : 'Select a repo…'}
                  </option>
                  {repoOptions.map(o => <option key={o.repoId} value={o.repoId}>{o.label}</option>)}
                </select>
                <button className="clubpm-btn-secondary" onClick={handleDiscover} disabled={!repoId || discovering}>
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

function MemberDrawer({ member, onClose, isOwnProfile, onMessage }) {
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
        {!isOwnProfile && onMessage && (
          <button type="button" className="pm-member-edit-profile-btn" onClick={() => onMessage(member)}>
            <i className="fas fa-comment" aria-hidden="true" /> Message
          </button>
        )}
      </div>
    </>,
    document.body
  );
}

// ── Main view ─────────────────────────────────────────────────

export default function MembersView({ projectId = null }) {
  const { member: currentMember } = useClubPmAuth();
  const canDm = !!currentMember?.slackCapabilities?.dm;
  const [searchParams, setSearchParams] = useSearchParams();
  const dmChannelId = searchParams.get('dm');

  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterRole, setFilterRole]         = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [showImport, setShowImport]         = useState(false);
  const [selecting, setSelecting]           = useState(false);
  const [selectedIds, setSelectedIds]       = useState(() => new Set());
  const [showReconnect, setShowReconnect]   = useState(false);
  const [opening, setOpening]               = useState(false);

  // GET /api/members already carries each member's projects, so the project
  // version is a filter, not a second endpoint.
  const fetchMembers = useCallback(() => {
    get('/api/members')
      .then(data => setMembers(
        projectId ? data.filter(m => m.projects?.some(pm => pm.project?.id === projectId)) : data
      ))
      .catch(err => console.error('Failed to load members:', err))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // The open DM is URL state (?dm=) so notifications can deep-link to it (D12).
  const setDm = useCallback((channelId) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (channelId) next.set('dm', channelId);
      else next.delete('dm');
      return next;
    });
  }, [setSearchParams]);

  const startDm = async (memberIds) => {
    if (!canDm) { setShowReconnect(true); return; }
    setOpening(true);
    try {
      const { channelId } = await openDm(memberIds);
      setSelecting(false);
      setSelectedIds(new Set());
      setSelectedMember(null);
      setDm(channelId);
    } catch (err) {
      if (err?.status === 409) setShowReconnect(true);
      else toast.error(err?.message || 'Could not open that conversation.');
    } finally {
      setOpening(false);
    }
  };

  const toggleSelect = (m) => {
    if (m.id === currentMember?.id) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(m.id)) next.delete(m.id);
      else if (next.size < 8) next.add(m.id);
      else toast.error('Group messages are limited to 8 other people — use a channel for larger groups.');
      return next;
    });
  };

  const rosterSlackIds = useMemo(
    () => (projectId ? new Set(members.map(m => m.slackId)) : null),
    [projectId, members]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter(m => {
      const matchesSearch = !q ||
        m.displayName?.toLowerCase().includes(q) ||
        m.slackHandle?.toLowerCase().includes(q) ||
        m.title?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q);

      const roleLabel = m.isAdmin ? 'Admin' : (m.role === 'LEAD' ? 'Lead' : 'Member');
      const matchesRole = !filterRole || roleLabel === filterRole;

      return matchesSearch && matchesRole;
    });
  }, [members, search, filterRole]);

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

  const messageFn = (m) => (m.id === currentMember?.id ? undefined : (target) => startDm([target.id]));

  return (
    <div className={`pm-members-page${projectId ? ' pm-members-page--project' : ''}`}>
      <div className="pm-members-header">
        <h1 className="pm-page-title">{projectId ? 'Project members' : 'Members'}</h1>
        <div className="pm-members-header-actions">
          <button
            type="button"
            className="clubpm-btn-secondary"
            aria-pressed={selecting}
            onClick={() => { setSelecting(s => !s); setSelectedIds(new Set()); }}
          >
            <i className="fas fa-user-group" aria-hidden="true" /> {selecting ? 'Cancel' : 'Group message'}
          </button>
          {!projectId && (
            <button className="clubpm-btn-secondary pm-gh-import-contrib-btn" onClick={() => setShowImport(true)}>
              <i className="fab fa-github" aria-hidden="true" /> Import Contributors
            </button>
          )}
        </div>
      </div>

      {showReconnect && <SlackReconnectNotice />}

      <div className={`pm-members-layout${dmChannelId ? ' pm-members-layout--dm' : ''}`}>
        <DmInbox activeChannelId={dmChannelId} onOpen={setDm} slackIdFilter={rosterSlackIds} />

        <div className="pm-members-roster">
          {!loading && <MembersStats members={members} />}

          <div className="pm-members-controls">
            <input
              className="pm-members-search"
              type="text"
              placeholder="Search by name, handle, title…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="pm-members-filters">
              <select
                className="pm-members-filter-select"
                value={filterRole}
                onChange={e => setFilterRole(e.target.value)}
              >
                <option value="">All roles</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {filterRole && (
                <button className="pm-members-filter-clear" onClick={() => setFilterRole('')}>
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
            <div ref={gridRef} className="pm-members-grid" data-tour-id={projectId ? undefined : "admin.members"}>
              {filtered.map(m => (
                <MemberCard
                  key={m.id}
                  member={m}
                  onClick={() => setSelectedMember(m)}
                  onMessage={messageFn(m)}
                  selectable={selecting && m.id !== currentMember?.id}
                  selected={selectedIds.has(m.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          )}
        </div>

        {dmChannelId && <DmPanel channelId={dmChannelId} onClose={() => setDm(null)} />}
      </div>

      {selecting && selectedIds.size > 0 && (
        <div className="pm-members-groupbar" role="region" aria-label="Group message">
          <label>{selectedIds.size} selected</label>
          <button
            type="button"
            className="clubpm-btn-primary"
            disabled={opening}
            onClick={() => startDm([...selectedIds])}
          >
            <i className="fas fa-paper-plane" aria-hidden="true" />{' '}
            Message {selectedIds.size === 1 ? '1 person' : `${selectedIds.size} people`}
          </button>
        </div>
      )}

      {selectedMember && (
        <MemberDrawer
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          isOwnProfile={currentMember?.id === selectedMember.id}
          onMessage={(m) => startDm([m.id])}
        />
      )}

      {showImport && !projectId && (
        <ContributorImportModal
          onClose={() => setShowImport(false)}
          onImported={fetchMembers}
        />
      )}

      {/* Moved off the Dashboard — the XP/doubloon ranking reads as part of the
          roster. LeaderboardPanel fetches its own data. Club-wide page only. */}
      {!projectId && (
        <div data-tour-id="dash.leaderboard" style={{ marginTop: 24 }}><LeaderboardPanel /></div>
      )}
    </div>
  );
}
