// Shows the current Google Drive bot-account connection state and lets an
// admin connect or disconnect it. Mirrors
// src/components/clubpm/github/GitHubConnectButton.jsx. Connecting/
// disconnecting is admin-only server-side (backend/src/api/googleAuth.ts
// requireAdmin) — this component doesn't gate itself since its only mount
// point (AdminView) is already admin-gated. See
// docs/superpowers/specs/2026-07-06-clubpm-drive-multirepo-design.md §3
// (Workstream A).

import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { getGoogleDriveStatus, disconnectGoogleDrive, apiBaseUrl, getStoredToken } from "../../api/clubPmClient";

export default function GoogleDriveConnectButton({ compact = false }) {
  const [status, setStatus] = useState({ connected: false, email: null });
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGoogleDriveStatus();
      setStatus(data);
    } catch {
      // 401 etc. — assume disconnected
      setStatus({ connected: false, email: null });
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh on mount AND whenever the URL gains/loses a ?google=connected
  // marker (the OAuth callback redirects back with that flag).
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get("google");
    if (!flag) return;
    if (flag === "connected") {
      toast.success("Google Drive connected");
      refresh();
    } else if (flag === "denied") {
      toast.error("Google Drive connection cancelled");
    } else if (flag === "norefresh") {
      toast.error("Google didn't grant offline access — reconnect and approve when prompted");
    } else if (flag === "token_failed" || flag === "user_failed") {
      toast.error("Google OAuth failed");
    }
    // Strip the flag without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState({}, "", url.toString());
  }, [location.search, refresh]);

  function connect() {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    // The OAuth flow is a full-page redirect — backend stashes the caller's
    // memberId in the session before bouncing to accounts.google.com. Must
    // target the backend origin (apiBaseUrl), not the static GitHub Pages
    // host. A full-page nav can't send the Authorization header, and the
    // cross-origin session cookie may be blocked (SameSite=None), so pass the
    // bearer token via query param — the backend accepts it as a fallback.
    const token = getStoredToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
    window.location.href = `${apiBaseUrl}/auth/google?returnTo=${returnTo}${tokenParam}`;
  }

  async function disconnect() {
    if (!window.confirm("Disconnect the Google Drive bot account from ClubPM?")) return;
    try {
      await disconnectGoogleDrive();
      toast.success("Google Drive disconnected");
      setStatus({ connected: false, email: null });
    } catch (err) {
      toast.error(err?.message ?? "Failed to disconnect");
    }
  }

  if (loading) {
    return (
      <span className="cpm-gh-connect-pill cpm-gh-connect-loading" title="Loading…">
        <i className="fab fa-google-drive" aria-hidden="true" />
        <span className="cpm-gh-connect-label">Loading…</span>
      </span>
    );
  }

  if (!status.connected) {
    return (
      <button type="button" className="cpm-gh-connect-pill cpm-gh-connect-cta" onClick={connect} title="Connect Google Drive">
        <i className="fab fa-google-drive" aria-hidden="true" />
        <span className="cpm-gh-connect-label">{compact ? "Connect" : "Connect Google Drive"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="cpm-gh-connect-pill cpm-gh-connect-active"
      onClick={disconnect}
      title={`Connected as ${status.email} — click to disconnect`}
    >
      <i className="fab fa-google-drive" aria-hidden="true" />
      <span className="cpm-gh-connect-label">{status.email}</span>
    </button>
  );
}
