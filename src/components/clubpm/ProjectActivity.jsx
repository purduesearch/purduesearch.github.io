import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { startOfDay, isToday, isYesterday, differenceInCalendarDays, format } from "date-fns";
import { get } from "../../api/clubPmClient";
import MemberBadge from "./MemberBadge";

// ── Event type metadata ──────────────────────────────────────
// `tone` is a token name only; Phase A2 maps tones to colors in clubpm-theme.css.

const EVENT_META = {
  TASK_CREATED:         { icon: "fas fa-plus",            tone: "create",    label: "Created"    },
  TASK_UPDATED:         { icon: "fas fa-pen",             tone: "update",    label: "Updated"    },
  TASK_COMPLETED:       { icon: "fas fa-check",           tone: "done",      label: "Completed"  },
  TASK_DELETED:         { icon: "fas fa-trash",           tone: "danger",    label: "Deleted"    },
  TASK_ASSIGNED:        { icon: "fas fa-user",            tone: "create",    label: "Assigned"   },
  TASK_REASSIGNED:      { icon: "fas fa-rotate",          tone: "warn",      label: "Reassigned" },
  TASK_SNOOZED:         { icon: "fas fa-clock-rotate-left", tone: "muted",   label: "Snoozed"    },
  TASK_NOTE_ADDED:      { icon: "fas fa-note-sticky",     tone: "create",    label: "Note"       },
  TASK_SUBTASK_CREATED: { icon: "fas fa-diagram-project", tone: "create",    label: "Subtask"    },
  PROJECT_CREATED:      { icon: "fas fa-rocket",          tone: "done",      label: "Project"    },
  PROJECT_UPDATED:      { icon: "fas fa-gear",            tone: "update",    label: "Project"    },
  PROJECT_MEMBER_ADDED: { icon: "fas fa-user-plus",       tone: "create",    label: "Member"     },
  STANDUP_POSTED:       { icon: "fas fa-clipboard-list",  tone: "warn",      label: "Standup"    },
  GITHUB_REPO_LINKED:       { icon: "fas fa-code-branch",     tone: "github",  label: "GitHub"    },
  GITHUB_ISSUE_LINKED:      { icon: "fas fa-circle-dot",      tone: "github",  label: "Issue"     },
  GITHUB_ISSUE_IMPORTED:    { icon: "fas fa-file-import",     tone: "github",  label: "Import"    },
  GITHUB_ISSUE_SYNCED:      { icon: "fas fa-rotate",          tone: "github",  label: "Sync"      },
  GITHUB_BRANCH_CREATED:    { icon: "fas fa-code-branch",     tone: "github",  label: "Branch"    },
  GITHUB_PR_LINKED:         { icon: "fas fa-code-pull-request", tone: "github", label: "PR"       },
  GITHUB_PR_OPENED:         { icon: "fas fa-code-pull-request", tone: "done",  label: "PR open"   },
  GITHUB_PR_MERGED:         { icon: "fas fa-code-merge",      tone: "ai",      label: "PR merged" },
  GITHUB_PR_CLOSED:         { icon: "fas fa-circle-xmark",    tone: "danger",  label: "PR closed" },
  GITHUB_PR_REVIEW:         { icon: "fas fa-eye",             tone: "warn",    label: "Review"    },
  GITHUB_CI_PASSED:         { icon: "fas fa-circle-check",    tone: "done",    label: "CI"        },
  GITHUB_CI_FAILED:         { icon: "fas fa-circle-exclamation", tone: "danger", label: "CI fail" },
  GITHUB_PUSH:              { icon: "fas fa-arrow-up",        tone: "github",  label: "Push"      },
  GITHUB_COMMIT_REFERENCED: { icon: "fas fa-thumbtack",       tone: "github",  label: "Commit"    },
  COMMENT_ADDED:          { icon: "fas fa-comment",        tone: "comment",   label: "Comment"    },
  COMMENT_EDITED:         { icon: "fas fa-comment-dots",   tone: "update",    label: "Comment"    },
  COMMENT_DELETED:        { icon: "fas fa-comment-slash",  tone: "danger",    label: "Comment"    },
  TASK_DEPENDENCY_ADDED:   { icon: "fas fa-link",          tone: "create",    label: "Dependency" },
  TASK_DEPENDENCY_REMOVED: { icon: "fas fa-link-slash",    tone: "muted",     label: "Dependency" },
  TASK_BLOCKER_ATTACHED:   { icon: "fas fa-ban",           tone: "warn",      label: "Blocker"    },
  TASK_BLOCKER_DETACHED:   { icon: "fas fa-ban",           tone: "muted",     label: "Blocker"    },
  BLOCKER_RESOLVED:        { icon: "fas fa-circle-check",  tone: "done",      label: "Blocker"    },
  BLOCKER_ASSIGNED:        { icon: "fas fa-triangle-exclamation", tone: "warn", label: "Blocker"   },
  TIME_LOGGED:            { icon: "fas fa-stopwatch",      tone: "time",      label: "Time"       },
  MILESTONE_CREATED:       { icon: "fas fa-flag-checkered", tone: "milestone", label: "Milestone" },
  MILESTONE_UPDATED:       { icon: "fas fa-flag",           tone: "update",    label: "Milestone" },
  MILESTONE_DELETED:       { icon: "fas fa-flag",           tone: "danger",    label: "Milestone" },
  MILESTONE_TASKS_LINKED:  { icon: "fas fa-link",           tone: "milestone", label: "Milestone" },
  AI_PLAN_EXECUTED:        { icon: "fas fa-robot",          tone: "ai",        label: "AI Plan"    },
};

