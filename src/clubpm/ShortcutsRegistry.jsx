import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ShortcutsContext = createContext(null);

export function ShortcutsProvider({ children }) {
  const mapRef = useRef(new Map());
  const chordBuffer = useRef(null);
  const chordTimer = useRef(null);
  const [showHelp, setShowHelp] = useState(false);

  // Stable callbacks — never cause re-renders
  const register = useCallback((shortcut) => {
    mapRef.current.set(shortcut.id, shortcut);
  }, []);

  const unregister = useCallback((id) => {
    mapRef.current.delete(id);
  }, []);

  // Modal reads a fresh snapshot when it opens
  const getShortcuts = useCallback(() => [...mapRef.current.values()], []);

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isEditable = document.activeElement?.isContentEditable;
      const inInput = ['input', 'textarea', 'select'].includes(tag) || isEditable;

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Escape is the ONLY key that still dispatches while the caret is in a
      // field — it closes things, which is what a typist reaching for it wants.
      // '?' used to be exempt too, so typing any question mark inside a course
      // summary, a task comment, or any other textarea popped the shortcuts
      // help over the top of the work. A literal character can never be a
      // global shortcut while the user is composing text.
      if (inInput && e.key !== 'Escape') return;

      // Second key of a chord
      if (chordBuffer.current !== null) {
        const first = chordBuffer.current;
        chordBuffer.current = null;
        clearTimeout(chordTimer.current);
        for (const s of mapRef.current.values()) {
          if (Array.isArray(s.keys) && s.keys.length === 2 &&
              s.keys[0] === first && s.keys[1] === e.key) {
            e.preventDefault();
            s.action();
            return;
          }
        }
        // No chord matched — fall through to single-key check
      }

      // Does this key start a chord?
      const startsChord = [...mapRef.current.values()].some(
        s => Array.isArray(s.keys) && s.keys.length === 2 && s.keys[0] === e.key
      );
      if (startsChord) {
        chordBuffer.current = e.key;
        chordTimer.current = setTimeout(() => { chordBuffer.current = null; }, 600);
        return;
      }

      // Single-key match
      for (const s of mapRef.current.values()) {
        if (typeof s.keys === 'string' && s.keys === e.key) {
          e.preventDefault();
          s.action();
          return;
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Context value only changes when showHelp changes — no re-render cascade on register/unregister
  const value = useMemo(
    () => ({ register, unregister, getShortcuts, showHelp, setShowHelp }),
    [register, unregister, getShortcuts, showHelp, setShowHelp]
  );

  return (
    <ShortcutsContext.Provider value={value}>
      {children}
    </ShortcutsContext.Provider>
  );
}

export function useShortcutsRegistry() {
  return useContext(ShortcutsContext);
}
