import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useFuse, FUSE_OPTIONS, useSearchQuery } from '../hooks/useSearch';
import SEOHead from '../components/SEOHead';

const SECTIONS = ['Main', 'Programs', 'Research', 'Blog'];
const SUGGESTIONS = ['SA²TP', 'Research', 'ASTRO-USA', 'Outreach', 'MDRS', 'SUITS'];

const SearchResults = () => {
  const [indexData, setIndexData] = useState(null);
  const { query, setQuery, debouncedQuery } = useSearchQuery();
  const { fuse, ready } = useFuse(indexData || [], FUSE_OPTIONS);
  const [, setSearchParams2] = useSearchParams();

  // Load the full index on mount (this IS the search page — no lazy load needed)
  useEffect(() => {
    fetch('/search-index.json')
      .then(r => r.json())
      .then(data => setIndexData(data))
      .catch(() => {});
  }, []);

  // Sync ?q= in URL when query changes
  useEffect(() => {
    if (query.trim()) {
      setSearchParams2({ q: query }, { replace: true });
    } else {
      setSearchParams2({}, { replace: true });
    }
  }, [query, setSearchParams2]);

  const allResults = (fuse && debouncedQuery.trim().length >= 1)
    ? fuse.search(debouncedQuery)
    : [];

  // Group results by section
  const grouped = SECTIONS.reduce((acc, section) => {
    const hits = allResults.filter(r => r.item.section === section);
    if (hits.length > 0) acc[section] = hits;
    return acc;
  }, {});

  const hasResults = allResults.length > 0;

  return (
    <>
      <SEOHead
        title="Search"
        description="Search Purdue SEARCH programs, research, and events."
        canonical="/search"
        noindex
      />
      <Navbar />
      <main id="main-content">
        <section className="search-results-page">
          <div className="container">
            <h1>
              <i className="fas fa-search mr-2" aria-hidden="true" style={{ fontSize: '1.5rem', color: 'var(--color-accent)' }} />
              Search
            </h1>
            <p style={{ color: 'var(--color-muted)', marginBottom: 0 }}>
              {ready && debouncedQuery.trim()
                ? `${allResults.length} result${allResults.length !== 1 ? 's' : ''} for "${debouncedQuery}"`
                : 'Search across all SEARCH programs, events, and research.'}
            </p>

            {/* Search input */}
            <div className="search-results-input-wrap">
              <i className="fas fa-search" aria-hidden="true" style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
              <input
                type="search"
                className="search-results-input"
                placeholder="Search SEARCH…"
                aria-label="Search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
              {query && (
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '0.1rem' }}
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                >
                  <i className="fas fa-times" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Results grouped by section */}
            {debouncedQuery.trim().length >= 1 && ready && (
              hasResults ? (
                SECTIONS.map(section => {
                  const hits = grouped[section];
                  if (!hits) return null;
                  return (
                    <div key={section}>
                      <h3 className="search-results-section-heading">{section}</h3>
                      {hits.map(r => (
                        <Link
                          key={r.item.path}
                          className="search-result-card"
                          to={r.item.path}
                        >
                          <div className="src-title">{r.item.title}</div>
                          <div className="src-path">
                            purduesearch.github.io{r.item.path}
                          </div>
                          <div className="src-excerpt">{r.item.excerpt}</div>
                        </Link>
                      ))}
                    </div>
                  );
                })
              ) : (
                <div className="search-no-results-page">
                  <p style={{ fontSize: '1.1rem' }}>
                    No results for <strong>"{debouncedQuery}"</strong>
                  </p>
                  <p style={{ color: 'var(--color-muted)' }}>
                    Try checking your spelling or using a broader term.
                  </p>
                  <div className="search-suggestions mt-4">
                    <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Try searching for:</p>
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        className="search-suggestion-chip"
                        onClick={() => setQuery(s)}
                        style={{ background: 'none', fontFamily: 'inherit' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Empty query state */}
            {(!debouncedQuery.trim() || debouncedQuery.trim().length < 1) && (
              <div style={{ marginTop: '2rem' }}>
                <p style={{ color: 'var(--color-muted)', marginBottom: '1rem' }}>
                  Popular searches:
                </p>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    className="search-suggestion-chip"
                    onClick={() => setQuery(s)}
                    style={{ background: 'none', fontFamily: 'inherit' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default SearchResults;
