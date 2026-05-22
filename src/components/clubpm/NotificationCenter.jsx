import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { get, post, patch, del } from "../../api/clubPmClient";

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

const TYPE_LABELS = {
  TASK_MENTIONED:      "Mentioned",
  COMMENT_REPLY:       "Reply",
  TASK_ASSIGNED:       "Assigned",
  TASK_COMPLETED:      "Task Done",
  TASK_UPDATED:        "Updated",
  TASK_COMMENTED:      "Comment",
  TASK_DUE_SOON:       "Due Soon",
  TASK_OVERDUE:        "Overdue",
  PROJECT_UPDATE:      "Project",
  MILESTONE_COMPLETED: "Milestone",
  MILESTONE_AT_RISK:   "At Risk",
  STANDUP_POSTED:      "Standup",
  SYSTEM:              "System",
};

const TYPE_BADGE_COLORS = {
  TASK_MENTIONED:      "var(--pm-accent-violet)",
  COMMENT_REPLY:       "var(--pm-accent-violet)",
  TASK_ASSIGNED:       "var(--pm-accent-teal)",
  TASK_COMPLETED:      "var(--pm-accent-teal)",
  TASK_UPDATED:        "var(--pm-text-muted)",
  TASK_COMMENTED:      "var(--pm-text-muted)",
  TASK_DUE_SOON:       "var(--pm-accent-amber)",
  TASK_OVERDUE:        "var(--pm-accent-coral, #ff6b6b)",
  PROJECT_UPDATE:      "var(--pm-accent-teal)",
  MILESTONE_COMPLETED: "var(--pm-accent-teal)",
  MILESTONE_AT_RISK:   "var(--pm-accent-amber)",
  STANDUP_POSTED:      "var(--pm-text-secondary)",
  SYSTEM:              "var(--pm-text-muted)",
};

function matchesTab(notif, tab) {
  if (tab === "All") return true;
  return (TYPE_GROUPS[tab] ?? []).includes(notif.type);
}

// ── Date grouping ─────────────────────────────────────────────

function getDateGroup(iso) {
  try {
    const d = new Date(iso);
    if (isToday(d))     return "Today";
    if (isYesterday(d)) return "Yesterday";
    if (isThisWeek(d))  return "This Week";
    return "Earlier";
  } catch {
    return "Earlier";
  }
}

const DATE_GROUP_ORDER = ["Today", "Yesterday", "This Week", "Earlier"];

function groupByDate(notifications) {
  const groups = {};
  for (const notif of notifications) {
    const label = getDateGroup(notif.createdAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(notif);
  }
  // Return in stable order
  return DATE_GROUP_ORDER
    .filter(label => groups[label])
    .map(label => ({ label, items: groups[label] }));
}

// ── Relative time helper ──────────────────────────────────────

function relTime(iso) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

// ── Type badge ────────────────────────────────────────────────

function TypeBadge({ type }) {
  const label = TYPE_LABELS[type] ?? type;
  const color = TYPE_BADGE_COLORS[type] ?? "var(--pm-text-muted)";
  return (
    <span
      className="pm-notif-type-badge"
      style={{ color, borderColor: color }}
    >
      {label}
    </span>
  );
}

// ── Notification item (center version) ───────────────────────

function CenterNotifItem({ notif, onRead, onDismiss }) {
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <TypeBadge type={notif.type} />
          <span className="pm-notif-time">{relTime(notif.createdAt)}</span>
        </div>
        <div className="pm-notif-message">{notif.message}</div>
      </div>
      <button
        className="pm-notif-dismiss"
        onClick={e => { e.stopPropagation(); onDismiss(notif.id); }}
        aria-label="Dismiss"
        tabIndex={-1}
      >
        ×
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [nextCursor,    setNextCursor]    = useState(null);
  const [loadingMore,  setLoadingMore]   = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState("All");
  const sentinelRef = useRef(null);
  const navigate    = useNavigate();

  // ── Initial fetch ─────────────────────────────────────────
  const fetchNotifs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get("/api/notifications?limit=20");
      setNotifications(data.notifications ?? data ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  // ── Load more (infinite scroll) ───────────────────────────
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await get(`/api/notifications?limit=20&cursor=${nextCursor}`);
      setNotifications(prev => [...prev, ...(data.notifications ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silently ignore
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // Intersection observer for infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // ── Read single ───────────────────────────────────────────
  const handleRead = useCallback(async (notif) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notif.id ? { ...n, read: true } : n))
    );
    patch(`/api/notifications/${notif.id}/read`, {}).catch(() => {});
    if (notif.projectId || notif.taskId) {
      navigate(`/clubpm/projects/${notif.projectId}`);
    }
  }, [navigate]);

  // ── Dismiss single ────────────────────────────────────────
  const handleDismiss = useCallback(async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    del(`/api/notifications/${id}`).catch(() => {});
  }, []);

  // ── Mark all read ─────────────────────────────────────────
  const handleMarkAll = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    post("/api/notifications/read-all", {}).catch(() => {});
  }, []);

  // ── Delete all read ───────────────────────────────────────
  const handleDeleteAllRead = useCallback(async () => {
    const readIds = notifications.filter(n => n.read).map(n => n.id);
    setNotifications(prev => prev.filter(n => !n.read));
    // Fire and forget each delete
    for (const id of readIds) {
      del(`/api/notifications/${id}`).catch(() => {});
    }
  }, [notifications]);

  // ── Derived ───────────────────────────────────────────────
  const filtered       = notifications.filter(n => matchesTab(n, activeTab));
  const dateGroups     = groupByDate(filtered);
  const unreadCount    = notifications.filter(n => !n.read).length;
  const hasRead        = notifications.some(n => n.read);

  return (
    <div className="pm-notif-center">
      {/* Page header */}
      <div className="pm-notif-center-header">
        <div>
          <h1 style={{
            fontFamily: "var(--pm-font-display)",
            fontSize: "1.4rem",
            fontWeight: 700,
            color: "var(--pm-text-primary)",
            margin: 0,
          }}>
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p style={{
              margin: "2px 0 0",
              fontSize: 12,
              color: "var(--pm-text-muted)",
            }}>
              {unreadCount} unread
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {unreadCount > 0 && (
            <button className="pm-notif-mark-all" onClick={handleMarkAll}
              style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid var(--pm-border)" }}>
              Mark all read
            </button>
          )}
          {hasRead && (
            <button
              onClick={handleDeleteAllRead}
              style={{
                background: "none",
                border: "1px solid var(--pm-border)",
                cursor: "pointer",
                color: "var(--pm-text-muted)",
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 6,
                fontFamily: "var(--pm-font-body)",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              Delete all read
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="pm-notif-tabs" role="tablist" style={{ borderBottom: "1px solid var(--pm-border)", marginBottom: 0 }}>
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

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <div className="cpm-spinner" />
        </div>
      ) : dateGroups.length === 0 ? (
        <div className="pm-notif-empty" style={{ padding: "64px 16px" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>
            <i className="fas fa-bell" aria-hidden="true" style={{ opacity: 0.2 }} />
          </div>
          You're all caught up
          {activeTab !== "All" && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              No {activeTab.toLowerCase()} notifications
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {dateGroups.map(group => (
            <div key={group.label} className="pm-notif-date-group">
              <div className="pm-notif-date-label">{group.label}</div>
              <div className="pm-notif-list" style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--pm-border)" }}>
                {group.items.map(notif => (
                  <CenterNotifItem
                    key={notif.id}
                    notif={notif}
                    onRead={handleRead}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} style={{ height: 1 }} />

          {loadingMore && (
            <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
              <div className="cpm-spinner" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
