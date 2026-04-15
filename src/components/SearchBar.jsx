import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFuse, FUSE_OPTIONS } from '../hooks/useSearch';

const MAX_RESULTS = 5;
const SUGGESTIONS = ['SA²TP', 'Research', 'ASTRO-USA', 'Outreach', 'SUITS'];

const SearchBar = () => {
  const [isOpen, setIsOpen]           = useState(false);
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [indexData, setIndexData]     = useState(null);

  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const { fuse } = useFuse(indexData || [], FUSE_OPTIONS);

  // ── Load search index lazily on first focus ──────────────────
  const loadIndex = useCallback(() => {
    if (indexData) return;
    fetch('/search-index.json')
      .then(r => r.json())
      .then(data => setIndexData(data))
      .catch(() => {});
  }, [indexData]);

  // ── Run search when query or fuse instance changes ───────────
  useEffect(() => {
    if (!fuse || !query.trim()) {
      setResults([]);
      setActiveIndex(-1);
      return;
    }
    const hits = fuse.search(query).slice(0, MAX_RESULTS);
    setResults(hits);
    setActiveIndex(-1);
  }, [fuse, query]);

  // ── Click-outside collapses the bar ─────────────────────────
  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // ── Focus the input when the bar opens ──────────────────────
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const open = () => {
    loadIndex();
    setIsOpen(true);
  };

  const navigateTo = (path) => {
    setIsOpen(false);
    setQuery('');
    navigate(path);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        navigateTo(results[activeIndex].item.path);
      } else if (query.trim()) {
        navigateTo(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const showDropdown = isOpen && query.trim().length >= 2;

  return (
    <div role="search" aria-label="Site search" className="search-bar-wrap" ref={wrapRef}>

      {/* Icon button — opens the bar */}
      {!isOpen && (
        <button
          className="search-icon-btn"
          aria-label="Open search"
          aria-expanded={false}
          onClick={open}
          onFocus={loadIndex}
        >
          <i className="fas fa-search" aria-hidden="true" />
        </button>
      )}

      {/* Expanded input */}
      <div className={`search-input-wrap${isOpen ? ' open' : ''}`}>
        <i
          className="fas fa-search"
          aria-hidden="true"
          style={{ color: 'var(--color-muted)', marginRight: '0.4rem', fontSize: '0.85rem' }}
        />
        <input
          ref={inputRef}
          type="search"
          className="search-input-field"
          placeholder="Search SEARCH…"
          aria-label="Search"
          aria-autocomplete="list"
          aria-controls={showDropdown ? 'search-dropdown' : undefined}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={loadIndex}
        />
        {query && (
          <button
            className="search-clear-btn"
            aria-label="Clear search"
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        )}
        <button
          className="search-clear-btn"
          aria-label="Close search"
          onClick={() => { setIsOpen(false); setQuery(''); }}
          style={{ marginLeft: '0.25rem', opacity: 0.5 }}
        >
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>

      {/* Dropdown results */}
      {showDropdown && (
        <div id="search-dropdown" role="listbox" className="search-dropdown">
          {results.length > 0 ? (
            <>
              {results.map((r, i) => (
                <Link
                  key={r.item.path}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`search-result-item${i === activeIndex ? ' active' : ''}`}
                  to={r.item.path}
                  onClick={() => { setIsOpen(false); setQuery(''); }}
                >
                  <div className="sri-title">{r.item.title}</div>
                  <div className="sri-meta">{r.item.section}</div>
                </Link>
              ))}
              <Link
                className="search-see-all"
                to={`/search?q=${encodeURIComponent(query.trim())}`}
                onClick={() => setIsOpen(false)}
              >
                See all results →
              </Link>
            </>
          ) : (
            <div className="search-no-results">
              No results for <strong>"{query}"</strong>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                Try:{' '}
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    style={{ background: 'none', border: 'none', padding: '0 0.2rem', cursor: 'pointer', color: 'var(--color-accent)', fontSize: '0.75rem' }}
                    onClick={() => setQuery(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
