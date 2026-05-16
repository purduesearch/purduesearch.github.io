import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { get, post, patch } from "../../api/clubPmClient";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import { ProgressIndicator, PriorityBars, AvatarStack } from "../../components/clubpm/TaskPrimitives";
import ProjectCard from "../../components/clubpm/ProjectCard";

// ── useCountUp hook ───────────────────────────────────────────

function useCountUp(target, duration = 800) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start = null;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      setCount(Math.round(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return count;
}

// ── StatsBar component ────────────────────────────────────────

function StatTile({ value, label }) {
  const display = useCountUp(value);
  return (
    <div className="pm-stat-tile">
      <div className="pm-stat-number">{display}</div>
      <div className="pm-stat-label">{label}</div>
    </div>
  );
}

function StatsBar({ projects, myTasks }) {
  const totalProjects = projects.length;

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const tasksDueThisWeek = myTasks.filter(t =>
    t.dueDate &&
    t.progress !== 'COMPLETED' &&
    new Date(t.dueDate).getTime() >= now &&
    new Date(t.dueDate).getTime() <= now + weekMs
  ).length;

  const completionRate = projects.length > 0
    ? Math.round(
        projects.reduce((sum, p) => {
          const total = p.totalTasks ?? p.tasks?.length ?? 0;
          const done  = p.doneTasks  ?? p.tasks?.filter(t => t.progress === 'COMPLETED' || t.status === 'DONE').length ?? 0;
          const pct   = p.completionPercent ?? (total > 0 ? Math.round((done / total) * 100) : 0);
          return sum + pct;
        }, 0) / projects.length
      )
    : 0;

  const membersActive = new Set(
    myTasks.flatMap(t => (t.assignees ?? []).map(a => a.id))
  ).size;

  return (
    <div className="pm-stats-bar">
      <StatTile value={totalProjects}    label="Total Projects" />
      <StatTile value={tasksDueThisWeek} label="Tasks Due This Week" />
      <StatTile value={completionRate}   label="Completion Rate %" />
      <StatTile value={membersActive}    label="Members Active" />
    </div>
  );
}

// ── AIInsightCards ────────────────────────────────────────────

function AIInsightCards({ projects, tasks }) {
  // 1. Most blocked project — project whose tasks have the most BLOCKED status
  const mostBlocked = useMemo(() => {
    if (!projects.length) return null;
    let best = null;
    let max  = -1;
    projects.forEach(p => {
      const blocked = (p.tasks ?? []).filter(t =>
        (t.status ?? t.progress ?? '').toUpperCase() === 'BLOCKED'
      ).length;
      if (blocked > max) { max = blocked; best = { project: p, count: blocked }; }
    });
    return best;
  }, [projects]);

  // 2. Upcoming deadline — soonest non-DONE task due within 7 days
  const upcomingDeadline = useMemo(() => {
    const now    = Date.now();
    const sevenD = 7 * 24 * 60 * 60 * 1000;
    const candidates = tasks.filter(t => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate).getTime();
      const isDone = (t.progress ?? t.status ?? '').toUpperCase() === 'COMPLETED' ||
                     (t.progress ?? t.status ?? '').toUpperCase() === 'DONE';
      return !isDone && due >= now && due <= now + sevenD;
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    return candidates[0];
  }, [tasks]);

  // 3. Velocity trend — tasks completed this week vs last week
  const velocityTrend = useMemo(() => {
    const now     = Date.now();
    const weekMs  = 7  * 24 * 60 * 60 * 1000;
    const twoWeekMs = 14 * 24 * 60 * 60 * 1000;
    const thisWeek = tasks.filter(t => {
      const done = (t.progress ?? t.status ?? '').toUpperCase() === 'COMPLETED' ||
                   (t.progress ?? t.status ?? '').toUpperCase() === 'DONE';
      if (!done || !t.updatedAt) return false;
      const ts = new Date(t.updatedAt).getTime();
      return ts >= now - weekMs && ts <= now;
    }).length;
    const lastWeek = tasks.filter(t => {
      const done = (t.progress ?? t.status ?? '').toUpperCase() === 'COMPLETED' ||
                   (t.progress ?? t.status ?? '').toUpperCase() === 'DONE';
      if (!done || !t.updatedAt) return false;
      const ts = new Date(t.updatedAt).getTime();
      return ts >= now - twoWeekMs && ts < now - weekMs;
    }).length;
    if (thisWeek > lastWeek)  return { label: '↑ Accelerating', sub: `${thisWeek} done this week`, accent: 'var(--pm-accent-teal)' };
    if (thisWeek < lastWeek)  return { label: '↓ Slowing',      sub: `${thisWeek} done this week`, accent: 'var(--pm-accent-amber)' };
    return { label: '→ Steady', sub: `${thisWeek} done this week`, accent: 'var(--pm-text-muted)' };
  }, [tasks]);

  const MONTHS_S = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtDate(str) {
    const d = new Date(str);
    return `${MONTHS_S[d.getMonth()]} ${d.getDate()}`;
  }

  return (
    <div className="pm-insight-row pm-project-grid-wrap">
      {/* Constellation line overlay connecting the three insight nodes */}
      <svg
        className="pm-constellation-overlay"
        viewBox="0 0 300 60"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* lines between card centers */}
        <line x1="50" y1="30" x2="150" y2="30" />
        <line x1="150" y1="30" x2="250" y2="30" />
        {/* star node dots */}
        <circle cx="50"  cy="30" r="2.5" fill="rgba(0,229,204,0.4)" />
        <circle cx="150" cy="30" r="2.5" fill="rgba(0,229,204,0.4)" />
        <circle cx="250" cy="30" r="2.5" fill="rgba(0,229,204,0.4)" />
        {/* outer glow rings */}
        <circle cx="50"  cy="30" r="5" fill="none" stroke="rgba(0,229,204,0.15)" strokeWidth="1" />
        <circle cx="150" cy="30" r="5" fill="none" stroke="rgba(0,229,204,0.15)" strokeWidth="1" />
        <circle cx="250" cy="30" r="5" fill="none" stroke="rgba(0,229,204,0.15)" strokeWidth="1" />
      </svg>
      {/* Card 1: Most Blocked */}
      <div className="pm-insight-card" style={{ borderLeftColor: mostBlocked?.count > 0 ? '#e17055' : 'var(--pm-border)' }}>
        <div className="pm-insight-card-label">Most Blocked</div>
        <div className="pm-insight-card-value">
          {mostBlocked
            ? (mostBlocked.count > 0 ? `${mostBlocked.count} blocked task${mostBlocked.count !== 1 ? 's' : ''}` : 'None blocked')
            : 'No projects'
          }
        </div>
        {mostBlocked?.count > 0 && (
          <div className="pm-insight-card-sub">{mostBlocked.project.name || mostBlocked.project.title}</div>
        )}
      </div>

      {/* Card 2: Upcoming Deadline */}
      <div className="pm-insight-card" style={{ borderLeftColor: upcomingDeadline ? 'var(--pm-accent-amber)' : 'var(--pm-border)' }}>
        <div className="pm-insight-card-label">Upcoming Deadline</div>
        <div className="pm-insight-card-value">
          {upcomingDeadline ? fmtDate(upcomingDeadline.dueDate) : 'Nothing due soon'}
        </div>
        {upcomingDeadline && (
          <div className="pm-insight-card-sub">{upcomingDeadline.title}</div>
        )}
      </div>

      {/* Card 3: Velocity */}
      <div className="pm-insight-card" style={{ borderLeftColor: velocityTrend.accent }}>
        <div className="pm-insight-card-label">Velocity Trend</div>
        <div className="pm-insight-card-value">{velocityTrend.label}</div>
        <div className="pm-insight-card-sub">{velocityTrend.sub}</div>
      </div>
    </div>
  );
}

