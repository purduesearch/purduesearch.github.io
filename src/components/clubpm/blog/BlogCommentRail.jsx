import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import BlogThreadCard from './BlogThreadCard';
import { layoutCards } from './railLayout';
import { collectSuggestionThreads } from './suggestionMarks';

/**
 * The right-hand comment gutter. Each open thread's card sits level with the
 * text it annotates; `layoutCards` resolves the overlaps.
 *
 * Card tops come from `editor.view.coordsAtPos()` on the range reported by
 * ThreadDecorations' `onPositions`, never from querying decoration spans in the
 * DOM — a decoration may be split across several spans, and the rail only cares
 * about where the range starts.
 *
 * Threads absent from `positions` have no coordinate to sit level with — either
 * their anchor text is gone or they never got an anchor. Both land in a
 * collapsed group at the foot of the rail rather than silently disappearing:
 * every open comment on the document is reachable from here.
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

  // Comments resolve through the decoration set (Yjs relative positions);
  // suggestions are anchored by MARKS and resolve through the mark index that
  // suggestionMarks.js keeps. The rail carries both, so it needs both maps.
  const markPositions = editor?.storage?.blogThreadPositions?.positions;
  const rangeFor = (id) => positions?.get?.(id) ?? markPositions?.get?.(id) ?? null;

  const stored = threads.filter((t) => t.status === 'OPEN');
  const storedIds = new Set(stored.map((t) => t.id));

  // Suggestions made by typing in Suggesting mode have marks but no stored
  // thread, so they are synthesised from the document. `local: true` tells the
  // card there is no server row behind it: accept/reject act on the document
  // alone, and there is nothing to reply to.
  const typed = (editor && !editor.isDestroyed)
    ? collectSuggestionThreads(editor.state.doc)
      .filter((s) => !storedIds.has(s.id))
      .map((s) => ({
        id: s.id,
        kind: 'SUGGESTION',
        status: 'OPEN',
        local: true,
        anchorText: s.deleted,
        replaceWith: s.inserted,
        comments: [],
      }))
    : [];

  const open = [...stored, ...typed];
  const anchored = open.filter((t) => rangeFor(t.id));
  // Everything else. A thread with an `anchorStart` that no longer resolves is
  // genuinely orphaned; one that never got an anchor is simply awaiting the
  // lazy commentMark migration (BlogEditor runs it on first open by an editor)
  // and its text is still in the document — so the group is labelled for what
  // is actually true of both, rather than calling either of them deleted.
  const unplaced = open.filter((t) => !rangeFor(t.id));
  // Identity of the placed set: which cards, and where each one starts.
  const anchoredKey = anchored.map((t) => `${t.id}@${rangeFor(t.id)?.from}`).join('|');

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail || !editor || editor.isDestroyed) return;
    // Both rects are viewport-relative, so the difference is already relative to
    // the rail (the cards' positioning context) at any scroll offset.
    const railTop = rail.getBoundingClientRect().top;
    const cards = [];
    for (const thread of anchored) {
      const range = rangeFor(thread.id);
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
    // `anchored` and `rangeFor` are derived fresh every render, so the memo has
    // to be keyed on their CONTENT, not on the inputs they happen to come from.
    // Keying on `threads`/`positions` alone left the closure stale for anything
    // derived from the document instead — typed suggestions appeared in the
    // rail but never got a top, so they sat at opacity 0 forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, focusedThreadId, anchoredKey]);

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
            // The rail already resolved this one — pass it in rather than
            // letting the card re-look-it-up in the mark index, which knows
            // nothing about decoration-anchored comments and would badge every
            // one of them "anchor removed".
            anchor={rangeFor(thread.id)}
            canEdit={canEdit}
            currentMember={currentMember}
            onChanged={onChanged}
            isFocused={focusedThreadId === thread.id}
            docType={docType}
            docId={docId}
          />
        </div>
      ))}

      {unplaced.length > 0 && (
        <details className="cpm-blog-rail-orphans">
          <summary>
            <i className="fas fa-unlink" aria-hidden="true" />{' '}
            Not anchored to text ({unplaced.length})
          </summary>
          {unplaced.map((thread) => (
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
