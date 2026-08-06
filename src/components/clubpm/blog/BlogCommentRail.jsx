import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import BlogThreadCard from './BlogThreadCard';
import { layoutCards } from './railLayout';

/**
 * The right-hand comment gutter. Each open thread's card sits level with the
 * text it annotates; `layoutCards` resolves the overlaps.
 *
 * Card tops come from `editor.view.coordsAtPos()` on the range reported by
 * ThreadDecorations' `onPositions`, never from querying decoration spans in the
 * DOM — a decoration may be split across several spans, and the rail only cares
 * about where the range starts.
 *
 * Threads absent from `positions` are orphaned: their anchor text is gone from
 * the document, so they get no coordinate at all. They are collected in a
 * collapsed group instead of silently disappearing.
 *
 * Below 1100px the CSS hides this entirely and BlogAnnotationsPanel's overlay
 * remains the narrow-screen path.
 */
export default function BlogCommentRail({
  threads = [], positions, editor, focusedThreadId, onFocus,
  currentMember, canEdit = false, onChanged, docType, docId,
}) {
  const railRef = useRef(null);
  const cardRefs = useRef(new Map());
  const frameRef = useRef(0);
  const [tops, setTops] = useState(() => new Map());
  // Bumped by anything that can move text on screen; the measure effect keys off it.
  const [tick, setTick] = useState(0);

  // Comments only. Suggestions are still anchored by marks and have no relative
  // position, so they would land in every partition below as false orphans —
  // they stay in the review panel, which is built to accept/reject them.
  const open = threads.filter((t) => t.status === 'OPEN' && t.kind !== 'SUGGESTION');
  const anchored = open.filter((t) => positions?.has?.(t.id));
  // A thread is orphaned only if it HAS an anchor that no longer resolves. One
  // that never got an anchor is simply awaiting the lazy commentMark migration
  // (BlogEditor runs it on first open by an editor) — its text is still in the
  // document, so calling it deleted would be a lie.
  const orphans = open.filter((t) => t.anchorStart && !positions?.has?.(t.id));

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail || !editor || editor.isDestroyed) return;
    // Both rects are viewport-relative, so the difference is already relative to
    // the rail (the cards' positioning context) at any scroll offset.
    const railTop = rail.getBoundingClientRect().top;
    const cards = [];
    for (const thread of anchored) {
      const range = positions.get(thread.id);
      let coords;
      try { coords = editor.view.coordsAtPos(range.from); } catch { continue; }
      const el = cardRefs.current.get(thread.id);
      cards.push({
        id: thread.id,
        idealTop: Math.round(coords.top - railTop),
        height: el?.offsetHeight ?? 0,
      });
    }
    setTops(layoutCards(cards, focusedThreadId));
    // `anchored`/`positions` are derived fresh each render; the effect below
    // re-arms whenever they can have changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, positions, focusedThreadId, threads]);

  // Measure after paint so the cards have their real heights, and in a frame so
  // ProseMirror has finished laying the document out.
  useLayoutEffect(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frameRef.current);
  }, [measure, tick]);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('resize', bump);
    editor?.on?.('update', bump);
    return () => {
      window.removeEventListener('resize', bump);
      editor?.off?.('update', bump);
    };
  }, [editor]);

  const setCardRef = (id) => (el) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  };

  if (!open.length) return <aside className="cpm-blog-rail" ref={railRef} aria-label="Comments" />;

  return (
    <aside className="cpm-blog-rail" ref={railRef} aria-label="Comments">
      {anchored.map((thread) => (
        <div
          key={thread.id}
          ref={setCardRef(thread.id)}
          className={`cpm-blog-rail-card${focusedThreadId === thread.id ? ' is-focused' : ''}`}
          // Hidden until the first measurement resolves a top, otherwise every
          // card paints stacked at zero and then visibly jumps into place.
          style={{
            transform: `translateY(${tops.get(thread.id) ?? 0}px)`,
            opacity: tops.has(thread.id) ? 1 : 0,
          }}
          onClick={() => onFocus?.(thread.id)}
        >
          <BlogThreadCard
            thread={thread}
            editor={editor}
            canEdit={canEdit}
            currentMember={currentMember}
            onChanged={onChanged}
            isFocused={focusedThreadId === thread.id}
            docType={docType}
            docId={docId}
          />
        </div>
      ))}

      {orphans.length > 0 && (
        <details className="cpm-blog-rail-orphans">
          <summary>
            <i className="fas fa-unlink" aria-hidden="true" />{' '}
            No longer in the document ({orphans.length})
          </summary>
          {orphans.map((thread) => (
            <div key={thread.id} className="cpm-blog-rail-orphan">
              <span className="cpm-blog-rail-orphan-quote">“{thread.anchorText}”</span>
              <BlogThreadCard
                thread={thread}
                editor={editor}
                canEdit={canEdit}
                currentMember={currentMember}
                onChanged={onChanged}
                isFocused={focusedThreadId === thread.id}
                docType={docType}
                docId={docId}
              />
            </div>
          ))}
        </details>
      )}
    </aside>
  );
}