// ── Filter groups ────────────────────────────────────────────
// Every `types` entry is a key of EVENT_META; joined with "," for the query string.

const FILTER_GROUPS = [
  { id: "all", label: "All", icon: "fas fa-list", types: [] },
  {
    id: "tasks", label: "Tasks", icon: "fas fa-square-check",
    types: [
      "TASK_CREATED", "TASK_UPDATED", "TASK_ASSIGNED", "TASK_REASSIGNED",
      "TASK_SNOOZED", "TASK_NOTE_ADDED", "TASK_SUBTASK_CREATED", "TASK_DELETED",
    ],
  },
  { id: "completed", label: "Completed", icon: "fas fa-check", types: ["TASK_COMPLETED"] },
  {
    id: "comments", label: "Comments", icon: "fas fa-comment",
    types: ["COMMENT_ADDED", "COMMENT_EDITED", "COMMENT_DELETED"],
  },
  {
    id: "blockers", label: "Blockers & deps", icon: "fas fa-ban",
    types: [
      "TASK_DEPENDENCY_ADDED", "TASK_DEPENDENCY_REMOVED", "TASK_BLOCKER_ATTACHED",
      "TASK_BLOCKER_DETACHED", "BLOCKER_RESOLVED", "BLOCKER_ASSIGNED",
    ],
  },
  {
    id: "milestones", label: "Milestones", icon: "fas fa-flag-checkered",
    types: ["MILESTONE_CREATED", "MILESTONE_UPDATED", "MILESTONE_DELETED", "MILESTONE_TASKS_LINKED"],
  },
  {
    id: "github", label: "GitHub", icon: "fab fa-github",
    types: [
      "GITHUB_REPO_LINKED", "GITHUB_ISSUE_LINKED", "GITHUB_ISSUE_IMPORTED", "GITHUB_ISSUE_SYNCED",
      "GITHUB_BRANCH_CREATED", "GITHUB_PR_LINKED", "GITHUB_PR_OPENED", "GITHUB_PR_MERGED",
      "GITHUB_PR_CLOSED", "GITHUB_PR_REVIEW", "GITHUB_CI_PASSED", "GITHUB_CI_FAILED",
      "GITHUB_PUSH", "GITHUB_COMMIT_REFERENCED",
    ],
  },
  { id: "standups", label: "Standups", icon: "fas fa-clipboard-list", types: ["STANDUP_POSTED"] },
  {
    id: "project", label: "Project", icon: "fas fa-gear",
    types: ["PROJECT_CREATED", "PROJECT_UPDATED", "PROJECT_MEMBER_ADDED", "TIME_LOGGED"],
  },
  { id: "ai", label: "AI", icon: "fas fa-robot", types: ["AI_PLAN_EXECUTED"] },
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
          <strong>{actor}</strong> added subtask <em>{p.subtaskTitle}</em> under <em>{p.parentTaskTitle ?? p.parentTitle}</em>
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

    case "GITHUB_REPO_LINKED":
      return <><strong>{actor}</strong> linked GitHub repo <em>{p.repo ?? ""}</em></>;
    case "GITHUB_ISSUE_LINKED":
      return p.created
        ? <><strong>{actor}</strong> created GitHub issue <em>#{p.issueNumber}</em> from this task</>
        : <><strong>{actor}</strong> linked GitHub issue <em>#{p.issueNumber}</em></>;
    case "GITHUB_ISSUE_IMPORTED":
      return <><strong>{actor}</strong> imported {p.count} GitHub issue{p.count === 1 ? "" : "s"} as tasks{p.skipped ? ` (${p.skipped} skipped)` : ""}</>;
    case "GITHUB_ISSUE_SYNCED":
      return <>GitHub issue <em>#{p.issueNumber}</em> {p.action}: <em>{p.title}</em></>;
    case "GITHUB_BRANCH_CREATED":
      return <><strong>{actor}</strong> created branch <code>{p.branchName}</code></>;
    case "GITHUB_PR_LINKED":
      return <><strong>{actor}</strong> linked PR <em>#{p.prNumber}</em></>;
    case "GITHUB_PR_OPENED":
      return <>PR <em>#{p.prNumber}</em> opened: <em>{p.title}</em></>;
    case "GITHUB_PR_MERGED":
      return <>PR <em>#{p.prNumber}</em> merged: <em>{p.title}</em></>;
    case "GITHUB_PR_CLOSED":
      return <>PR <em>#{p.prNumber}</em> closed without merge</>;
    case "GITHUB_PR_REVIEW":
      return <>Review on PR <em>#{p.prNumber}</em>: {String(p.state ?? "").toLowerCase().replace("_", " ")}{p.reviewer ? ` by @${p.reviewer}` : ""}</>;
    case "GITHUB_CI_PASSED":
      return <>CI checks passed{p.sha ? ` for ${String(p.sha).slice(0, 7)}` : ""}</>;
    case "GITHUB_CI_FAILED":
      return <>CI checks failed{p.sha ? ` for ${String(p.sha).slice(0, 7)}` : ""}</>;
    case "GITHUB_PUSH":
      return <>{p.pusher ?? "Someone"} pushed {p.commits ?? 1} commit{p.commits === 1 ? "" : "s"} to <code>{String(p.ref ?? "").replace("refs/heads/", "")}</code></>;
    case "GITHUB_COMMIT_REFERENCED":
      return <>Commit <code>{String(p.sha ?? "").slice(0, 7)}</code> referenced this task{p.message ? `: ${p.message}` : ""}</>;

    case "COMMENT_ADDED":
      return <><strong>{actor}</strong> commented{p.excerpt ? `: "${p.excerpt}"` : ""}</>;
    case "COMMENT_EDITED":
      return <><strong>{actor}</strong> edited a comment{p.excerpt ? `: "${p.excerpt}"` : ""}</>;
    case "COMMENT_DELETED":
      return <><strong>{actor}</strong> deleted a comment</>;

    case "TASK_DEPENDENCY_ADDED":
      return <><strong>{actor}</strong> made <em>{p.taskTitle}</em> depend on <em>{p.dependsOnTitle ?? "another task"}</em>{p.reason ? ` — ${p.reason}` : ""}</>;
    case "TASK_DEPENDENCY_REMOVED":
      return <><strong>{actor}</strong> removed <em>{p.taskTitle}</em>'s dependency on <em>{p.dependsOnTitle ?? "another task"}</em></>;

    case "TASK_BLOCKER_ATTACHED":
      return <><strong>{actor}</strong> flagged <em>{p.taskTitle}</em> as blocked by <em>{p.blockerLabel}</em>{p.reason ? ` — ${p.reason}` : ""}</>;
    case "TASK_BLOCKER_DETACHED":
      return <><strong>{actor}</strong> cleared blocker <em>{p.blockerLabel}</em> from <em>{p.taskTitle}</em></>;
    case "BLOCKER_RESOLVED":
      return <><strong>{actor}</strong> resolved blocker <em>{p.blockerLabel}</em>{p.affectedTaskCount ? ` (${p.affectedTaskCount} task${p.affectedTaskCount === 1 ? "" : "s"} unblocked)` : ""}</>;
    case "BLOCKER_ASSIGNED":
      return <><strong>{actor}</strong> assigned blocker <em>{p.label}</em></>;

    case "TIME_LOGGED":
      return <><strong>{actor}</strong> logged {p.minutes} min{p.note ? `: ${p.note}` : ""}</>;

    case "MILESTONE_CREATED":
      return <><strong>{actor}</strong> created milestone <em>{p.milestoneTitle}</em></>;
    case "MILESTONE_UPDATED": {
      const mChanges = (p.changes ?? []).map(c => `${c.field}: ${c.from} → ${c.to}`);
      return <><strong>{actor}</strong> updated milestone <em>{p.milestoneTitle}</em>{mChanges.length ? `: ${mChanges.join(", ")}` : ""}</>;
    }
    case "MILESTONE_DELETED":
      return <><strong>{actor}</strong> deleted milestone <em>{p.milestoneTitle}</em></>;
    case "MILESTONE_TASKS_LINKED": {
      const linkedCount = p.taskIds?.length ?? 0;
      return <><strong>{actor}</strong> linked {linkedCount} task{linkedCount === 1 ? "" : "s"} to milestone <em>{p.milestoneTitle}</em></>;
    }

    case "AI_PLAN_EXECUTED":
      return <><strong>{actor}</strong> ran an AI action plan ({p.succeeded ?? 0}/{p.totalActions ?? 0} applied)</>;

    default:
      return <><strong>{actor}</strong> made a change</>;
  }
}

