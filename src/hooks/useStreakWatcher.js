// Trigger a streak re-check after any mutation that could extend it. Components
// call `notify()` returned from `useStreakWatcher()` after a successful PATCH
// of a task status, a time-log POST, milestone update, or blog publish. The
// StreakBadge listens for the same custom event and re-fetches itself.

import { useCallback } from 'react';
import { invalidateStreakCache } from '../api/clubPmClient';

export default function useStreakWatcher() {
  const notify = useCallback(() => {
    invalidateStreakCache();
    try {
      window.dispatchEvent(new CustomEvent('clubpm-streak-changed'));
    } catch {/* SSR-safe */}
  }, []);

  return notify;
}
