import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * History integration for the phone shell's sheets and full-screen dialogs.
 *
 * Contract (contracts.md §5):
 * - Opening a sheet pushes a same-URL entry carrying `state.pmOverlay`, so
 *   browser/hardware Back closes the sheet and leaves the page untouched.
 * - Closing by ✕ / scrim / Escape goes back over that entry.
 * - A destination chosen inside a sheet REPLACES the sheet entry, so Back then
 *   returns to the page that was under the sheet, not to the sheet.
 * - The open sheet is derived from location state, never from component state,
 *   so it survives AppShell remounts and reopens on Forward (Q10: reopen).
 *
 * Only the compact shell reads `pmOverlay`; the desktop shell ignores it.
 */
export const OVERLAY_KEY = 'pmOverlay';
export const SHELL_OPEN_EVENT = 'clubpm:shell-open';

export function requestShellOverlay(id) {
  if (id !== 'more' && id !== 'projects' && id !== 'search') return;
  window.dispatchEvent(new CustomEvent(SHELL_OPEN_EVENT, { detail: { id } }));
}

export function useShellOverlay() {
  const location = useLocation();
  const navigate = useNavigate();
  const overlay = location.state?.[OVERLAY_KEY] ?? null;

  const here = { pathname: location.pathname, search: location.search, hash: location.hash };

  const openOverlay = useCallback((id) => {
    if (overlay === id) return;
    const state = { ...(location.state ?? {}), [OVERLAY_KEY]: id };
    // Switching from one sheet to another replaces, so Back never walks
    // through a stack of sheets the user already dismissed.
    navigate(here, { state, replace: Boolean(overlay) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, location.state, location.pathname, location.search, location.hash, navigate]);

  const closeOverlay = useCallback(() => {
    if (!overlay) return;
    if (location.key === 'default') {
      // The sheet entry is the first entry this app has (restored after a
      // reload in a fresh tab): going back would leave the site.
      const { [OVERLAY_KEY]: _dropped, ...rest } = location.state ?? {};
      navigate(here, { state: Object.keys(rest).length ? rest : null, replace: true });
      return;
    }
    navigate(-1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, location.key, location.state, location.pathname, location.search, location.hash, navigate]);

  /** Leave the sheet for a destination; replaces the sheet's history entry. */
  const navigateFromOverlay = useCallback((to) => {
    navigate(to, { replace: Boolean(overlay) });
  }, [overlay, navigate]);

  return { overlay, openOverlay, closeOverlay, navigateFromOverlay };
}

/**
 * Walkthrough reveal requests (contracts.md §7).
 *
 * TourProvider sits above the lazily loaded AppShell, and AppShell remounts on
 * every path change, so a plain event could fire before any shell is listening.
 * The request is therefore sticky: the latest value is kept here and read by
 * each shell on mount, and the event only notifies a shell that is already up.
 */
export const SHELL_REVEAL_EVENT = 'clubpm:shell-reveal';
let currentReveal = null;   // 'more' | 'projects' | 'expand' | null
let revealRoute = '*';      // the requesting step's route pattern

function routeMatches(pattern, pathname) {
  if (!pattern || pattern === '*') return true;
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  return p.length === a.length && p.every((seg, i) => seg.startsWith(':') || seg === a[i]);
}

export function requestShellReveal(target, route = '*') {
  const next = target === 'more' || target === 'projects' || target === 'expand' ? target : null;
  // A "*" step never navigates, so it is asking about the screen it is on.
  revealRoute = !route || route === '*' ? window.location.pathname : route;
  if (next === currentReveal) return;
  currentReveal = next;
  window.dispatchEvent(new CustomEvent(SHELL_REVEAL_EVENT, { detail: { target: next } }));
}

/**
 * The pending reveal for a shell mounting at `pathname`. A shell that mounts
 * because the learner clicked the revealed item (More › Shop, say) lands on a
 * different route than the step that asked; it must not reopen the sheet in
 * the moment before the tour advances.
 */
export function getShellReveal(pathname) {
  if (!currentReveal) return null;
  if (pathname !== undefined && !routeMatches(revealRoute, pathname)) return null;
  return currentReveal;
}
