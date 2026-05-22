import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { get, post, patch, del } from "../../api/clubPmClient";

const POLL_INTERVAL_MS = 60_000; // fallback polling — SSE is primary

// ── Type group definitions ────────────────────────────────────

const TYPE_GROUPS = {
  Mentions: ["TASK_MENTIONED", "COMMENT_REPLY"],
  Tasks: [
    "TASK_ASSIGNED",
    "TASK_COMPLETED",
    "TASK_UPDATED",
    "TASK_COMMENTED",
    "TASK_DUE_SOON",
    "TASK_OVERDUE",
  ],
  Projects: [
    "PROJECT_UPDATE",
    "MILESTONE_COMPLETED",
    "MILESTONE_AT_RISK",
    "STANDUP_POSTED",
    "SYSTEM",
  ],
};

const TABS = ["All", "Mentions", "Tasks", "Projects"];

function matchesTab(notif, tab) {
  if (tab === "All") return true;
  return (TYPE_GROUPS[tab] ?? []).includes(notif.type);
}

// ── Bell SVG icon ─────────────────────────────────────────────

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ── Relative time helper ──────────────────────────────────────

function relTime(iso) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

// ── Notification item ─────────────────────────────────────────

function NotifItem({ notif, onRead, onDismiss }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter") onRead(notif);
  };

  return (
    <div
      className={`pm-notif-item${notif.read ? "" : " unread"}`}
      onClick={() => onRead(notif)}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <span className="pm-notif-dot" aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pm-notif-message">{notif.message}</div>
        <div className="pm-notif-time">{relTime(notif.createdAt)}</div>
      </div>
      {onDismiss && (
        <button
          className="pm-notif-dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notif.id);
          }}
          aria-label="Dismiss notification"
          tabIndex={-1}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [nextCursor,    setNextCursor]    = useState(null);
  const [loadingMore,  setLoadingMore]   = useState(false);
  const [open,          setOpen]          = useState(false);
  const [activeTab,     setActiveTab]     = useState("All");
  const [pulsing,       setPulsing]       = useState(false);

  const wrapperRef  = useRef(null);
  const listRef     = useRef(null);
  const sseRef      = useRef(null);
  const pollRef     = useRef(null);
  const navigate    = useNavigate();

  // ── fetch first page ─────────────────────────────────────
  const fetchNotifs = useCallback(async () => {
    try {
      const data = await get("/api/notifications?limit=10");
      setNotifications(data.notifications ?? data ?? []);
      setNextCursor(data.nextCursor ?? null);
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

  // ── SSE connection ────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (sseRef.current) return; // already connected

    const es = new EventSource("/api/notifications/stream", {
      withCredentials: true,
    });
    sseRef.current = es;

    es.addEventListener("notification", (e) => {
      try {
        const notif = JSON.parse(e.data);
        setNotifications(prev => [notif, ...prev]);
        if (!notif.read) {
          setPulsing(true);
          setTimeout(() => setPulsing(false), 2000);
        }
      } catch {
        // malformed event — ignore
      }
    });

    es.onerror = () => {
      // SSE dropped — close, fall back to polling
      es.close();
      sseRef.current = null;
      startPolling();
    };

    // SSE is live — stop fallback polling if it was running
    stopPolling();
  }, [startPolling, stopPolling]);

  // mount: initial fetch + SSE
  useEffect(() => {
    fetchNotifs();
    connectSSE();
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      stopPolling();
    };
  }, [fetchNotifs, connectSSE, stopPolling]);

  // ── click outside to close ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // ── infinite scroll inside dropdown ──────────────────────
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    function onScroll() {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
        loadMore();
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open, loadMore]);

  // ── read a single notification ────────────────────────────
  const handleRead = useCallback(
    async (notif) => {
      setNotifications(prev =>
        prev.map(n => (n.id === notif.id ? { ...n, read: true } : n))
      );
      patch(`/api/notifications/${notif.id}/read`, {}).catch(() => {});
      if (notif.projectId || notif.taskId) {
        setOpen(false);
        navigate(`/clubpm/projects/${notif.projectId}`);
      }
    },
    [navigate]
  );

  // ── dismiss a notification ────────────────────────────────
  const handleDismiss = useCallback(async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    del(`/api/notifications/${id}`).catch(() => {});
  }, []);

  // ── mark all read ─────────────────────────────────────────
  const handleMarkAll = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    post("/api/notifications/read-all", {}).catch(() => {});
  }, []);

  // ── derived values ────────────────────────────────────────
  const unreadCount = notifications.filter(n => !n.read).length;
  const badgeLabel  = unreadCount > 9 ? "9+" : String(unreadCount);
  const filtered    = notifications.filter(n => matchesTab(n, activeTab));

  return (
    <div style={{ position: "relative", display: "inline-block" }} ref={wrapperRef}>
      {/* Bell button */}
      <button
        className={`pm-notif-bell-btn${pulsing ? " pm-notif-bell--pulse" : ""}`}
        onClick={() => setOpen(prev => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="pm-notif-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="pm-notif-dropdown" role="dialog" aria-label="Notifications">
          {/* Header */}
          <div className="pm-notif-header">
            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--pm-text-primary)" }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button className="pm-notif-mark-all" onClick={handleMarkAll}>
                Mark all read
              </button>
            )}
          </div>

          {/* Tab bar */}
          <div className="pm-notif-tabs" role="tablist">
            {TABS.map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`pm-notif-tab${activeTab === tab ? " active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="pm-notif-list" ref={listRef}>
            {filtered.length === 0 ? (
              <div className="pm-notif-empty">
                You're all caught up
              </div>
            ) : (
              <>
                {filtered.map(notif => (
                  <NotifItem
                    key={notif.id}
                    notif={notif}
                    onRead={handleRead}
                    onDismiss={handleDismiss}
                  />
                ))}
                {loadingMore && (
                  <div style={{ textAlign: "center", padding: "10px 0" }}>
                    <div className="cpm-spinner" style={{ margin: "0 auto" }} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