// ── Plain-text flattening (for client-side search) ───────────

function flattenNode(node) {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenNode).join("");
  if (node.props) return flattenNode(node.props.children);
  return "";
}

// ── Day grouping ─────────────────────────────────────────────

function dayLabel(date) {
  if (isToday(date))     return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (differenceInCalendarDays(new Date(), date) < 7) return format(date, "EEEE");
  return format(date, "MMM d, yyyy");
}

function groupByDay(logs) {
  const groups = [];
  let current  = null;

  for (const log of logs) {
    const day = startOfDay(new Date(log.createdAt)).getTime();
    if (!current || current.day !== day) {
      current = { day, label: dayLabel(new Date(day)), logs: [] };
      groups.push(current);
    }
    current.logs.push(log);
  }
  return groups;
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

  return <time className="pm-activity-time" dateTime={iso} title={abs}>{rel}</time>;
}

// ── Source Badge ─────────────────────────────────────────────

function SourceBadge({ source }) {
  const slack = source === "SLACK";
  return (
    <span
      className={`pm-activity-source ${slack ? "is-slack" : "is-web"}`}
      title={slack ? "Via Slack" : "Via Dashboard"}
    >
      {slack ? "Slack" : "Web"}
    </span>
  );
}

// ── Activity Row ─────────────────────────────────────────────

