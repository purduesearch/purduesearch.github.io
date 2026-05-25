import React, { useState, useEffect, useCallback } from 'react';
import { get } from '../../api/clubPmClient';

// ── Helpers ───────────────────────────────────────────────────

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_COLORS = {
  DRAFT:      'var(--pm-text-secondary)',
  SUBMITTED:  'var(--pm-accent-amber)',
  IN_REVIEW:  '#a29bfe',
  APPROVED:   'var(--pm-accent-teal)',
  PUBLISHED:  '#00b894',
};

const TYPE_ICONS = {
  SPONSOR:  'fas fa-handshake',
  PRESS:    'fas fa-newspaper',
  PARTNER:  'fas fa-link',
  PROSPECT: 'fas fa-user-plus',
  ALUMNI:   'fas fa-graduation-cap',
};

// ── Feed item renderers ───────────────────────────────────────

function SubmissionItem({ data }) {
  return (
    <div className="pm-activity-item">
      <div className="pm-activity-avatar" title={data.author?.displayName}>
        {data.author?.avatarUrl
          ? <img src={data.author.avatarUrl} alt={data.author.displayName} className="pm-activity-avatar-img" />
          : <i className="fas fa-user" aria-hidden="true" />}
      </div>
      <div className="pm-activity-body">
        <div className="pm-activity-text">
          <span className="pm-activity-name">{data.author?.displayName ?? 'Someone'}</span>
          {' '}updated{' '}
          <span className="pm-activity-subject">"{data.title}"</span>
          {' '}→{' '}
          <span className="pm-activity-status" style={{ color: STATUS_COLORS[data.status] }}>
            {data.status}
          </span>
        </div>
        <div className="pm-activity-time">{timeAgo(data.updatedAt)}</div>
      </div>
    </div>
  );
}

function CommentItem({ data }) {
  return (
    <div className="pm-activity-item">
      <div className="pm-activity-avatar" title={data.author?.displayName}>
        {data.author?.avatarUrl
          ? <img src={data.author.avatarUrl} alt={data.author.displayName} className="pm-activity-avatar-img" />
          : <i className="fas fa-user" aria-hidden="true" />}
      </div>
      <div className="pm-activity-body">
        <div className="pm-activity-text">
          <span className="pm-activity-name">{data.author?.displayName ?? 'Someone'}</span>
          {' '}commented on{' '}
          <span className="pm-activity-subject">"{data.submission?.title}"</span>
        </div>
        <div className="pm-activity-preview">{data.body?.slice(0, 80)}{data.body?.length > 80 ? '…' : ''}</div>
        <div className="pm-activity-time">{timeAgo(data.createdAt)}</div>
      </div>
    </div>
  );
}

function ContactItem({ data }) {
  return (
    <div className="pm-activity-item">
      <div className="pm-activity-avatar" style={{ background: 'rgba(162,155,254,0.15)', color: '#a29bfe' }}>
        <i className={TYPE_ICONS[data.contactType] ?? 'fas fa-user'} aria-hidden="true" />
      </div>
      <div className="pm-activity-body">
        <div className="pm-activity-text">
          New contact added:{' '}
          <span className="pm-activity-subject">{data.name}</span>
          {data.contactType && <span className="pm-activity-badge">{data.contactType}</span>}
        </div>
        <div className="pm-activity-time">{timeAgo(data.createdAt)}</div>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────

export default function ActivityFeedSidebar({ isOpen, onClose }) {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get('/api/outreach/activity');
      setFeed(Array.isArray(data) ? data : []);
    } catch {
      // silent — sidebar is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadFeed();
  }, [isOpen, loadFeed]);

  if (!isOpen) return null;

  return (
    <>
      <div className="pm-activity-backdrop" onClick={onClose} />
      <aside className="pm-activity-sidebar">
        <div className="pm-activity-header">
          <span className="pm-activity-title">
            <i className="fas fa-stream" aria-hidden="true" />
            Recent Activity
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pm-activity-icon-btn" onClick={loadFeed} title="Refresh" aria-label="Refresh feed">
              <i className={`fas fa-sync-alt${loading ? ' fa-spin' : ''}`} aria-hidden="true" />
            </button>
            <button className="pm-activity-icon-btn" onClick={onClose} title="Close" aria-label="Close feed">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="pm-activity-feed">
          {loading && feed.length === 0 && (
            <div className="pm-activity-loading">
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--pm-accent-teal)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '32px auto' }} />
            </div>
          )}
          {!loading && feed.length === 0 && (
            <div className="pm-activity-empty">No activity in the last 14 days.</div>
          )}
          {feed.map((item, i) => (
            <React.Fragment key={i}>
              {item.kind === 'submission' && <SubmissionItem data={item.data} />}
              {item.kind === 'comment'    && <CommentItem    data={item.data} />}
              {item.kind === 'contact'    && <ContactItem    data={item.data} />}
            </React.Fragment>
          ))}
        </div>
      </aside>
    </>
  );
}
