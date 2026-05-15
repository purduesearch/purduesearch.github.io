import { useState, useEffect } from 'react';
import { get } from '../../api/clubPmClient';

export default function MembersView() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    get('/api/members')
      .then(data => setMembers(data))
      .catch(err => console.error('Failed to load members:', err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (
      m.displayName?.toLowerCase().includes(q) ||
      m.slackHandle?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="pm-members-page">
      <div className="pm-members-header">
        <h1 className="pm-page-title">Members</h1>
        <input
          className="pm-members-search"
          type="text"
          placeholder="Search by name or handle…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="pm-spinner-wrap">
          <div className="pm-spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="pm-empty-state">No members found.</div>
      ) : (
        <div className="pm-members-grid">
          {filtered.map(member => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberCard({ member }) {
  const { displayName, slackHandle, avatarUrl, role, isAdmin, _count } = member;

  const initials = (displayName || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const taskCount = _count?.tasks ?? 0;
  const projectCount = _count?.projects ?? 0;
  const roleLabel = isAdmin ? 'Admin' : (role || 'Member');

  return (
    <div className="pm-member-card">
      <div className="pm-member-top">
        {avatarUrl ? (
          <img
            className="pm-member-avatar"
            src={avatarUrl}
            alt={displayName}
          />
        ) : (
          <div className="pm-member-avatar initials">{initials}</div>
        )}
        <div className="pm-member-info">
          <div className="pm-member-name">{displayName}</div>
          {slackHandle && (
            <div className="pm-member-handle">@{slackHandle}</div>
          )}
          <span className={`pm-member-role ${isAdmin ? 'admin' : 'member'}`}>
            {roleLabel}
          </span>
        </div>
      </div>
      <div className="pm-member-stats">
        <span className="pm-member-stat">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
        <span className="pm-member-stat">{projectCount} project{projectCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
