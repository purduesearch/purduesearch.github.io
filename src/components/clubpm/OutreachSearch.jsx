import React, { useState, useEffect, useRef, useCallback } from 'react';
import Fuse from 'fuse.js';

// ── Fuse.js configs per entity type ──────────────────────────

const SUBMISSION_FUSE_OPTS = {
  keys: ['title', 'content', 'type', 'status', 'author.displayName'],
  threshold: 0.35,
  includeScore: true,
};

const CAMPAIGN_FUSE_OPTS = {
  keys: ['name', 'description', 'goalType', 'owner.displayName'],
  threshold: 0.35,
  includeScore: true,
};

const CONTACT_FUSE_OPTS = {
  keys: ['name', 'organization', 'email', 'contactType', 'stage', 'tags'],
  threshold: 0.35,
  includeScore: true,
};

const TYPE_LABELS = {
  SOCIAL_POST: 'Social Post', NEWSLETTER: 'Newsletter', PHOTO: 'Photo',
  VIDEO: 'Video', ANNOUNCEMENT: 'Announcement', EVENT_PROMO: 'Event Promo',
};

const STATUS_COLORS = {
  DRAFT: 'var(--pm-text-secondary)', SUBMITTED: 'var(--pm-accent-amber)',
  IN_REVIEW: '#a29bfe', APPROVED: 'var(--pm-accent-teal)', PUBLISHED: '#00b894',
};

// ── Result section ────────────────────────────────────────────

function ResultSection({ title, icon, items, onSelect, renderItem }) {
  if (items.length === 0) return null;
  return (
    <div className="pm-search-section">
      <div className="pm-search-section-header">
        <i className={icon} aria-hidden="true" />
        {title}
        <span className="pm-search-section-count">{items.length}</span>
      </div>
      {items.slice(0, 5).map((item, i) => (
        <button key={i} className="pm-search-result-row" onClick={() => onSelect(item)}>
          {renderItem(item)}
        </button>
      ))}
    </div>
  );
}

// ── OutreachSearch ────────────────────────────────────────────

export default function OutreachSearch({ submissions, campaigns, contacts, onNavigate }) {
  const [query, setQuery]     = useState('');
  const [open, setOpen]       = useState(false);
  const [results, setResults] = useState({ submissions: [], campaigns: [], contacts: [] });
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Build Fuse instances when data changes
  const subFuse  = useRef(null);
  const campFuse = useRef(null);
  const contFuse = useRef(null);

  useEffect(() => { subFuse.current  = new Fuse(submissions ?? [], SUBMISSION_FUSE_OPTS); }, [submissions]);
  useEffect(() => { campFuse.current = new Fuse(campaigns  ?? [], CAMPAIGN_FUSE_OPTS);   }, [campaigns]);
  useEffect(() => { contFuse.current = new Fuse(contacts   ?? [], CONTACT_FUSE_OPTS);    }, [contacts]);

  const runSearch = useCallback((q) => {
    if (!q.trim()) { setResults({ submissions: [], campaigns: [], contacts: [] }); return; }
    setResults({
      submissions: (subFuse.current?.search(q)  ?? []).map(r => r.item),
      campaigns:   (campFuse.current?.search(q) ?? []).map(r => r.item),
      contacts:    (contFuse.current?.search(q) ?? []).map(r => r.item),
    });
  }, []);

  useEffect(() => { runSearch(query); }, [query, runSearch]);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Global `/` shortcut focuses this input
  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && !['input','textarea','select'].includes(document.activeElement?.tagName?.toLowerCase())) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hasResults = results.submissions.length + results.campaigns.length + results.contacts.length > 0;

  function handleSelect(kind, item) {
    setOpen(false);
    setQuery('');
    onNavigate?.(kind, item);
  }

  return (
    <div className="pm-search-root" ref={containerRef}>
      <div className="pm-search-bar-wrap">
        <i className="fas fa-search pm-search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          className="pm-search-input"
          type="text"
          placeholder="Search posts, campaigns, contacts… ( / )"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          aria-label="Search outreach"
        />
        {query && (
          <button className="pm-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="pm-search-dropdown">
          {!hasResults && (
            <div className="pm-search-empty">No results for "{query}"</div>
          )}

          <ResultSection
            title="Posts"
            icon="fas fa-file-alt"
            items={results.submissions}
            onSelect={item => handleSelect('board', item)}
            renderItem={item => (
              <>
                <span className="pm-search-result-main">{item.title}</span>
                <span className="pm-search-result-meta" style={{ color: STATUS_COLORS[item.status] }}>
                  {item.status}
                </span>
                <span className="pm-search-result-meta">{TYPE_LABELS[item.type] ?? item.type}</span>
              </>
            )}
          />

          <ResultSection
            title="Campaigns"
            icon="fas fa-flag"
            items={results.campaigns}
            onSelect={item => handleSelect('campaigns', item)}
            renderItem={item => (
              <>
                <span
                  className="pm-search-result-dot"
                  style={{ background: item.color ?? 'var(--pm-accent-teal)' }}
                />
                <span className="pm-search-result-main">{item.name}</span>
                {item.goalType && (
                  <span className="pm-search-result-meta">{item.goalType}</span>
                )}
              </>
            )}
          />

          <ResultSection
            title="Contacts"
            icon="fas fa-address-book"
            items={results.contacts}
            onSelect={item => handleSelect('crm', item)}
            renderItem={item => (
              <>
                <span className="pm-search-result-main">{item.name}</span>
                {item.organization && (
                  <span className="pm-search-result-meta">{item.organization}</span>
                )}
                <span className="pm-search-result-meta" style={{ color: '#a29bfe' }}>
                  {item.contactType}
                </span>
              </>
            )}
          />
        </div>
      )}
    </div>
  );
}
