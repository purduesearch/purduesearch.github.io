import React, { useState, useEffect, useCallback } from 'react';
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

  const load = useCallback(() => {
    if (!docId) return;
    setLoading(true);
    listBlogThreads(docType, docId)
      .then(setThreads)
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, [docType, docId]);

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
      {!loading && shown.length === 0 && (
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
