import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Read/merge/write access to one of a CourseSection's JSON config columns
 * (`videoConfig`, `slideConfig`, …), shared by the authoring workbenches.
 *
 * The column is one JSON blob with no server-side merge: a PATCH replaces it
 * whole. So every write has to be built by spreading the previous value, and the
 * only question that matters is *which* previous value.
 *
 * Reading it off the `section` prop — which is what both workbenches used to do
 * — is wrong whenever two writes overlap. The prop only refreshes after a PATCH
 * response has travelled back up through the editor page's `setModules`, so a
 * second write started before that lands is built on the pre-first copy and
 * silently drops whatever the first one added. Both surfaces have writers that
 * fire without the author doing anything — the video player reports `durationSec`
 * from a 250 ms tick, the audio element reports `audioDurationSec` on
 * `loadedmetadata` — so the overlap is not hypothetical, and what it drops is a
 * link: a `youtubeId`, an `audioUrl`.
 *
 * This hook fixes both halves: writes are serialized through a promise chain,
 * and each one merges onto the last value the *server* confirmed rather than
 * onto whatever the last render happened to see.
 *
 * @param {object}   section         the section row
 * @param {string}   columnName      'videoConfig' | 'slideConfig' | …
 * @param {Function} onUpdateSection (sectionId, patch) => Promise<section>
 * @returns {{ config: object, patchConfig: (patch: object) => Promise<object> }}
 */
export default function useSectionConfigWriter(section, columnName, onUpdateSection) {
  const sectionId = section?.id;
  const fromProp = section?.[columnName] ?? null;

  // The last server-confirmed value, which outranks the prop until the prop
  // catches up to it. Null means "nothing written yet this mount".
  const [confirmed, setConfirmed] = useState(null);
  useEffect(() => { setConfirmed(null); }, [sectionId]);

  const config = confirmed ?? fromProp ?? {};

  // The merge base, read at write time rather than at queue time so a queued
  // write sees what the write ahead of it committed.
  const baseRef = useRef(config);
  baseRef.current = config;

  const queueRef = useRef(Promise.resolve());

  const patchConfig = useCallback((patch) => {
    const run = queueRef.current.then(async () => {
      const next = { ...(baseRef.current ?? {}), ...patch };
      const saved = await onUpdateSection?.(sectionId, { [columnName]: next });
      const value = saved?.[columnName] ?? next;
      // Committed before React re-renders, so a write already queued behind this
      // one merges onto it rather than onto the stale render-time value.
      baseRef.current = value;
      setConfirmed(value);
      return value;
    });
    // The chain must survive a rejection or every later write is dead, but the
    // caller still has to see it — the workbenches toast on failure.
    queueRef.current = run.catch(() => {});
    return run;
  }, [sectionId, columnName, onUpdateSection]);

  return { config, patchConfig };
}
