import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ClubPM ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
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
