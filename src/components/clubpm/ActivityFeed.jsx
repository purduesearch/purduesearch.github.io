import React, { useState, useEffect, useCallback, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { get } from "../../api/clubPmClient";

// ── Filter chip config ────────────────────────────────────────

const FILTER_CHIPS = [
  { label: "ALL",        value: ""                                                          },
  { label: "TASKS",      value: "task_created,task_updated,task_completed"                  },
  { label: "COMMENTS",   value: "comment_added"                                             },
  { label: "MEMBERS",    value: "member_added,member_removed"                               },
  { label: "MILESTONES", value: "milestone_updated,milestone_created"                       },
];

const PAGE_SIZE = 20;

// ── Avatar ────────────────────────────────────────────────────

function Avatar({ member }) {
  if (member?.avatarUrl) {
    return (
      <img
        className="pm-activity-avatar"
        src={member.avatarUrl}
        alt={member.displayName ?? ""}
      />
    );
  }
  const initial = (member?.displayName ?? "?")[0].toUpperCase();
  return (
    <div className="pm-activity-avatar pm-activity-avatar--initials">
      {initial}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────

function Spinner() {
  return <div className="pm-activity-spinner" aria-label="Loading" />;
}

// ── Activity item ─────────────────────────────────────────────

function ActivityItem({ item }) {
  const relTime = (() => {
    try {
      return formatDistanceToNow(new Date(item.createdAt), { addSuffix: true });
    } catch {
      return "";
    }
  })();

  return (
    <div className="pm-activity-item">
      <Avatar member={item.member} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pm-activity-meta">
          <span style={{ color: "var(--pm-text-primary)", fontWeight: 500 }}>
            {item.member?.displayName ?? "Unknown"}
          </span>
          <span style={{ color: "var(--pm-text-muted)", fontSize: 11 }}>
            &nbsp;·&nbsp;{relTime}
          </span>
        </div>
        <div className="pm-activity-desc">{item.description}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function ActivityFeed({ projectId, maxHeight = "480px" }) {
  const [activities, setActivities] = useState([]);
  const [total,      setTotal]      = useState(0);
  const [offset,     setOffset]     = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("");
  const sentinelRef = useRef(null);
  const loadingRef  = useRef(false);

  // ── fetch a page ──────────────────────────────────────────
  const fetchPage = useCallback(
    async (pageOffset, typeFilter, append) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageOffset) });
        if (typeFilter) qs.set("type", typeFilter);
        const data = await get(`/api/activity/project/${projectId}?${qs}`);
        const items = data.activities ?? [];
        setTotal(data.total ?? 0);
        setActivities(prev => (append ? [...prev, ...items] : items));
        setOffset(pageOffset + items.length);
      } catch {
        // silently ignore fetch errors in feed
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [projectId]
  );

  // ── reset + initial fetch on filter change ────────────────
  useEffect(() => {
    setActivities([]);
    setTotal(0);
    setOffset(0);
    fetchPage(0, filter, false);
  }, [filter, fetchPage]);

  // ── infinite scroll via IntersectionObserver ──────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current) {
          setActivities(current => {
            setTotal(t => {
              if (current.length < t) {
                fetchPage(current.length, filter, true);
              }
              return t;
            });
            return current;
          });
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filter, fetchPage]);

  // ── render ────────────────────────────────────────────────
  return (
    <div className="pm-activity-feed" style={{ maxHeight }}>
      {/* Filter chips */}
      <div className="pm-activity-filters">
        {FILTER_CHIPS.map(chip => (
          <button
            key={chip.label}
            className={`pm-activity-chip${filter === chip.value ? " active" : ""}`}
            onClick={() => setFilter(chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Scrollable list */}
      <div className="pm-activity-list">
        {activities.length === 0 && !loading ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            padding: "40px 0",
            color: "var(--pm-text-muted)",
          }}>
            <i className="fas fa-stream" style={{ fontSize: 24, opacity: 0.35 }} aria-hidden="true" />
            <span style={{ fontSize: 13 }}>No activity yet</span>
          </div>
        ) : (
          activities.map(item => <ActivityItem key={item.id} item={item} />)
        )}

        {/* Sentinel for infinite scroll */}
        <div className="pm-activity-sentinel" ref={sentinelRef} />

        {/* Loading spinner */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
            <Spinner />
          </div>
        )}
      </div>
    </div>
  );
}
