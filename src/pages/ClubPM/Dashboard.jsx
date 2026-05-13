import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { get, post, patch } from "../../api/clubPmClient";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import { ProgressIndicator, PriorityBars, AvatarStack } from "../../components/clubpm/TaskPrimitives";

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

const DEFAULT_FILTERS = { projects: [], assignees: [], priorities: [], statuses: [], dateCreated: [] };

function applyFilters(tasks, f) {
  let r = tasks;
  if (f.projects.length)    r = r.filter(t => f.projects.includes(t.projectId));
  if (f.assignees.length)   r = r.filter(t => (t.assignees || []).some(a => f.assignees.includes(a.id)));
  if (f.priorities.length)  r = r.filter(t => f.priorities.includes(t.priority));
  if (f.statuses.length)    r = r.filter(t => f.statuses.includes(t.progress ?? "NO_PROGRESS"));
  if (f.dateCreated.length) r = r.filter(t => t.createdAt && f.dateCreated.some(range => isInDateCreatedRange(t.createdAt, range)));
  return r;
}

function activeFilterCount(f) {
  return Object.values(f).reduce((n, arr) => n + arr.length, 0);
}

// ── Task Row ──────────────────────────────────────────────────

function TaskRow({ task, onProgressChange, compact, showProject }) {
  const progress = task.progress ?? "NO_PROGRESS";
  const overdue = task.dueDate && isOverdue(task.dueDate, progress);

  return (
    <div className={`cpm-task-row${compact ? " cpm-task-row--compact" : ""}`}>
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

function FilterBar({ tasks, filters, setFilter, onClearAll }) {
  const projectOptions = useMemo(() =>
    [...new Map(tasks.map(t => [t.projectId, { value: t.projectId, label: t.project?.name ?? t.projectId }])).values()],
    [tasks]
  );

  const assigneeOptions = useMemo(() => {
    const map = new Map();
    tasks.forEach(t => (t.assignees || []).forEach(a => map.set(a.id, { value: a.id, label: a.displayName })));
    return [...map.values()];
  }, [tasks]);

  const active = activeFilterCount(filters);

  return (
    <div className="cpm-filter-bar">
      <FilterDropdown label="Project"  options={projectOptions}       selected={filters.projects}    onChange={v => setFilter("projects", v)} />
      <FilterDropdown label="Assigned" options={assigneeOptions}      selected={filters.assignees}   onChange={v => setFilter("assignees", v)} />
      <FilterDropdown label="Priority" options={PRIORITY_OPTIONS}     selected={filters.priorities}  onChange={v => setFilter("priorities", v)} />
      <FilterDropdown label="Status"   options={STATUS_OPTIONS}       selected={filters.statuses}    onChange={v => setFilter("statuses", v)} />
      <FilterDropdown label="Created"  options={DATE_CREATED_OPTIONS} selected={filters.dateCreated} onChange={v => setFilter("dateCreated", v)} />
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
  const [showAddTask, setShowAddTask] = useState(false);
  const [showRecap, setShowRecap]     = useState(false);
  const [filters, setFilters]         = useState(DEFAULT_FILTERS);

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
  const clearAll  = ()         => setFilters(DEFAULT_FILTERS);

  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

  return (
    <>
      <section className="cpm-work-panel">
        <div className="cpm-panel-header">
          <div className="cpm-panel-header-top">
            <div className="cpm-panel-header-left">
              <h2 className="cpm-panel-title">Work</h2>
              <button className="cpm-panel-recap-btn" onClick={() => setShowRecap(true)}>
                <i className="fas fa-history" /> Full Recap
              </button>
            </div>
            <div className="cpm-panel-header-right">
              <button className="cpm-panel-icon-btn" title="Add task" onClick={() => setShowAddTask(true)}>
                <i className="fas fa-plus" />
              </button>
            </div>
          </div>
          <FilterBar tasks={tasks} filters={filters} setFilter={setFilter} onClearAll={clearAll} />
        </div>

        <div className="cpm-work-list">
          {filtered.length === 0 ? (
            <p className="cpm-empty-msg">
              {tasks.length === 0 ? "No tasks assigned to you" : "No tasks match your filters"}
            </p>
          ) : (
            filtered.map(task => (
              <TaskRow key={task.id} task={task} onProgressChange={onProgressChange} showProject />
            ))
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
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className="cpm-sidebar">
      <div className="cpm-sidebar-header">
        <button className="cpm-collapse-btn" onClick={() => setCollapsed(c => !c)} aria-label="Toggle projects">
          <i className={`fas fa-chevron-${collapsed ? "right" : "down"} cpm-chevron`} />
        </button>
        <span className="cpm-sidebar-title">Projects</span>
        <button className="cpm-add-project-btn" onClick={onAddProject} title="New Project">
          <i className="fas fa-plus" />
        </button>
      </div>
      {!collapsed && (
        <div className="cpm-project-list">
          {projects.length === 0
            ? <p className="cpm-sidebar-empty">No projects yet</p>
            : projects.map(p => <ProjectListItem key={p.id} project={p} />)
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
  const [showCreateProject, setShowCreateProject] = useState(false);

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
      <div className="cpm-dashboard-layout">
        <ProjectsSidebar projects={projects} onAddProject={() => setShowCreateProject(true)} />
        <WorkPanel
          tasks={myTasks}
          onProgressChange={handleProgressChange}
          projects={projects}
          onTaskCreated={fetchTasks}
        />
        <AgendaPanel tasks={myTasks} onProgressChange={handleProgressChange} />
      </div>

      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreate={project => setProjects(prev => [project, ...prev])}
        />
      )}
    </div>
  );
}
