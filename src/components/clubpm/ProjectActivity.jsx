import React, { useState, useEffect, useCallback, useRef } from "react";
import { get } from "../../api/clubPmClient";
import MemberBadge from "./MemberBadge";

// ── Event type metadata ──────────────────────────────────────

const EVENT_META = {
  TASK_CREATED:         { icon: "✨", color: "var(--clubpm-accent-primary)",  label: "Created"    },
  TASK_UPDATED:         { icon: "✏️", color: "var(--clubpm-text-secondary)",  label: "Updated"    },
  TASK_COMPLETED:       { icon: "✅", color: "var(--clubpm-accent-green)",    label: "Completed"  },
  TASK_DELETED:         { icon: "🗑",  color: "#e17055",                       label: "Deleted"    },
  TASK_ASSIGNED:        { icon: "👤", color: "var(--clubpm-accent-primary)",  label: "Assigned"   },
  TASK_REASSIGNED:      { icon: "🔁", color: "var(--clubpm-accent-yellow)",   label: "Reassigned" },
  TASK_SNOOZED:         { icon: "💤", color: "var(--clubpm-text-muted)",      label: "Snoozed"    },
  TASK_NOTE_ADDED:      { icon: "📝", color: "var(--clubpm-accent-primary)",  label: "Note"       },
  TASK_SUBTASK_CREATED: { icon: "🔗", color: "var(--clubpm-accent-primary)",  label: "Subtask"    },
  PROJECT_CREATED:      { icon: "🚀", color: "var(--clubpm-accent-green)",    label: "Project"    },
  PROJECT_UPDATED:      { icon: "⚙️", color: "var(--clubpm-text-secondary)",  label: "Project"    },
  PROJECT_MEMBER_ADDED: { icon: "👥", color: "var(--clubpm-accent-primary)",  label: "Member"     },
  STANDUP_POSTED:       { icon: "📋", color: "var(--clubpm-accent-yellow)",   label: "Standup"    },
};

const FILTER_OPTIONS = [
  { value: "",                 label: "All activity"  },
  { value: "TASK_CREATED",     label: "Created"       },
  { value: "TASK_UPDATED",     label: "Updated"       },
  { value: "TASK_COMPLETED",   label: "Completed"     },
  { value: "TASK_ASSIGNED",    label: "Assigned"      },
  { value: "STANDUP_POSTED",   label: "Standups"      },
  { value: "PROJECT_UPDATED",  label: "Project edits" },
];

// ── Human-readable descriptions ──────────────────────────────

function describeEvent(log) {
  const actor = log.member?.displayName ?? "Someone";
  const p     = log.payload ?? {};

  switch (log.eventType) {
    case "TASK_CREATED":
      return (
        <>
          <strong>{actor}</strong> created task <em>{p.taskTitle}</em>
          {p.assigneeNames?.length ? ` and assigned to ${p.assigneeNames.join(", ")}` : ""}
        </>
      );

    case "TASK_UPDATED": {
      const changes = (p.changes ?? []).map(c => {
        if (c.field === "status") return `status ${c.from} → ${c.to}`;
        if (c.field === "priority") return `priority ${c.from} → ${c.to}`;
        if (c.field === "dueDate") {
          const fmt = d => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "none";
          return `due date ${fmt(c.from)} → ${fmt(c.to)}`;
        }
        return `${c.field} changed`;
      });
      return (
        <>
          <strong>{actor}</strong> updated <em>{p.taskTitle}</em>
          {changes.length ? `: ${changes.join(", ")}` : ""}
        </>
      );
    }

    case "TASK_COMPLETED":
      return <><strong>{actor}</strong> completed <em>{p.taskTitle}</em></>;

    case "TASK_DELETED":
      return <><strong>{actor}</strong> deleted task <em>{p.taskTitle}</em></>;

    case "TASK_ASSIGNED":
      return (
        <>
          <strong>{actor}</strong> assigned <em>{p.taskTitle}</em>
          {p.assigneeNames?.length ? ` to ${p.assigneeNames.join(", ")}` : ""}
        </>
      );

    case "TASK_REASSIGNED":
      return (
        <>
          <strong>{actor}</strong> reassigned <em>{p.taskTitle}</em> to <strong>{p.toName}</strong>
        </>
      );

    case "TASK_SNOOZED":
      return <><strong>{actor}</strong> snoozed <em>{p.taskTitle}</em> to {p.newDueDate}</>;

    case "TASK_NOTE_ADDED":
      return (
        <>
          <strong>{actor}</strong> added a note on <em>{p.taskTitle}</em>
          {p.preview ? `: "${p.preview}"` : ""}
        </>
      );

    case "TASK_SUBTASK_CREATED":
      return (
        <>
          <strong>{actor}</strong> added subtask <em>{p.subtaskTitle}</em> under <em>{p.parentTitle}</em>
        </>
      );

    case "PROJECT_CREATED":
      return <><strong>{actor}</strong> created this project</>;

    case "PROJECT_UPDATED": {
      const changes = (p.changes ?? []).map(c => `${c.field}: ${c.from} → ${c.to}`);
      return (
        <>
          <strong>{actor}</strong> updated project settings
          {changes.length ? `: ${changes.join(", ")}` : ""}
        </>
      );
    }

    case "PROJECT_MEMBER_ADDED":
      return <><strong>{actor}</strong> added <strong>{p.memberName}</strong> as {p.role}</>;

    case "STANDUP_POSTED":
      return <><strong>{actor}</strong> posted a standup{p.preview ? `: ${p.preview}` : ""}</>;

    default:
      return <><strong>{actor}</strong> made a change</>;
  }
}

