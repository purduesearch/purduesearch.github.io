import { useState } from 'react';

const MAX_SHOWN = 6;
const FILL = { width: '100%', height: '100%', borderRadius: '50%', display: 'block' };

function initials(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function StackAvatar({ name, avatarUrl, color, away, title, onOpen }) {
  const [failed, setFailed] = useState(false);
  const className = 'cpm-presence-stack-avatar' + (away ? ' is-away' : '');
  const style = { '--presence-color': color };
  const face = !avatarUrl || failed
    ? <span style={{ ...FILL, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, background: color, color: '#0a0e13' }}>{initials(name)}</span>
    : <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={FILL} />;
  if (!away) return <span className={className} style={style} title={title}>{face}</span>;
  return (
    <button type="button" className={className} style={{ ...style, padding: 0, font: 'inherit' }} title={title} aria-label={title} onClick={onOpen}>
      {face}
    </button>
  );
}

/** Who else is on this board, plus people on sibling boards in the same family. */
export default function PresenceStack({ presence, core, selfMemberId, onOpenProject }) {
  if (!presence || !core) return null;

  // Board members first, then people elsewhere in the family; one avatar per person, self first.
  const ordered = [...presence.conns.values()].sort((a, b) =>
    (a.room === presence.room ? 0 : 1) - (b.room === presence.room ? 0 : 1)
    || (a.memberId === selfMemberId ? 0 : 1) - (b.memberId === selfMemberId ? 0 : 1));
  const seen = new Set();
  const people = ordered.filter(conn => {
    if (seen.has(conn.memberId)) return false;
    seen.add(conn.memberId);
    return true;
  });
  if (!people.length) return null;

  const shown = people.slice(0, MAX_SHOWN);
  const more = people.length - shown.length;

  return (
    <div className="cpm-presence-stack" aria-label="People on this board">
      {shown.map(conn => {
        const away = conn.room !== presence.room;
        const name = conn.name || 'Someone';
        const title = away ? `${name} · on ${presence.projects.get(conn.room) ?? 'another'} board` : name;
        return (
          <StackAvatar
            key={conn.memberId}
            name={name}
            avatarUrl={conn.avatarUrl}
            color={core.memberColor(conn.memberId)}
            away={away}
            title={title}
            onOpen={() => onOpenProject(conn.room)}
          />
        );
      })}
      {more > 0 ? <span className="cpm-presence-stack-more">+{more}</span> : null}
    </div>
  );
}
