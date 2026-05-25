import React, { useState, useEffect } from 'react';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const PLATFORM_ICONS = {
  instagram: 'fab fa-instagram',
  linkedin:  'fab fa-linkedin',
  twitter:   'fab fa-twitter',
  website:   'fas fa-globe',
  newsletter:'fas fa-envelope',
};

/**
 * OutreachWidget — drop-in card row showing recent published outreach for a program.
 *
 * Props:
 *   program   — programTag value ("astrousa", "sa2tp", "research", "software", "business")
 *   limit     — max cards (default 3)
 *   title     — header text (default "Recent Updates")
 */
export default function OutreachWidget({ program, limit = 3, title = 'Recent Updates' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = new URL(`${BASE_URL || window.location.origin}/api/public/outreach/published`);
    if (program) url.searchParams.set('program', program);
    url.searchParams.set('limit', String(limit));
    fetch(url.toString())
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setItems(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [program, limit]);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <section className="pm-widget-root">
      <div className="pm-widget-header">
        <h3 className="pm-widget-title">{title}</h3>
        <a href="/r/archive" className="pm-widget-more">See all <i className="fas fa-arrow-right" aria-hidden="true" /></a>
      </div>
      <div className="pm-widget-scroll">
        {items.map(s => (
          <article key={s.id} className="pm-widget-card">
            {s.mediaUrls?.[0] && (
              <img src={s.mediaUrls[0]} alt="" className="pm-widget-image" />
            )}
            <div className="pm-widget-body">
              <h4 className="pm-widget-card-title">{s.title}</h4>
              {s.content && <p className="pm-widget-content">{s.content.slice(0, 110)}{s.content.length > 110 ? '…' : ''}</p>}
              <div className="pm-widget-meta">
                {(s.platform ?? []).map(p => (
                  <i key={p} className={PLATFORM_ICONS[p] ?? 'fas fa-globe'} aria-hidden="true" />
                ))}
                {s.publishedAt && (
                  <span className="pm-widget-date">{new Date(s.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
