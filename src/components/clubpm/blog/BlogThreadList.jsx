import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import BlogThreadCard from './BlogThreadCard';
import { listBlogThreads } from '../../../api/clubPmClient';

export default function BlogThreadList({
  docType, docId, editor, canEdit, currentMember, refreshKey, focusedThreadId,
}) {
  const [threads, setThreads] = useState([]);
  // Closed threads are hidden by default so the panel shows what still needs a
  // decision; the count in each header always includes them, so nothing looks lost.
  const [showClosed, setShowClosed] = useState(false);
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

  const card = (t) => (
    <BlogThreadCard
      key={t.id}
      thread={t}
      editor={editor}
      canEdit={canEdit}
      currentMember={currentMember}
      onChanged={load}
      isFocused={t.id === focusedThreadId}
      docType={docType}
      docId={docId}
    />
  );

  const section = (kind, { icon, title, empty }) => {
    const all  = threads.filter((t) => t.kind === kind);
    const open = all.filter((t) => t.status === 'OPEN');
    // A focused thread is always shown, even when it is closed and closed
    // threads are hidden — otherwise clicking its text reveals nothing.
    const shown = showClosed
      ? all
      : all.filter((t) => t.status === 'OPEN' || t.id === focusedThreadId);
    return (
      <section className="cpm-blog-thread-section">
        <h4 className="cpm-blog-thread-section-title">
          <i className={`fas ${icon}`} aria-hidden="true" /> {title}{' '}
          {/* Explicit space: JSX strips the newline before <span>, so without
              this the count reads "Comments3" whenever the flex gap doesn't
              apply (stale cached stylesheet, narrow wrap). */}
          <span className="cpm-blog-thread-section-count">
            {open.length} open{all.length > open.length ? ` · ${all.length - open.length} closed` : ''}
          </span>
        </h4>
        {shown.length === 0
          ? <p className="cpm-blog-thread-empty">{empty}</p>
          : shown.map(card)}
      </section>
    );
  };

  if (loading) return <p className="cpm-blog-thread-empty">Loading review threads…</p>;

  if (loadError) {
    return (
      <p className="cpm-blog-thread-empty">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {loadError}{' '}
        <button type="button" onClick={load}>Retry</button>
      </p>
    );
  }

  return (
    <div className="cpm-blog-threads">
      {section('COMMENT', {
        icon: 'fa-comment',
        title: 'Comments',
        empty: 'No comments. Select text in the post to leave one.',
      })}
      {section('SUGGESTION', {
        icon: 'fa-pen-to-square',
        title: 'Suggestions',
        empty: 'No suggestions. Select text to propose an edit, or ask the AI assistant.',
      })}

      {threads.some((t) => t.status !== 'OPEN') && (
        <button
          type="button"
          className="cpm-blog-thread-show-closed"
          onClick={() => setShowClosed((v) => !v)}
        >
          {showClosed ? 'Hide closed' : 'Show closed'}
        </button>
      )}
    </div>
  );
}