// ── Timestamp ────────────────────────────────────────────────

function RelativeTime({ iso }) {
  const abs = new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });

  const rel = (() => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1)  return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `${days}d ago`;
    return abs;
  })();

  return (
    <time dateTime={iso} title={abs}
      style={{ fontSize: 11, color: "var(--clubpm-text-muted)", whiteSpace: "nowrap" }}>
      {rel}
    </time>
  );
}

// ── Source Badge ─────────────────────────────────────────────

function SourceBadge({ source }) {
  return (
    <span title={source === "SLACK" ? "Via Slack" : "Via Dashboard"}
      style={{
        fontSize: 9, padding: "1px 5px", borderRadius: 3,
        background: source === "SLACK" ? "rgba(74,21,75,0.3)" : "rgba(0,122,255,0.15)",
        color: source === "SLACK" ? "#b388ff" : "var(--clubpm-accent-primary)",
        fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase",
        flexShrink: 0,
      }}>
      {source === "SLACK" ? "Slack" : "Web"}
    </span>
  );
}

// ── Activity Row ─────────────────────────────────────────────

function ActivityRow({ log }) {
  const meta = EVENT_META[log.eventType] ?? EVENT_META.TASK_UPDATED;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 0", borderBottom: "1px solid var(--clubpm-border)",
    }}>
      <div style={{ flexShrink: 0, width: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {log.member
          ? <MemberBadge member={log.member} size="sm" />
          : <span style={{ fontSize: 16 }}>{meta.icon}</span>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--clubpm-text-secondary)", lineHeight: 1.5 }}>
          {log.member && (
            <span style={{ fontSize: 14, marginRight: 4 }}>{meta.icon}</span>
          )}
          {describeEvent(log)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
          <RelativeTime iso={log.createdAt} />
          <SourceBadge source={log.source} />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function ProjectActivity({ projectId }) {
  const [logs,        setLogs]        = useState([]);
  const [nextCursor,  setNextCursor]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter,      setFilter]      = useState("");
  const loaderRef = useRef(null);

  const fetchLogs = useCallback(async (cursor = null, append = false) => {
    if (!projectId) return;
    const qs = new URLSearchParams({ limit: "50" });
    if (cursor) qs.set("cursor", cursor);
    if (filter) qs.set("eventType", filter);

    try {
      const data = await get(`/api/projects/${projectId}/activity?${qs}`);
      setLogs(prev => append ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [projectId, filter]);

  useEffect(() => {
    setLoading(true);
    setLogs([]);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!loaderRef.current || !nextCursor) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadingMore) {
        setLoadingMore(true);
        fetchLogs(nextCursor, true);
      }
    }, { threshold: 0.1 });
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [nextCursor, loadingMore, fetchLogs]);

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {FILTER_OPTIONS.map(opt => (
          <button key={opt.value}
            onClick={() => setFilter(opt.value)}
            style={{
              padding: "4px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: "1px solid var(--clubpm-border)",
              background: filter === opt.value ? "var(--clubpm-accent-primary)" : "var(--clubpm-surface-300)",
              color: filter === opt.value ? "#fff" : "var(--clubpm-text-secondary)",
              fontWeight: filter === opt.value ? 600 : 400,
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "32px 0", textAlign: "center" }}>
          <div style={{
            width: 24, height: 24, margin: "0 auto",
            borderRadius: "50%", border: "2px solid var(--clubpm-accent-primary)",
            borderTopColor: "transparent", animation: "clubpm-spin 0.8s linear infinite",
          }} />
        </div>
      ) : logs.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--clubpm-text-muted)", padding: "24px 0" }}>
          No activity yet{filter ? " for this filter" : ""}.
        </p>
      ) : (
        <>
          {logs.map(log => <ActivityRow key={log.id} log={log} />)}
          <div ref={loaderRef} style={{ height: 1 }} />
          {loadingMore && (
            <div style={{ padding: "12px 0", textAlign: "center", fontSize: 12, color: "var(--clubpm-text-muted)" }}>
              Loading more…
            </div>
          )}
          {!nextCursor && logs.length > 0 && (
            <p style={{ textAlign: "center", fontSize: 11, color: "var(--clubpm-text-muted)", padding: "16px 0 0" }}>
              — All activity loaded —
            </p>
          )}
        </>
      )}
    </div>
  );
}