// ── QuickCreateFAB ────────────────────────────────────────────

function QuickCreateFAB({ onClick }) {
  return (
    <button className="pm-fab" onClick={onClick} title="Quick create project" aria-label="Quick create project">
      +
    </button>
  );
}

// ── QuickCreateDrawer ─────────────────────────────────────────

function QuickCreateDrawer({ open, onClose, onCreate }) {
  const [name, setName]     = useState("");
  const [type, setType]     = useState("ENGINEERING");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const project = await post("/api/projects", { name: name.trim(), type });
      onCreate(project);
      setName("");
      setType("ENGINEERING");
      onClose();
    } catch (err) {
      setError(err.message ?? "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <>
      {open && <div className="pm-drawer-overlay" onClick={onClose} />}
      <div className={`pm-drawer${open ? " open" : ""}`}>
        <div className="pm-drawer-handle" />
        <div className="pm-drawer-title">Quick Create Project</div>
        <form onSubmit={handleSubmit}>
          <input
            className="pm-drawer-input"
            type="text"
            placeholder="Project name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <select
            className="pm-drawer-select"
            value={type}
            onChange={e => setType(e.target.value)}
          >
            <option value="ENGINEERING">Engineering</option>
            <option value="RESEARCH">Research</option>
            <option value="HYBRID">Hybrid</option>
          </select>
          {error && (
            <p style={{ fontSize: 12, color: 'var(--pm-accent-coral)', marginBottom: 12 }}>{error}</p>
          )}
          <button type="submit" className="pm-drawer-submit" disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create Project"}
          </button>
        </form>
      </div>
    </>,
    document.body
  );
}

