// Shows the current GitHub connection state and lets the member connect
// or disconnect. Lives in the AppShell user menu.

import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { get, del } from "../../../api/clubPmClient";

const STATUS_ENDPOINT = "/auth/github/me";

export default function GitHubConnectButton({ compact = false }) {
  const [status, setStatus] = useState({ connected: false, healthy: false, login: null });
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get(STATUS_ENDPOINT);
      setStatus(data);
    } catch {
      // 401 etc. — assume disconnected
      setStatus({ connected: false, healthy: false, login: null });
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh on mount AND whenever the URL gains/loses a ?github=connected
  // marker (the OAuth callback redirects back with that flag).
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get("github");
    if (!flag) return;
    if (flag === "connected") {
      toast.success("GitHub connected");
      refresh();
    } else if (flag === "denied") {
      toast.error("GitHub connection cancelled");
    } else if (flag === "token_failed" || flag === "user_failed") {
      toast.error("GitHub OAuth failed");
    }
    // Strip the flag without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete("github");
    window.history.replaceState({}, "", url.toString());
  }, [location.search, refresh]);

  function connect() {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    // The OAuth flow is a full-page redirect — backend stashes the caller's
    // memberId in the session before bouncing to github.com.
    window.location.href = `/auth/github?returnTo=${returnTo}`;
  }

  async function disconnect() {
    if (!window.confirm("Disconnect your GitHub account from ClubPM?")) return;
    try {
      await del("/auth/github");
      toast.success("GitHub disconnected");
      setStatus({ connected: false, healthy: false, login: null });
    } catch (err) {
      toast.error(err?.message ?? "Failed to disconnect");
    }
  }

  if (loading) {
    return (
      <span className="cpm-gh-connect-pill cpm-gh-connect-loading" title="Loading…">
        <i className="fab fa-github" aria-hidden="true" />
        <span className="cpm-gh-connect-label">Loading…</span>
      </span>
    );
  }

  if (!status.connected) {
    return (
      <button type="button" className="cpm-gh-connect-pill cpm-gh-connect-cta" onClick={connect} title="Connect GitHub">
        <i className="fab fa-github" aria-hidden="true" />
        <span className="cpm-gh-connect-label">{compact ? "Connect" : "Connect GitHub"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`cpm-gh-connect-pill cpm-gh-connect-active ${status.healthy ? "" : "cpm-gh-connect-unhealthy"}`}
      onClick={disconnect}
      title={status.healthy ? `Connected as @${status.login}` : "Token expired — click to reconnect"}
    >
      <i className="fab fa-github" aria-hidden="true" />
      <span className="cpm-gh-connect-label">@{status.login}</span>
      {!status.healthy && <span className="cpm-gh-connect-warn" aria-hidden="true">!</span>}
    </button>
  );
}
