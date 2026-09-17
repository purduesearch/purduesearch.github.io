import React from 'react';
import AvatarPortrait from './avatar/AvatarPortrait';
import RankIcon from './RankIcon';
import StreakBadge from './StreakBadge';
import { progressToNextRank } from '../../clubpm/engagement/rankProgress';

// Same matching rule as the desktop sidebar's isChildActive: /clubpm/outreach
// and /clubpm/outreach?tab=blog are one route but must not both light up.
function isCurrent(href, location, activePrefixes = []) {
  if (activePrefixes.some(prefix => location.pathname.startsWith(prefix))) return true;
  const [path, query] = href.split('?');
  if (location.pathname !== path) return false;
  const wantTab = query ? new URLSearchParams(query).get('tab') : null;
  const haveTab = new URLSearchParams(location.search).get('tab');
  return wantTab ? haveTab === wantTab : !haveTab;
}

function Row({ href, icon, label, location, onNavigate, tourId, activePrefixes, children }) {
  const current = isCurrent(href, location, activePrefixes);
  return (
    <a
      href={href}
      className="pm-m-row"
      aria-current={current ? 'page' : undefined}
      data-tour-id={tourId}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate(href);
      }}
    >
      <i className={`fas ${icon} pm-m-row-icon`} aria-hidden="true" />
      <div className="pm-m-row-main">{label}</div>
      {children}
    </a>
  );
}

/**
 * Body of the phone More sheet: every destination the bottom bar does not
 * carry, plus the account and reward controls the desktop sidebar and topbar
 * hold (plan §4.2). Order: account, progress, people, tools, help, then the
 * two leave-the-app rows with a gap before Sign out.
 *
 * Permissions and badges mirror the desktop sidebar exactly: Admin renders only
 * for `member.isAdmin`, with the same three pending counts.
 */
export default function MobileMoreMenu({ member, location, adminCounts, onNavigate, onShowHelp, onLogout }) {
  const xp = member.xp ?? 0;
  const doubloons = member.doubloons ?? 0;
  const { pct, next } = progressToNextRank(xp);
  const hasAdminBadges = adminCounts.rewards > 0 || adminCounts.crs > 0 || adminCounts.certificates > 0;
  const row = { location, onNavigate };

  return (
    <div className="pm-m-more">
      <div className="pm-m-card pm-m-account">
        <AvatarPortrait member={member} size={44} className="pm-user-avatar" />
        <div className="pm-m-row-main">
          <div className="pm-m-row-title">{member.displayName}</div>
          <div className="pm-m-row-meta">@{member.slackHandle}</div>
        </div>
        <div className="pm-m-rank" data-tour-id="nav.rank">
          <RankIcon member={member} size={30} />
        </div>
      </div>
      <div className="pm-m-card">
        <Row {...row} href="/clubpm/profile" icon="fa-user" label="Profile" tourId="nav.profile" />
      </div>

      <div className="pm-m-group-label">Progress &amp; rewards</div>
      <div className="pm-m-card">
        <div className="pm-m-progress" data-tour-id="nav.xp">
          <div className="pm-m-xpbar" aria-hidden="true">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="pm-m-stats">
            <div className="pm-m-stat">
              <b>{xp.toLocaleString()}</b>
              <small>{next ? `of ${next.minXp.toLocaleString()} XP` : 'XP · max rank'}</small>
            </div>
            <div className="pm-m-stat">
              <b><i className="fas fa-coins" aria-hidden="true" /> {doubloons.toLocaleString()}</b>
              <small>doubloons</small>
            </div>
            <div className="pm-m-stat pm-m-stat--streak" data-tour-id="topbar.streak">
              <StreakBadge />
              <small>streak</small>
            </div>
          </div>
        </div>
        <Row {...row} href="/clubpm/challenges" icon="fa-trophy" label="Quests & achievements" tourId="topbar.challenges" />
        <Row {...row} href="/clubpm/shop" icon="fa-store" label="Shop" tourId="nav.shop" />
      </div>

      <div className="pm-m-group-label">People &amp; notifications</div>
      <div className="pm-m-card">
        <Row {...row} href="/clubpm/members" icon="fa-user-group" label="People & DMs" tourId="nav.members" />
        <Row {...row} href="/clubpm/notifications" icon="fa-bell" label="Notification Center" />
        <Row {...row} href="/clubpm/notifications/preferences" icon="fa-sliders" label="Notification preferences" />
      </div>

      <div className="pm-m-group-label">Tools</div>
      <div className="pm-m-card">
        <Row {...row} href="/clubpm/outreach" icon="fa-bullhorn" label="Outreach Hub" />
        <Row {...row} href="/clubpm/outreach?tab=blog" icon="fa-newspaper" label="Blog" activePrefixes={['/clubpm/outreach/blog/']} />
        <Row {...row} href="/clubpm/courses" icon="fa-graduation-cap" label="Courses" tourId="nav.courses" activePrefixes={['/clubpm/courses/']} />
        {member.isAdmin && (
          <Row {...row} href="/clubpm/admin" icon="fa-shield-halved" label="Admin" tourId="nav.admin" activePrefixes={['/clubpm/meeting-notes']}>
            {hasAdminBadges && (
              <div className="pm-admin-badge-group">
                {adminCounts.rewards > 0 && <b className="pm-admin-badge" title="Pending rewards" aria-label={`${adminCounts.rewards} pending rewards`}>{adminCounts.rewards}</b>}
                {adminCounts.crs > 0 && <b className="pm-admin-badge" title="Open change requests" aria-label={`${adminCounts.crs} open change requests`}>{adminCounts.crs}</b>}
                {adminCounts.certificates > 0 && <b className="pm-admin-badge" title="Certificates awaiting review" aria-label={`${adminCounts.certificates} certificates awaiting review`}>{adminCounts.certificates}</b>}
              </div>
            )}
          </Row>
        )}
      </div>

      <div className="pm-m-group-label">Help</div>
      <div className="pm-m-card">
        <button type="button" className="pm-m-row" onClick={onShowHelp}>
          <i className="fas fa-keyboard pm-m-row-icon" aria-hidden="true" />
          <div className="pm-m-row-main">Keyboard shortcuts</div>
        </button>
      </div>

      <div className="pm-m-card pm-m-card--spaced">
        <Row {...row} href="/" icon="fa-house" label="Main site" />
      </div>
      <div className="pm-m-signout-gap" aria-hidden="true" />
      <div className="pm-m-card">
        <button type="button" className="pm-m-row pm-m-row--danger" onClick={onLogout}>
          <i className="fas fa-arrow-right-from-bracket pm-m-row-icon" aria-hidden="true" />
          <div className="pm-m-row-main">Sign out</div>
        </button>
      </div>
    </div>
  );
}