// ── Shared helpers ────────────────────────────────────────────

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAY_ABBR = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const WEEKDAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function ordinal(n) {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function dayKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toDateString();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDue(dateStr) {
  const d = new Date(dateStr);
  return `Due ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function isOverdue(dateStr, progress) {
  return progress !== "COMPLETED" && new Date(dateStr) < new Date();
}

function isInDateCreatedRange(createdAt, range) {
  const created = new Date(createdAt);
  const today   = startOfDay(new Date());
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 30);
  switch (range) {
    case "today":      return created >= today;
    case "this_week":  return created >= weekAgo;
    case "this_month": return created >= monthAgo;
    case "older":      return created < monthAgo;
    default: return true;
  }
}

// ── Filter constants ──────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH",     label: "High" },
  { value: "MEDIUM",   label: "Medium" },
  { value: "LOW",      label: "Low" },
];

const STATUS_OPTIONS = [
  { value: "NO_PROGRESS", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED",   label: "Completed" },
];

const DATE_CREATED_OPTIONS = [
  { value: "today",      label: "Today" },
  { value: "this_week",  label: "Past 7 days" },
  { value: "this_month", label: "Past 30 days" },
  { value: "older",      label: "Older" },
];

const DEFAULT_FILTERS = { projects: [], assignees: [], priorities: [], statuses: [], dateCreated: [], tags: [] };

function applyFilters(tasks, f) {
  let r = tasks;
  if (f.projects.length)    r = r.filter(t => f.projects.includes(t.projectId));
  if (f.assignees.length)   r = r.filter(t => (t.assignees || []).some(a => f.assignees.includes(a.id)));
  if (f.priorities.length)  r = r.filter(t => f.priorities.includes(t.priority));
  if (f.statuses.length)    r = r.filter(t => f.statuses.includes(t.progress ?? "NO_PROGRESS"));
  if (f.dateCreated.length) r = r.filter(t => t.createdAt && f.dateCreated.some(range => isInDateCreatedRange(t.createdAt, range)));
  if (f.tags.length)        r = r.filter(t => (t.tags ?? []).some(tag => f.tags.includes(tag.id ?? tag)));
  return r;
}

function activeFilterCount(f) {
  return Object.values(f).reduce((n, arr) => n + arr.length, 0);
}

function getTagGroups(tasks) {
  const tagMap = new Map();
  const untagged = [];
  tasks.forEach(task => {
    const firstTag = (task.tags ?? [])[0];
    if (!firstTag) {
      untagged.push(task);
    } else {
      if (!tagMap.has(firstTag.id)) tagMap.set(firstTag.id, { tag: firstTag, tasks: [] });
      tagMap.get(firstTag.id).tasks.push(task);
    }
  });
  const groups = [...tagMap.values()].sort((a, b) => a.tag.name.localeCompare(b.tag.name));
  if (untagged.length) groups.push({ tag: null, tasks: untagged });
  return groups;
}

// ── Task Row ──────────────────────────────────────────────────

function TaskRow({ task, onProgressChange, compact, showProject }) {
  const progress = task.progress ?? "NO_PROGRESS";
  const overdue = task.dueDate && isOverdue(task.dueDate, progress);
  const navigate = useNavigate();

  return (
    <div
      className={`cpm-task-row${compact ? " cpm-task-row--compact" : ""}`}
      style={{ cursor: "pointer" }}
      onClick={() => task.projectId && navigate(`/clubpm/projects/${task.projectId}?task=${task.id}`)}
    >
      <ProgressIndicator progress={progress} taskId={task.id} onUpdate={onProgressChange} />
      <PriorityBars priority={task.priority} />
      <div className="cpm-task-row-info">
        <span className="cpm-task-row-name">{task.title}</span>
        {showProject && task.project?.name && (
          <span className="cpm-task-row-project">
            <span className="cpm-task-row-project-dot" />
            {task.project.name}
          </span>
        )}
      </div>
      <div className="cpm-task-row-meta">
        <AvatarStack assignees={task.assignees} />
        {task.dueDate && (
          <span className={`cpm-task-due${overdue ? " cpm-task-due--overdue" : ""}`}>
            <i className="fas fa-calendar-alt" />
            {formatDue(task.dueDate)}
          </span>
        )}
        {task.tags && task.tags.length > 0 && (
          <div style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }}>
            {task.tags.slice(0, 2).map(tag => (
              <span key={tag.id} style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 8,
                background: tag.color + "22", border: `1px solid ${tag.color}`,
                color: tag.color, whiteSpace: "nowrap",
              }}>
                {tag.name}
              </span>
            ))}
            {task.tags.length > 2 && (
              <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)", whiteSpace: "nowrap" }}>
                +{task.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filter Dropdown ───────────────────────────────────────────

function FilterDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const count = selected.length;

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        btnRef.current  && !btnRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (val) =>
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);

  return (
    <div className="cpm-filter-dd">
      <button
        ref={btnRef}
        className={`cpm-filter-dd-btn${count > 0 ? " cpm-filter-dd-btn--active" : ""}`}
        onClick={() => open ? setOpen(false) : openMenu()}
      >
        {label}
        {count > 0 && <span className="cpm-filter-dd-count">{count}</span>}
        <i className="fas fa-chevron-down cpm-filter-dd-chevron" style={open ? { transform: "rotate(180deg)" } : {}} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="cpm-filter-dd-menu"
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 6000 }}
        >
          {options.length === 0
            ? <div className="cpm-filter-dd-empty">No options</div>
            : options.map(({ value, label: optLabel }) => (
              <label key={value} className="cpm-filter-dd-option" onClick={() => toggle(value)}>
                <span className={`cpm-filter-dd-checkbox${selected.includes(value) ? " cpm-filter-dd-checkbox--checked" : ""}`}>
                  {selected.includes(value) && <i className="fas fa-check" style={{ fontSize: 7 }} />}
                </span>
                {optLabel}
              </label>
            ))
          }
          {count > 0 && (
            <div className="cpm-filter-dd-footer">
              <button className="cpm-filter-dd-clear-btn" onClick={() => { onChange([]); setOpen(false); }}>
                Clear
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Filter Bar ────────────────────────────────────────────────

function FilterBar({ tasks, filters, setFilter, onClearAll, allTags = [] }) {
  const projectOptions = useMemo(() =>
    [...new Map(tasks.map(t => [t.projectId, { value: t.projectId, label: t.project?.name ?? t.projectId }])).values()],
    [tasks]
  );

  const assigneeOptions = useMemo(() => {
    const map = new Map();
    tasks.forEach(t => (t.assignees || []).forEach(a => map.set(a.id, { value: a.id, label: a.displayName })));
    return [...map.values()];
  }, [tasks]);

  const tagOptions = useMemo(() =>
    allTags.map(t => ({ value: t.id ?? t, label: t.name ?? t })),
    [allTags]
  );

  const active = activeFilterCount(filters);

  return (
    <div className="cpm-filter-bar">
      <FilterDropdown label="Project"  options={projectOptions}       selected={filters.projects}    onChange={v => setFilter("projects", v)} />
      <FilterDropdown label="Assigned" options={assigneeOptions}      selected={filters.assignees}   onChange={v => setFilter("assignees", v)} />
      <FilterDropdown label="Priority" options={PRIORITY_OPTIONS}     selected={filters.priorities}  onChange={v => setFilter("priorities", v)} />
      <FilterDropdown label="Status"   options={STATUS_OPTIONS}       selected={filters.statuses}    onChange={v => setFilter("statuses", v)} />
      <FilterDropdown label="Created"  options={DATE_CREATED_OPTIONS} selected={filters.dateCreated} onChange={v => setFilter("dateCreated", v)} />
      {tagOptions.length > 0 && (
        <FilterDropdown label="Tags" options={tagOptions} selected={filters.tags ?? []} onChange={v => setFilter("tags", v)} />
      )}
      {active > 0 && (
        <button className="cpm-filter-clear-all" onClick={onClearAll}>
          Clear all
        </button>
      )}
    </div>
  );
}

// ── Add Task Modal ────────────────────────────────────────────

function AddTaskModal({ projects, onClose, onCreated }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [tags, setTags]           = useState([]);
  const [projectTags, setProjectTags] = useState([]);
  const [newTagName, setNewTagName]   = useState("");
  const [newTagColor, setNewTagColor] = useState("#6c5ce7");
  const [creatingTag, setCreatingTag] = useState(false);

  useEffect(() => {
    if (!projectId) { setProjectTags([]); setTags([]); return; }
    setProjectTags([]);
    setTags([]);
    get(`/api/projects/${projectId}/tags`).then(setProjectTags).catch(() => {});
  }, [projectId]);

  function addTag(tag) {
    if (!tag) return;
    setTags(prev => {
      if (prev.length >= 5 || prev.some(t => t.id === tag.id)) return prev;
      return [...prev, tag];
    });
  }
  function removeTag(tagId) {
    setTags(prev => prev.filter(t => t.id !== tagId));
  }
  async function createTag() {
    if (!newTagName.trim() || !projectId || creatingTag || tags.length >= 5) return;
    setCreatingTag(true);
    try {
      const tag = await post(`/api/projects/${projectId}/tags`, { name: newTagName.trim(), color: newTagColor });
      setProjectTags(prev => [...prev, tag]);
      addTag(tag);
      setNewTagName("");
    } catch (err) {
      console.error("Failed to create tag:", err);
    } finally { setCreatingTag(false); }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    setSaving(true);
    setError(null);
    try {
      await post(`/api/projects/${projectId}/tasks`, {
        title: title.trim(),
        priority,
        dueDate: dueDate || undefined,
        tagIds: tags.map(t => t.id),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message ?? "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="cpm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-add-task-modal">
        <div className="cpm-filter-header">
          New Task
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clubpm-text-muted)", fontSize: 18 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="cpm-filter-section" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>Project *</div>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} required
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)", color: "var(--clubpm-text-primary)", fontSize: 13 }}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>Task Name *</div>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder="What needs to be done?"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)", color: "var(--clubpm-text-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>Priority</div>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)", color: "var(--clubpm-text-primary)", fontSize: 13 }}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>Due Date</div>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)", color: "var(--clubpm-text-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>
                Tags {tags.length > 0 && (
                  <span style={{ color: "var(--clubpm-text-muted)", fontWeight: 400 }}>({tags.length}/5)</span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
                {tags.map(tag => (
                  <span key={tag.id} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 8px", borderRadius: 10, fontSize: 11,
                    background: tag.color + "22", border: `1px solid ${tag.color}`, color: tag.color,
                  }}>
                    {tag.name}
                    <button type="button" onClick={() => removeTag(tag.id)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: tag.color, fontSize: 12, padding: 0, lineHeight: 1,
                    }}>×</button>
                  </span>
                ))}
              </div>
              {tags.length < 5 && (
                <>
                  {projectTags.filter(pt => !tags.some(t => t.id === pt.id)).length > 0 && (
                    <select
                      value=""
                      onChange={e => { const t = projectTags.find(x => x.id === e.target.value); if (t) addTag(t); }}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, marginBottom: 5,
                        background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
                        color: "var(--clubpm-text-muted)", fontSize: 12 }}
                    >
                      <option value="">+ Add existing tag</option>
                      {projectTags.filter(pt => !tags.some(t => t.id === pt.id))
                        .map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                    </select>
                  )}
                  <div style={{ display: "flex", gap: 5 }}>
                    <input type="text" placeholder="New tag name" value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && createTag()}
                      style={{ flex: 1, padding: "5px 8px", borderRadius: 6, fontSize: 12,
                        background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
                        color: "var(--clubpm-text-primary)", outline: "none" }} />
                    <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
                      style={{ width: 30, padding: 1, borderRadius: 4, cursor: "pointer",
                        border: "1px solid var(--clubpm-border)", background: "transparent" }} />
                    <button type="button" onClick={createTag} disabled={!newTagName.trim() || creatingTag}
                      style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12,
                        background: "var(--clubpm-accent-primary)", border: "none", color: "#fff",
                        cursor: newTagName.trim() && !creatingTag ? "pointer" : "default",
                        opacity: newTagName.trim() && !creatingTag ? 1 : 0.5 }}>
                      {creatingTag ? "…" : "Create"}
                    </button>
                  </div>
                </>
              )}
              {tags.length >= 5 && (
                <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>Max 5 tags</span>
              )}
            </div>
            {error && <p style={{ fontSize: 12, color: "#e17055", background: "rgba(225,112,85,0.1)", borderRadius: 6, padding: "6px 10px" }}>{error}</p>}
          </div>

          <div className="cpm-filter-footer">
            <button type="button" className="cpm-filter-clear-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="cpm-filter-apply-btn" disabled={saving}>
              {saving ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Full Recap Modal ──────────────────────────────────────────

function FullRecapModal({ tasks, onClose }) {
  const [showProjectNames, setShowProjectNames] = useState(true);

  const today    = startOfDay(new Date());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);
  const endWk    = new Date(today); endWk.setDate(today.getDate() + 7);

  const todayKey    = dayKey(today);
  const tomorrowKey = dayKey(tomorrow);

  const byDay = {};
  tasks.forEach(t => {
    if (!t.dueDate) return;
    const k = dayKey(t.dueDate);
    (byDay[k] = byDay[k] || []).push(t);
  });

  const upcomingDays = [];
  const cur = new Date(dayAfter);
  while (cur < endWk) {
    const k = cur.toDateString();
    if (byDay[k]?.length) upcomingDays.push({ key: k, date: new Date(cur), tasks: byDay[k] });
    cur.setDate(cur.getDate() + 1);
  }

  const rangeStart = `${WEEKDAY_SHORT[today.getDay()]} ${ordinal(today.getDate())}`;
  const rangeEnd   = `${WEEKDAY_SHORT[endWk.getDay()]} ${ordinal(endWk.getDate())}`;

  const todayTasks    = byDay[todayKey]    ?? [];
  const tomorrowTasks = byDay[tomorrowKey] ?? [];

  function groupByProgress(taskList) {
    const inProg = taskList.filter(t => (t.progress ?? "NO_PROGRESS") === "IN_PROGRESS");
    const other  = taskList.filter(t => (t.progress ?? "NO_PROGRESS") !== "IN_PROGRESS" && (t.progress ?? "NO_PROGRESS") !== "COMPLETED");
    return { inProg, other };
  }

  function RecapTaskRow({ task }) {
    return (
      <div className="cpm-recap-task-row">
        <ProgressIndicator progress={task.progress ?? "NO_PROGRESS"} taskId={task.id} onUpdate={() => {}} />
        <PriorityBars priority={task.priority} />
        <div className="cpm-recap-task-info">
          <div className="cpm-recap-task-name">{task.title}</div>
          {showProjectNames && task.project?.name && (
            <div className="cpm-recap-task-project">
              <span className="dot" />
              {task.project.name}
            </div>
          )}
        </div>
        <div className="cpm-task-row-meta">
          <AvatarStack assignees={task.assignees} />
          {task.dueDate && (
            <span className="cpm-task-due">
              <i className="fas fa-calendar-alt" />
              {formatDue(task.dueDate)}
            </span>
          )}
        </div>
      </div>
    );
  }

  function DaySection({ taskList }) {
    const { inProg, other } = groupByProgress(taskList);
    return (
      <div className="cpm-recap-section">
        <div className="cpm-recap-section-header">
          <i className="fas fa-list-check" style={{ color: "var(--clubpm-accent-primary)" }} />
          Tasks
        </div>
        {inProg.length > 0 && (
          <>
            <div className="cpm-recap-subheading">In Progress</div>
            {inProg.map(t => <RecapTaskRow key={t.id} task={t} />)}
          </>
        )}
        {other.length > 0 && (
          <>
            <div className="cpm-recap-subheading">Due To Complete</div>
            {other.map(t => <RecapTaskRow key={t.id} task={t} />)}
          </>
        )}
        {taskList.length === 0 && <div className="cpm-recap-allclear">All clear!</div>}
      </div>
    );
  }

  return createPortal(
    <div className="cpm-recap-overlay">
      <div className="cpm-recap-topbar">
        <i className="fas fa-history" style={{ color: "var(--clubpm-text-muted)", fontSize: 16 }} />
        <span className="cpm-recap-title">Your Recap</span>
        <span className="cpm-recap-range">{rangeStart} – {rangeEnd}</span>
        <label className="cpm-recap-toggle-label">
          <input
            type="checkbox"
            className="cpm-recap-toggle"
            checked={showProjectNames}
            onChange={e => setShowProjectNames(e.target.checked)}
          />
          Show project names
        </label>
        <button className="cpm-recap-close-btn" onClick={onClose}>×</button>
      </div>

      <div className="cpm-recap-body">
        <div className="cpm-recap-day-heading">
          Today {WEEKDAY_SHORT[today.getDay()]} {ordinal(today.getDate())}
        </div>
        <DaySection taskList={todayTasks} />

        <div className="cpm-recap-day-heading">
          Tomorrow {WEEKDAY_SHORT[tomorrow.getDay()]} {ordinal(tomorrow.getDate())}
        </div>
        {tomorrowTasks.length === 0 ? (
          <div className="cpm-recap-section">
            <div className="cpm-recap-allclear"><i className="fas fa-check-circle" style={{ color: "var(--clubpm-accent-green)" }} /> All Clear</div>
          </div>
        ) : (
          <DaySection taskList={tomorrowTasks} />
        )}

        {upcomingDays.length > 0 && (() => {
          const first = upcomingDays[0].date;
          const last  = upcomingDays[upcomingDays.length - 1].date;
          return (
            <>
              <div className="cpm-recap-day-heading">
                Upcoming Things {WEEKDAY_SHORT[first.getDay()]} {ordinal(first.getDate())} – {WEEKDAY_SHORT[last.getDay()]} {ordinal(last.getDate())}
              </div>
              <div className="cpm-recap-section">
                <div className="cpm-recap-section-header">
                  <i className="fas fa-list-check" style={{ color: "var(--clubpm-accent-primary)" }} />
                  Tasks
                </div>
                {upcomingDays.map(({ key, date, tasks: dt }) => {
                  const { inProg, other } = groupByProgress(dt);
                  return (
                    <React.Fragment key={key}>
                      {inProg.length > 0 && (
                        <>
                          <div className="cpm-recap-subheading">In Progress</div>
                          {inProg.map(t => <RecapTaskRow key={t.id} task={t} />)}
                        </>
                      )}
                      {other.length > 0 && (
                        <>
                          <div className="cpm-recap-subheading">Due To Complete</div>
                          {other.map(t => <RecapTaskRow key={t.id} task={t} />)}
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>
    </div>,
    document.body
  );
}

// ── Work Panel ────────────────────────────────────────────────

function WorkPanel({ tasks, onProgressChange, projects, onTaskCreated }) {
  const { member } = useClubPmAuth();
  const [showAddTask, setShowAddTask] = useState(false);
  const [showRecap, setShowRecap]     = useState(false);
  const [sortBy, setSortBy]           = useState("default");
  const [filters, setFilters]         = useState(DEFAULT_FILTERS);

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
  const clearAll  = ()         => setFilters(DEFAULT_FILTERS);

  const allTags = useMemo(() =>
    [...new Map(projects.flatMap(p => p.tags ?? []).map(t => [t.id ?? t, t])).values()],
    [projects]
  );

  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

  const groupedTasks = useMemo(() => {
    if (sortBy !== "tags") return null;
    return getTagGroups(filtered);
  }, [sortBy, filtered]);

  return (
    <>
      <section className="cpm-work-panel">
        <div className="cpm-panel-header">
          <div className="cpm-panel-header-top">
            <div className="cpm-panel-header-left">
              <h2 className="cpm-panel-title">Work</h2>
              {member?.isAdmin && (
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10,
                  background: "rgba(249,202,36,0.15)", border: "1px solid #f9ca24",
                  color: "#f9ca24", fontWeight: 600 }}>
                  👑 Admin
                </span>
              )}
              <button className="cpm-panel-recap-btn" onClick={() => setShowRecap(true)}>
                <i className="fas fa-history" /> Full Recap
              </button>
            </div>
            <div className="cpm-panel-header-right">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6,
                  background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)",
                  color: "var(--clubpm-text-secondary)", cursor: "pointer" }}
              >
                <option value="default">Sort: Default</option>
                <option value="tags">Sort: Tags</option>
              </select>
              <button className="cpm-panel-icon-btn" title="Add task" onClick={() => setShowAddTask(true)}>
                <i className="fas fa-plus" />
              </button>
            </div>
          </div>
          <FilterBar tasks={tasks} filters={filters} setFilter={setFilter} onClearAll={clearAll} allTags={allTags} />
        </div>

        <div className="cpm-work-list">
          {sortBy === "tags" && groupedTasks ? (
            groupedTasks.length === 0 ? (
              <p className="cpm-empty-msg">No tasks assigned to you</p>
            ) : (
              groupedTasks.map(group => (
                <React.Fragment key={group.tag?.id ?? "untagged"}>
                  <div style={{
                    padding: "8px 16px 3px",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    {group.tag ? (
                      <span style={{
                        fontSize: 10, padding: "1px 8px", borderRadius: 8, fontWeight: 600,
                        background: group.tag.color + "22", border: `1px solid ${group.tag.color}`,
                        color: group.tag.color,
                      }}>
                        {group.tag.name}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)", fontWeight: 600 }}>Untagged</span>
                    )}
                    <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>{group.tasks.length}</span>
                  </div>
                  {group.tasks.map(task => (
                    <TaskRow key={task.id} task={task} onProgressChange={onProgressChange} showProject />
                  ))}
                </React.Fragment>
              ))
            )
          ) : (
            filtered.length === 0 ? (
              <p className="cpm-empty-msg">
                {tasks.length === 0 ? "No tasks assigned to you" : "No tasks match your filters"}
              </p>
            ) : (
              filtered.map(task => (
                <TaskRow key={task.id} task={task} onProgressChange={onProgressChange} showProject />
              ))
            )
          )}
        </div>
      </section>

      {showAddTask && (
        <AddTaskModal projects={projects} onClose={() => setShowAddTask(false)} onCreated={onTaskCreated} />
      )}
      {showRecap && (
        <FullRecapModal tasks={tasks} onClose={() => setShowRecap(false)} />
      )}
    </>
  );
}

// ── Agenda Panel ──────────────────────────────────────────────

function AgendaPanel({ tasks, onProgressChange }) {
  const [viewStart, setViewStart] = useState(() => startOfDay(new Date()));
  const [filters, setFilters]     = useState(DEFAULT_FILTERS);

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
  const clearAll  = ()         => setFilters(DEFAULT_FILTERS);

  const navigate = (days) => setViewStart(prev => {
    const d = new Date(prev); d.setDate(d.getDate() + days); return d;
  });

  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(viewStart); d.setDate(d.getDate() + i); return d;
  });

  const todayKey = dayKey(new Date());

  const byDay = {};
  filtered.forEach(t => {
    if (!t.dueDate) return;
    const k = dayKey(t.dueDate);
    (byDay[k] = byDay[k] || []).push(t);
  });

  const startMonth  = days[0].getMonth();
  const endMonth    = days[6].getMonth();
  const headerMonth = startMonth === endMonth
    ? MONTHS_FULL[startMonth]
    : `${MONTHS_FULL[startMonth]} – ${MONTHS_FULL[endMonth]}`;

  return (
    <aside className="cpm-agenda-panel">
      <div className="cpm-panel-header">
        <div className="cpm-panel-header-top">
          <h2 className="cpm-panel-title">Agenda</h2>
          <div className="cpm-panel-header-right">
            <button className="cpm-panel-icon-btn" title="More"><i className="fas fa-ellipsis-h" /></button>
          </div>
        </div>
        <FilterBar tasks={tasks} filters={filters} setFilter={setFilter} onClearAll={clearAll} />
      </div>

      <div className="cpm-agenda-nav">
        <button className="cpm-nav-btn" onClick={() => navigate(-7)}><i className="fas fa-angle-double-left" /> Week</button>
        <button className="cpm-nav-btn" onClick={() => navigate(-1)}><i className="fas fa-angle-left" /> Day</button>
        <span className="cpm-agenda-month-label">{headerMonth}</span>
        <button className="cpm-nav-btn" onClick={() => navigate(1)}>Day <i className="fas fa-angle-right" /></button>
        <button className="cpm-nav-btn" onClick={() => navigate(7)}>Week <i className="fas fa-angle-double-right" /></button>
      </div>

      <div className="cpm-agenda-days">
        {days.map(day => {
          const k = day.toDateString();
          const isToday = k === todayKey;
          const dayTasks = byDay[k] ?? [];
          return (
            <div key={k} className={`cpm-agenda-day-row${dayTasks.length === 0 ? " cpm-agenda-day-row--empty" : ""}`}>
              <div className="cpm-agenda-date-col">
                <span className="cpm-agenda-weekday">{WEEKDAY_ABBR[day.getDay()]}</span>
                <span className={`cpm-agenda-datenum${isToday ? " cpm-today-num" : ""}`}>{day.getDate()}</span>
              </div>
              <div className="cpm-agenda-tasks-col">
                {dayTasks.map(task => (
                  <TaskRow key={task.id} task={task} onProgressChange={onProgressChange} compact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ── Projects Sidebar ──────────────────────────────────────────

function ProjectsSidebar({ projects, onAddProject }) {
  const { member } = useClubPmAuth();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className="cpm-sidebar">
      <div className="cpm-sidebar-header">
        <button className="cpm-collapse-btn" onClick={() => setCollapsed(c => !c)} aria-label="Toggle projects">
          <i className={`fas fa-chevron-${collapsed ? "right" : "down"} cpm-chevron`} />
        </button>
        <span className="cpm-sidebar-title">Projects</span>
        {member?.isAdmin && (
          <button className="cpm-add-project-btn" onClick={onAddProject} title="New Project">
            <i className="fas fa-plus" />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="cpm-project-list">
          {projects.length === 0
            ? (
              <div className="pm-projects-empty">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.4 }}>
                  <path d="M24 4C24 4 32 12 32 24C32 31 28 38 24 44C20 38 16 31 16 24C16 12 24 4 24 4Z" stroke="var(--pm-accent-teal)" strokeWidth="1.5" fill="none"/>
                  <circle cx="24" cy="24" r="4" stroke="var(--pm-accent-teal)" strokeWidth="1.5" fill="none"/>
                  <path d="M16 32L10 38" stroke="var(--pm-accent-teal)" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M32 32L38 38" stroke="var(--pm-accent-teal)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <p style={{ fontSize: '0.8rem', color: 'var(--pm-text-muted)', marginTop: 8, textAlign: 'center' }}>
                  Your launchpad awaits
                </p>
              </div>
            )
            : projects.map(p => <ProjectCard key={p.id} project={p} />)
          }
        </div>
      )}
    </aside>
  );
}

function ProjectListItem({ project }) {
  const [hovered, setHovered] = useState(false);
  const dotClass = { ACTIVE: "cpm-dot-active", PAUSED: "cpm-dot-paused", COMPLETED: "cpm-dot-done", ARCHIVED: "cpm-dot-muted" }[project.status] ?? "cpm-dot-muted";
  return (
    <div className="cpm-project-item" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <Link to={`/clubpm/projects/${project.id}`} className="cpm-project-name">
        <span className={`cpm-status-dot ${dotClass}`} />
        <span className="cpm-project-name-text">{project.name}</span>
      </Link>
      <div className={`cpm-quick-actions${hovered ? " cpm-quick-actions--visible" : ""}`}>
        <Link to={`/clubpm/projects/${project.id}`} className="cpm-quick-btn" title="Tasks"><i className="fas fa-list-check" /></Link>
        <Link to={`/clubpm/projects/${project.id}?tab=calendar`} className="cpm-quick-btn" title="Calendar"><i className="fas fa-calendar-alt" /></Link>
        {project.driveLink
          ? <a href={project.driveLink} target="_blank" rel="noopener noreferrer" className="cpm-quick-btn cpm-quick-btn--drive" title="Files"><i className="fab fa-google-drive" /></a>
          : <span className="cpm-quick-btn cpm-quick-btn--disabled" title="No Drive link"><i className="fab fa-google-drive" /></span>
        }
      </div>
    </div>
  );
}

// ── Create Project Modal ──────────────────────────────────────

function CreateProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("ENGINEERING");
  const [driveLink, setDriveLink] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!driveLink.trim()) { setError("Google Drive link is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const project = await post("/api/projects", {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        driveLink: driveLink.trim(),
        targetDate: targetDate || undefined,
      });
      onCreate(project);
      onClose();
    } catch (err) {
      setError(err.message ?? "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="cpm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--clubpm-surface-200)", border: "1px solid var(--clubpm-border)", borderRadius: 12, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div className="cpm-filter-header">
          Create Project
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clubpm-text-muted)", fontSize: 18 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="cpm-filter-section" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "Project Name *", el: <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Lunar Rover" /> },
              { label: "Description", el: <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What is this project about?" style={{ resize: "none" }} /> },
            ].map(({ label, el }) => (
              <div key={label}>
                <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>{label}</div>
                {React.cloneElement(el, {
                  style: { width: "100%", padding: "8px 10px", borderRadius: 6, background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)", color: "var(--clubpm-text-primary)", fontSize: 13, boxSizing: "border-box", ...(el.props.style ?? {}) }
                })}
              </div>
            ))}
            <div>
              <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>Type</div>
              <select value={type} onChange={e => setType(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)", color: "var(--clubpm-text-primary)", fontSize: 13 }}>
                <option value="ENGINEERING">Engineering</option>
                <option value="RESEARCH">Research</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
            <div>
              <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>Google Drive Link *</div>
              <input type="url" value={driveLink} onChange={e => setDriveLink(e.target.value)} required placeholder="https://drive.google.com/drive/folders/..."
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)", color: "var(--clubpm-text-primary)", fontSize: 13, boxSizing: "border-box" }} />
              <p style={{ fontSize: 11, color: "var(--clubpm-text-muted)", marginTop: 3 }}>Shared Google Drive folder for project files</p>
            </div>
            <div>
              <div className="cpm-filter-section-title" style={{ marginBottom: 4 }}>Target Date</div>
              <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: "var(--clubpm-surface-300)", border: "1px solid var(--clubpm-border)", color: "var(--clubpm-text-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            {error && <p style={{ fontSize: 12, color: "#e17055", background: "rgba(225,112,85,0.1)", borderRadius: 6, padding: "6px 10px" }}>{error}</p>}
          </div>

          <div className="cpm-filter-footer">
            <button type="button" className="cpm-filter-clear-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="cpm-filter-apply-btn" disabled={saving}>
              {saving ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Dashboard ─────────────────────────────────────────────────

export default function Dashboard() {
  const { member } = useClubPmAuth();
  const [projects, setProjects] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = () =>
    member
      ? get("/api/members/me").then(m => setMyTasks(m.tasks ?? []))
      : Promise.resolve();

  useEffect(() => {
    Promise.all([
      get("/api/projects"),
      member ? get("/api/members/me").then(m => m.tasks ?? []) : Promise.resolve([]),
    ])
      .then(([projectData, taskData]) => { setProjects(projectData); setMyTasks(taskData); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [member]);

  const handleProgressChange = (taskId, newProgress) => {
    const original = myTasks.find(t => t.id === taskId)?.progress ?? "NO_PROGRESS";
    setMyTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress: newProgress } : t));
    patch(`/api/tasks/${taskId}`, { progress: newProgress }).catch(() =>
      setMyTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress: original } : t))
    );
  };

  if (loading) {
    return (
      <div className="clubpm-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--clubpm-accent-primary)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <div className="clubpm-app cpm-dashboard-root">
      <StatsBar projects={projects} myTasks={myTasks} />
      <AIInsightCards projects={projects} tasks={myTasks} />
      <div className="cpm-dashboard-layout">
        <WorkPanel
          tasks={myTasks}
          onProgressChange={handleProgressChange}
          projects={projects}
          onTaskCreated={fetchTasks}
        />
        <AgendaPanel tasks={myTasks} onProgressChange={handleProgressChange} />
      </div>
    </div>
  );
}
