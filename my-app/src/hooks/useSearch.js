import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export const FUSE_OPTIONS = {
  keys: [
    { name: 'title',   weight: 0.5 },
    { name: 'tags',    weight: 0.3 },
    { name: 'excerpt', weight: 0.15 },
    { name: 'section', weight: 0.05 },
  ],
  threshold: 0.35,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
};

/**
 * Lazily initializes a Fuse.js instance when the index data is provided.
 * Dynamically imports fuse.js so it is not in the main bundle.
 *
 * @param {Array}  index   - the search-index.json array (pass [] until loaded)
 * @param {Object} options - Fuse.js options (use FUSE_OPTIONS from this file)
 * @returns {{ fuse: import('fuse.js').default | null, ready: boolean }}
 */
export function useFuse(index, options) {
  const [fuse, setFuse] = useState(null);
  const [ready, setReady] = useState(false);
  const optionsRef = useRef(options);

  useEffect(() => {
    if (!index || index.length === 0) return;
    let cancelled = false;
    import('fuse.js').then(({ default: Fuse }) => {
      if (!cancelled) {
        setFuse(new Fuse(index, optionsRef.current));
        setReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [index]);

  return { fuse, ready };
}

/**
 * Reads the ?q= query param from the URL and provides a debounced version.
 * Must be used inside a component rendered within <BrowserRouter>.
 *
 * @returns {{ query: string, setQuery: Function, debouncedQuery: string, setSearchParams: Function }}
 */
export function useSearchQuery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  return { query, setQuery, debouncedQuery, setSearchParams };
}
