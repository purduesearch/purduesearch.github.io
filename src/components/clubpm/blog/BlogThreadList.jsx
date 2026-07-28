import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import BlogThreadCard from './BlogThreadCard';
import { listBlogThreads } from '../../../api/clubPmClient';

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'suggestions', label: 'Suggestions' },
  { id: 'resolved', label: 'Closed' },
  { id: 'all', label: 'All' },
];

function matches(thread, filter) {
  switch (filter) {
    case 'open':        return thread.status === 'OPEN';
    case 'suggestions': return thread.kind === 'SUGGESTION' && thread.status === 'OPEN';
    case 'resolved':    return thread.status !== 'OPEN';
    default:            return true;
  }
}

export default function BlogThreadList({ docType, docId, editor, canEdit, currentMember, refreshKey }) {
  const [threads, setThreads] = useState([]);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // Only the first fetch shows the loading placeholder — a refresh after a reply
  // or a status change must not blank the whole list out from under the reader.
  const loadedOnce = useRef(false);

  const load = useCallback(() => {
    if (!docId) return;
    if (!loadedOnce.current) setLoading(true);
    listBlogThreads(docType, docId)
      .then((rows) => { setThreads(rows ?? []); setLoadError(null); })
      .catch((err) => {
        const message = err?.message || 'Could not load review threads';
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => { loadedOnce.current = true; setLoading(false); });
  }, [docType, docId]);

  // Switching documents is a genuine first load again.
  useEffect(() => { loadedOnce.current = false; }, [docType, docId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const shown = threads.filter((t) => matches(t, filter));

  return (
    <div className="cpm-blog-threads">
      <div className="cpm-blog-threads-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? 'is-active' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="cpm-blog-thread-empty">Loading review threads…</p>}
      {!loading && loadError && (
        <p className="cpm-blog-thread-empty">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {loadError}{' '}
          <button type="button" onClick={load}>Retry</button>
        </p>
      )}
      {!loading && !loadError && shown.length === 0 && (
        <p className="cpm-blog-thread-empty">
          Nothing here. Select text in the post to leave a comment or suggest an edit.
        </p>
      )}
      {shown.map((t) => (
        <BlogThreadCard
          key={t.id}
          thread={t}
          editor={editor}
          canEdit={canEdit}
          currentMember={currentMember}
          onChanged={load}
        />
      ))}
    </div>
  );
}
