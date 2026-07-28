import { Component } from 'react';

/**
 * Catches failures from the lazy() route chunks in App.js.
 *
 * GitHub Pages redeploys on every push to main, and CRA emits content-hashed
 * chunk filenames. A visitor who keeps the tab open across a deploy and then
 * navigates will request a chunk hash that no longer exists; the dynamic
 * import rejects, and without a boundary React unmounts the whole tree
 * (white screen). One automatic reload pulls the new index.html + hashes.
 */
const RELOAD_AT_KEY = 'searchChunkReloadedAt';
// A reload we just performed hasn't fixed it, so show the fallback instead of
// looping. A later failure (another deploy, minutes on) gets its own reload.
const RELOAD_COOLDOWN_MS = 30_000;

export function isChunkLoadError(error) {
  const msg = `${error?.name || ''} ${error?.message || ''}`;
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(msg);
}

export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (!isChunkLoadError(error)) throw error;
    // Gate on *when* we last reloaded, not on a flag cleared at mount: the
    // boundary mounts before the dynamic import rejects, so clearing on mount
    // cleared the guard every reload and turned it into a reload loop.
    const lastReload = Number(sessionStorage.getItem(RELOAD_AT_KEY)) || 0;
    if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
    window.location.reload();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="chunk-error-fallback" role="alert">
        <h1>This page needs a refresh</h1>
        <p>
          The site was updated while this tab was open. Reload to get the
          latest version.
        </p>
        <button
          type="button"
          className="chunk-error-btn"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    );
  }
}
