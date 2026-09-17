import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { get, post, patch, del, apiBaseUrl, getStoredToken } from "../../api/clubPmClient";

const SESSION_GREETED_KEY = "cpm.bell.greeted";

const POLL_INTERVAL_MS = 60_000; // fallback polling — SSE is primary

const SSE_RETRY_BASE_MS = 5_000;
const SSE_RETRY_MAX_MS = 5 * 60_000;

/**
 * The app's notification feed and its single EventSource.
 *
 * Lifted out of NotificationBell so AppShell owns exactly one instance whatever
 * presentation is mounted: the desktop dropdown bell and the phone header bell
 * (a link to the Notification Center) both read this, and switching between
 * them across the compact breakpoint neither reconnects the stream nor refetches.
 * The SSE listeners also re-broadcast Slack and reward events as window events
 * that other surfaces depend on (see the notification-bell memory note), which
 * is why there must never be two of these mounted.
 */
export default function useNotificationFeed({ enabled = true } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [nextCursor,    setNextCursor]    = useState(null);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [pulsing,       setPulsing]       = useState(false);
  const [ringing,       setRinging]       = useState(false);

  const sseRef         = useRef(null);
  const pollRef        = useRef(null);
  const retryTimerRef  = useRef(null);
  const retryDelayRef  = useRef(SSE_RETRY_BASE_MS);
  const connectSSERef  = useRef(null);
  const navigate       = useNavigate();

  // ── fetch first page ─────────────────────────────────────
  const fetchNotifs = useCallback(async () => {
    try {
      const data = await get("/api/notifications?limit=10");
      const notifs = data.notifications ?? data ?? [];
      setNotifications(notifs);
      setNextCursor(data.nextCursor ?? null);

      // Once per browser session, if the user logged in with unread notifs,
      // ring the bell. Gated via sessionStorage so re-mounts don't replay it.
      try {
        const greeted = sessionStorage.getItem(SESSION_GREETED_KEY) === "1";
        const unread = (notifs ?? []).some(n => !n.read);
        if (!greeted && unread) {
          sessionStorage.setItem(SESSION_GREETED_KEY, "1");
          setRinging(true);
        }
      } catch { /* sessionStorage unavailable — skip */ }
    } catch {
      // silently ignore
    }
  }, []);

  // ── load next page ────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await get(`/api/notifications?limit=10&cursor=${nextCursor}`);
      setNotifications(prev => [...prev, ...(data.notifications ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silently ignore
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // ── start fallback polling ────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchNotifs, POLL_INTERVAL_MS);
  }, [fetchNotifs]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ── cancel any pending SSE reconnect timer ────────────────
  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // ── SSE connection ────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (sseRef.current) return; // already connected

    const token = getStoredToken();
    const url = `${apiBaseUrl}/api/notifications/stream${
      token ? `?token=${encodeURIComponent(token)}` : ""
    }`;
    const es = new EventSource(url, {
      withCredentials: true,
    });
    sseRef.current = es;

    es.onopen = () => {
      // SSE is live — stop fallback polling and reset backoff.
      stopPolling();
      clearRetryTimer();
      retryDelayRef.current = SSE_RETRY_BASE_MS;
    };

    es.addEventListener("notification", (e) => {
      try {
        const notif = JSON.parse(e.data);
        // Slack DM pings are UPDATED in place ("3 new messages") — replace by id.
        setNotifications(prev => [notif, ...prev.filter(n => n.id !== notif.id)]);
        if (!notif.read) {
          setPulsing(true);
          setTimeout(() => setPulsing(false), 2000);
        }

        // Reward approved → fire flying-particles animation + balance refresh.
        if (notif.metadata?.type === "REWARD_APPROVED") {
          window.dispatchEvent(new CustomEvent("clubpm:reward-granted", {
            detail: {
              xpDelta:       notif.metadata.xpDelta       ?? 0,
              doubloonsDelta: notif.metadata.doubloonsDelta ?? 0,
            },
          }));
          // Signal the sidebar/topbar to re-fetch the member balance.
          window.dispatchEvent(new CustomEvent("clubpm:member-updated"));
        }

        // Real-time synchronization for admin tab badge: new pending reward queued
        if (notif.type === "SYSTEM" && notif.metadata?.type === "PENDING_REWARD_CREATED") {
          window.dispatchEvent(new CustomEvent("clubpm:pending-rewards-updated"));
        }
      } catch {
        // malformed event — ignore
      }
    });

    // Slack chat archive: the chat tab is not always mounted, so this listener
    // lives with the app's single EventSource and re-broadcasts as a window
    // event — same idiom as clubpm:reward-granted above.
    es.addEventListener("slack-message", (e) => {
      try {
        window.dispatchEvent(new CustomEvent("clubpm:slack-message", {
          detail: JSON.parse(e.data),
        }));
      } catch {
        // malformed event — ignore
      }
    });

    // A new DM or channel membership — lets inbox/sidebars refresh without polling.
    es.addEventListener("slack-membership", (e) => {
      try {
        window.dispatchEvent(new CustomEvent("clubpm:slack-membership", { detail: JSON.parse(e.data) }));
      } catch {
        // malformed event — ignore
      }
    });

    // Read in Slack, in another tab, or by posting — sync without a refetch.
    es.addEventListener("notification-read", (e) => {
      try {
        const ids = new Set(JSON.parse(e.data).ids ?? []);
        setNotifications(prev => prev.map(n => (ids.has(n.id) ? { ...n, read: true } : n)));
      } catch {
        // malformed event — ignore
      }
    });
    // The pinging message was deleted in Slack.
    es.addEventListener("notification-removed", (e) => {
      try {
        const ids = new Set(JSON.parse(e.data).ids ?? []);
        setNotifications(prev => prev.filter(n => !ids.has(n.id)));
      } catch {
        // malformed event — ignore
      }
    });

    es.onerror = () => {
      // SSE dropped — close, fall back to polling, and schedule a retry
      // with exponential backoff (capped) so we don't hammer the server.
      es.close();
      sseRef.current = null;
      startPolling();

      if (!retryTimerRef.current) {
        const delay = retryDelayRef.current;
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          connectSSERef.current?.();
        }, delay);
        retryDelayRef.current = Math.min(delay * 2, SSE_RETRY_MAX_MS);
      }
    };
  }, [startPolling, stopPolling, clearRetryTimer]);

  // Keep a stable ref to the latest connectSSE so the retry timeout (which
  // may fire long after this render) always calls the current closure.
  useEffect(() => {
    connectSSERef.current = connectSSE;
  }, [connectSSE]);

  // mount: initial fetch + SSE — only once a member is signed in, which is
  // when the bell used to mount.
  useEffect(() => {
    if (!enabled) return undefined;
    fetchNotifs();
    connectSSE();
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      clearRetryTimer();
      stopPolling();
    };
  }, [enabled, fetchNotifs, connectSSE, stopPolling, clearRetryTimer]);

  // ── read a single notification ────────────────────────────
  // Returns true when it navigated, so a dropdown can close itself.
  const markRead = useCallback(
    (notif) => {
      setNotifications(prev =>
        prev.map(n => (n.id === notif.id ? { ...n, read: true } : n))
      );
      patch(`/api/notifications/${notif.id}/read`, {}).catch(() => {});
      if (notif.metadata?.link) {
        navigate(notif.metadata.link);
        return true;
      }
      if (notif.projectId) {
        const taskQuery = notif.taskId ? `?task=${notif.taskId}` : "";
        navigate(`/clubpm/projects/${notif.projectId}${taskQuery}`);
        return true;
      }
      return false;
    },
    [navigate]
  );

  // ── dismiss a notification ────────────────────────────────
  const dismiss = useCallback(async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    del(`/api/notifications/${id}`).catch(() => {});
  }, []);

  // ── mark all read ─────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    post("/api/notifications/read-all", {}).catch(() => {});
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications, unreadCount, nextCursor, loadingMore, loadMore,
    pulsing, ringing, stopRinging: () => setRinging(false),
    markRead, dismiss, markAllRead,
  };
}
