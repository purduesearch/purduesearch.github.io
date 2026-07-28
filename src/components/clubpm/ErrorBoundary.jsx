import React from 'react';
import { isChunkLoadError } from '../ChunkErrorBoundary';

/**
 * Catches render errors inside the ClubPM shell.
 *
 * It sits *below* App.js's ChunkErrorBoundary, so React hands it every error
 * from a lazy ClubPM page first — including the ChunkLoadError a tab left open
 * across a GitHub Pages deploy throws. Showing "Something went wrong" for that
 * is a dead end: "Try again" re-requests the same deleted chunk hash forever.
 * Those errors are rethrown from render() so they escalate to ChunkErrorBoundary,
 * which reloads the page and picks up the new chunk hashes.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error)) return; // handled by ChunkErrorBoundary; see class docblock
    console.error('[ClubPM ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      // Throwing from a boundary's fallback escalates to the next boundary up.
      if (isChunkLoadError(this.state.error)) throw this.state.error;
      return (
        <div className="pm-error-boundary">
          <div className="pm-error-boundary-icon">&#9888;</div>
          <div className="pm-error-boundary-title">Something went wrong</div>
          <div className="pm-error-boundary-msg">{this.state.error?.message}</div>
          <button className="pm-error-boundary-btn" onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
