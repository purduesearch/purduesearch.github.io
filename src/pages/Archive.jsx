import React, { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const PROGRAMS = [
  { value: '',          label: 'All Programs' },
  { value: 'astrousa',  label: 'AstroUSA' },
  { value: 'sa2tp',     label: 'SA²TP' },
  { value: 'research',  label: 'Research' },
  { value: 'software',  label: 'Software' },
  { value: 'business',  label: 'Business' },
];

const TYPE_LABELS = {
  SOCIAL_POST:  'Social',
  NEWSLETTER:   'Newsletter',
  PHOTO:        'Photo',
  VIDEO:        'Video',
  ANNOUNCEMENT: 'Announcement',
  EVENT_PROMO:  'Event',
};

const PLATFORM_ICONS = {
  instagram: 'fab fa-instagram',
  linkedin:  'fab fa-linkedin',
  twitter:   'fab fa-twitter',
  website:   'fas fa-globe',
  newsletter:'fas fa-envelope',
};

export default function Archive() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [program, setProgram]         = useState('');
  const [query, setQuery]             = useState('');

  useEffect(() => {
    setLoading(true);
    const url = new URL(`${BASE_URL || window.location.origin}/api/public/outreach/published`);
    if (program) url.searchParams.set('program', program);
    url.searchParams.set('limit', '50');
    fetch(url.toString())
      .then(r => r.ok ? r.json() : [])
      .then(data => setSubmissions(Array.isArray(data) ? data : []))
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false));
  }, [program]);

  const fuse = useMemo(() => new Fuse(submissions, {
    keys: ['title', 'content', 'type', 'project.name'],
    threshold: 0.35,
  }), [submissions]);

  const filtered = query.trim()
    ? fuse.search(query).map(r => r.item)
    : submissions;

  return (
    <div className="pm-archive-root">
      <header className="pm-archive-hero">
        <div className="pm-archive-hero-inner">
          <div className="pm-pubc-brand">
            <i className="fas fa-broadcast-tower" aria-hidden="true" />
            Purdue SEARCH
          </div>
          <h1 className="pm-archive-title">Outreach Archive</h1>
          <p className="pm-archive-sub">Published updates from our project teams.</p>
        </div>
      </header>

      <div className="pm-archive-content">
        <div className="pm-archive-toolbar">
          <input
            type="text"
            className="pm-pubc-input"
            placeholder="Search updates…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <select
            className="pm-pubc-input"
            value={program}
            onChange={e => setProgram(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            {PROGRAMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="pm-archive-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="pm-archive-empty">
            <i className="fas fa-search" aria-hidden="true" />
            <p>No updates {query.trim() ? `matching "${query}"` : 'yet'}.</p>
          </div>
        ) : (
          <div className="pm-archive-grid">
            {filtered.map(s => (
              <article key={s.id} className="pm-archive-card">
                {s.mediaUrls?.[0] && (
                  <img src={s.mediaUrls[0]} alt="" className="pm-archive-image" />
                )}
                <div className="pm-archive-body">
                  <div className="pm-archive-card-meta">
                    {s.project?.name && <span className="pm-archive-project">{s.project.name}</span>}
                    <span className="pm-archive-type">{TYPE_LABELS[s.type] ?? s.type}</span>
                  </div>
                  <h3 className="pm-archive-card-title">{s.title}</h3>
                  {s.content && <p className="pm-archive-card-content">{s.content}</p>}
                  <div className="pm-archive-card-footer">
                    <span className="pm-archive-platforms">
                      {(s.platform ?? []).map(p => (
                        <i key={p} className={PLATFORM_ICONS[p] ?? 'fas fa-globe'} aria-hidden="true" />
                      ))}
                    </span>
                    {s.publishedAt && (
                      <span className="pm-archive-date">
                        {new Date(s.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
