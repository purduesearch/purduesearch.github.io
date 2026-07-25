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
const RELOAD_FLAG = 'searchChunkReloaded';

function isChunkLoadError(error) {
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
    // Reload once only — a reload loop would be worse than the message.
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    window.location.reload();
  }

  componentDidMount() {
    sessionStorage.removeItem(RELOAD_FLAG);
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
