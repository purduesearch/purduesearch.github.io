import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { get, post, patch } from "../../api/clubPmClient";

const POLL_INTERVAL_MS = 30_000;

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

function NotifItem({ notif, onRead }) {
  return (
    <div
      className={`pm-notif-item${notif.read ? "" : " unread"}`}
      onClick={() => onRead(notif)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onRead(notif)}
    >
      <span className="pm-notif-dot" aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pm-notif-message">{notif.message}</div>
        <div className="pm-notif-time">{relTime(notif.createdAt)}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open,          setOpen]          = useState(false);
  const wrapperRef = useRef(null);
  const navigate   = useNavigate();

  // ── fetch notifications ───────────────────────────────────
  const fetchNotifs = useCallback(async () => {
    try {
      const data = await get("/api/notifications?limit=10");
      setNotifications(data.notifications ?? data ?? []);
    } catch {
      // silently ignore
    }
  }, []);

  // mount + polling
  useEffect(() => {
    fetchNotifs();
    const timer = setInterval(fetchNotifs, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchNotifs]);

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

  // ── read a single notification ────────────────────────────
  const handleRead = useCallback(
    async notif => {
      // optimistic update
      setNotifications(prev =>
        prev.map(n => (n.id === notif.id ? { ...n, read: true } : n))
      );
      // fire and forget
      patch(`/api/notifications/${notif.id}/read`, {}).catch(() => {});
      // navigate if has project
      if (notif.projectId) {
        setOpen(false);
        navigate(`/clubpm/projects/${notif.projectId}`);
      }
    },
    [navigate]
  );

  // ── mark all read ─────────────────────────────────────────
  const handleMarkAll = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await post("/api/notifications/read-all", {});
    } catch {
      // silently ignore
    }
  }, []);

  // ── derived counts ────────────────────────────────────────
  const unreadCount  = notifications.filter(n => !n.read).length;
  const badgeLabel   = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div style={{ position: "relative", display: "inline-block" }} ref={wrapperRef}>
      {/* Bell button */}
      <button
        className="pm-notif-bell-btn"
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

          <div className="pm-notif-list">
            {notifications.length === 0 ? (
              <div className="pm-notif-empty">
                You're all caught up 🎉
              </div>
            ) : (
              notifications.map(notif => (
                <NotifItem key={notif.id} notif={notif} onRead={handleRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
