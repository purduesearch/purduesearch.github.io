import { useEffect, useRef } from 'react';
import { useShortcutsRegistry } from '../clubpm/ShortcutsRegistry';

/**
 * Register keyboard shortcuts while the calling component is mounted.
 * Pass stable actions (setState calls) — or actions that close over refs — to avoid stale closures.
 */
export default function useKeyboardShortcuts(shortcuts) {
  const registry = useShortcutsRegistry();
  const actionRefs = useRef({});

  // Keep action refs current on every render so closures inside actions are always fresh
  shortcuts.forEach(s => {
    actionRefs.current[s.id] = s.action;
  });

  // Stable refs to register/unregister so the effect dep is truly [] (mount/unmount only)
  const registerRef = useRef(registry?.register);
  const unregisterRef = useRef(registry?.unregister);
  registerRef.current = registry?.register;
  unregisterRef.current = registry?.unregister;

  useEffect(() => {
    if (!registerRef.current) return;
    const ids = shortcuts.map(s => s.id);
    shortcuts.forEach(s =>
      registerRef.current({ ...s, action: () => actionRefs.current[s.id]?.() })
    );
    return () => ids.forEach(id => unregisterRef.current?.(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount/unmount only — register/unregister are stable, actions use refs
}