function ActivityRow({ log, isLast, onOpenTask }) {
  const meta      = EVENT_META[log.eventType] ?? EVENT_META.TASK_UPDATED;
  const clickable = Boolean(log.taskId && onOpenTask);

  const open = () => { if (clickable) onOpenTask(log.taskId); };

  const handleKeyDown = e => {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  const className = [
    "pm-activity-row",
    clickable ? "pm-activity-row--clickable" : "",
    isLast ? "is-last" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={className}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? open : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
    >
      {/* Avatar leads the row and carries the timeline connector. MemberBadge is
          safe here now that .clubpm-member-badge-tip styles its tooltip: the
          cell no longer has to clip, so equipped cosmetic border frames survive. */}
      <div className="pm-activity-avatar">
        {log.member
          ? <MemberBadge member={log.member} size="sm" />
          : <span className="pm-activity-avatar-system" title="System" aria-label="System">
              <i className="fas fa-gear" aria-hidden="true" />
            </span>}
      </div>

      <div className="pm-activity-body">
        <div className="pm-activity-text">{describeEvent(log)}</div>
        <div className="pm-activity-meta">
          <RelativeTime iso={log.createdAt} />
          <SourceBadge source={log.source} />
        </div>
      </div>

      {/* Change indicator, trailing — keeps the full row width for the text. */}
      <div className="pm-activity-rail">
        <span className={`pm-activity-icon is-${meta.tone}`} title={meta.label}>
          <i className={meta.icon} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function ProjectActivity({ projectId, members = [], onOpenTask }) {
  const [logs,        setLogs]        = useState([]);
  const [nextCursor,  setNextCursor]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeGroup, setActiveGroup] = useState("all");
  const [memberId,    setMemberId]    = useState("");
  const [search,      setSearch]      = useState("");
  const [debounced,   setDebounced]   = useState("");
  const loaderRef = useRef(null);

  // Search filters the already-loaded rows only — the payload is JSON and the feed is
  // cursor-paginated, so a server-side search would need its own endpoint and index.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchLogs = useCallback(async (cursor = null, append = false) => {
    if (!projectId) return;
    const group = FILTER_GROUPS.find(g => g.id === activeGroup) ?? FILTER_GROUPS[0];
    const qs = new URLSearchParams({ limit: "50" });
    if (cursor)             qs.set("cursor", cursor);
    if (group.types.length) qs.set("eventType", group.types.join(","));
    if (memberId)           qs.set("memberId", memberId);

    try {
      const data = await get(`/api/projects/${projectId}/activity?${qs}`);
      setLogs(prev => append ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [projectId, activeGroup, memberId]);

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

  const visibleLogs = useMemo(() => {
    if (!debounced) return logs;
    return logs.filter(log => flattenNode(describeEvent(log)).toLowerCase().includes(debounced));
  }, [logs, debounced]);

  const dayGroups     = useMemo(() => groupByDay(visibleLogs), [visibleLogs]);
  const filtersActive = activeGroup !== "all" || Boolean(memberId) || Boolean(search);

  const clearFilters = () => {
    setActiveGroup("all");
    setMemberId("");
    setSearch("");
  };

  const actors = members.map(pm => pm.member).filter(Boolean);

  return (
    <div className="pm-activity">
      <div className="pm-activity-filters">
        <div className="pm-activity-chips">
          {FILTER_GROUPS.map(group => (
            <button
              key={group.id}
              type="button"
              className={`pm-activity-chip${activeGroup === group.id ? " is-active" : ""}`}
              onClick={() => setActiveGroup(group.id)}
            >
              <i className={group.icon} aria-hidden="true" />
              {group.label}
            </button>
          ))}
        </div>

        {actors.length > 0 && (
          <div className="pm-activity-actors">
            {actors.map(member => (
              <button
                key={member.id}
                type="button"
                title={member.displayName}
                aria-label={`Filter by ${member.displayName}`}
                className={`pm-activity-actor${memberId === member.id ? " is-active" : ""}`}
                onClick={() => setMemberId(prev => (prev === member.id ? "" : member.id))}
              >
                <MemberBadge member={member} size="sm" />
              </button>
            ))}
          </div>
        )}

        <input
          type="search"
          className="pm-activity-search"
          placeholder="Search loaded activity…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <>
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="pm-activity-skeleton" />)}
        </>
      ) : visibleLogs.length === 0 ? (
        <div className="pm-activity-empty">
          <i className="fas fa-wave-square" aria-hidden="true" />
          <p>{filtersActive ? "No activity matches these filters" : "No activity yet"}</p>
          {debounced && <p>No match in the loaded activity — scroll to load more.</p>}
          {filtersActive && (
            <button type="button" className="clubpm-btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {dayGroups.map(group => (
            <section key={group.day}>
              <h4 className="pm-activity-day">{group.label}</h4>
              <div className="pm-activity-group">
                {group.logs.map((log, i) => (
                  <ActivityRow
                    key={log.id}
                    log={log}
                    isLast={i === group.logs.length - 1}
                    onOpenTask={onOpenTask}
                  />
                ))}
              </div>
            </section>
          ))}
          <div ref={loaderRef} className="pm-activity-sentinel" />
          {loadingMore && <div className="pm-activity-more">Loading more…</div>}
          {!nextCursor && <p className="pm-activity-end">All activity loaded</p>}
        </>
      )}
    </div>
  );
}
