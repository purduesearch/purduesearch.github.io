import React, { useState, useRef, useMemo } from "react";

// ── Event type config ────────────────────────────────────────────
const EVENT_TYPE_COLOR = {
  MEETING:  "var(--clubpm-accent-cyan,  #00cec9)",
  DEADLINE: "var(--clubpm-accent-red,   #e17055)",
  WORKSHOP: "var(--clubpm-accent-yellow,#fdcb6e)",
  SOCIAL:   "#a29bfe",
  OTHER:    "var(--clubpm-text-muted,   #636e72)",
};

const EVENT_TYPE_ICON = {
  MEETING:  "fas fa-users",
  DEADLINE: "fas fa-flag",
  WORKSHOP: "fas fa-chalkboard-teacher",
  SOCIAL:   "fas fa-star",
  OTHER:    "fas fa-calendar-day",
};

function EventChip({ event, onClick, draggable = false, onDragStart, onDragEnd, isDragging }) {
  const borderColor = EVENT_TYPE_COLOR[event.type] ?? EVENT_TYPE_COLOR.OTHER;
  const iconClass   = EVENT_TYPE_ICON[event.type]  ?? EVENT_TYPE_ICON.OTHER;
  return (
    <div
      className={`cpm-cal-event-chip${isDragging ? ' dragging' : ''}`}
      style={{ borderLeft: `3px solid ${borderColor}` }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={e => { e.stopPropagation(); if (!isDragging) onClick?.(event); }}
    >
      <i className={iconClass} style={{ fontSize: 9, marginRight: 3, color: borderColor, flexShrink: 0 }} />
      <span className="cpm-cal-chip-title">{event.title}</span>
    </div>
  );
}

const WEEKDAY_ABBR  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WEEKDAY_FULL  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS_SHORT  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL   = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const HOURS_DEFAULT = Array.from({ length: 9 }, (_, i) => i + 8); // 8‥16
const HOURS_FULL    = Array.from({ length: 24 }, (_, i) => i);

function dayKey(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatHour(h) {
  if (h === 0)  return "12:00 AM";
  if (h < 12)   return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

function getMonthGrid(cursor) {
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const start = new Date(year, month, 1);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function getWeekDays(cursor) {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatLabel(cursor, viewMode) {
  switch (viewMode) {
    case "day":
      return cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    case "week": {
      const days  = getWeekDays(cursor);
      const start = days[0], end = days[6];
      return `${WEEKDAY_ABBR[start.getDay()]} ${start.getDate()} – ${WEEKDAY_ABBR[end.getDay()]} ${end.getDate()}`;
    }
    case "month":
      return `${MONTHS_FULL[cursor.getMonth()]}, ${cursor.getFullYear()}`;
    case "agenda":
      return `${MONTHS_FULL[cursor.getMonth()]} ${cursor.getFullYear()}`;
    default:
      return "";
  }
}

function TaskChip({ task, onClick }) {
  const statusColor =
    task.status === "DONE"        ? "var(--clubpm-accent-green)"
    : task.status === "IN_PROGRESS" ? "var(--clubpm-accent-cyan)"
    : "var(--clubpm-text-muted)";
  const firstAssignee = task.assignees?.[0];
  return (
    <div className="cpm-cal-task-chip" onClick={onClick}>
      <span className="cpm-cal-chip-handle">‹</span>
      <span className="cpm-cal-chip-status" style={{ borderColor: statusColor }}>
        {task.status === "DONE" && <i className="fas fa-check" />}
      </span>
      {firstAssignee?.avatarUrl
        ? <img src={firstAssignee.avatarUrl} alt="" className="cpm-cal-chip-avatar" />
        : <span className="cpm-cal-chip-avatar-initial">{(firstAssignee?.displayName ?? "?")[0]}</span>
      }
      <span className="cpm-cal-chip-title">{task.title}</span>
    </div>
  );
}

export default function CalendarView({ tasks, events = [], onTaskClick, onEventClick, onEventMove }) {
  const [viewMode, setViewMode]     = useState("month");
  const [cursor, setCursor]         = useState(new Date());
  const [showFullDay, setShowFullDay] = useState(false);
  const [dragId, setDragId]         = useState(null);
  const [dropDay, setDropDay]       = useState(null);
  const dragIdRef = useRef(null);

  // ── Drag handlers (month view) ──────────────────────────────
  function handleEventDragStart(e, eventId) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", eventId);
    dragIdRef.current = eventId;
    setDragId(eventId);
  }

  function handleEventDragEnd() {
    dragIdRef.current = null;
    setDragId(null);
    setDropDay(null);
  }

  function handleCellDragOver(e, k) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropDay !== k) setDropDay(k);
  }

  function handleCellDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDropDay(null);
  }

  function handleCellDrop(e, k) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragIdRef.current;
    setDropDay(null);
    setDragId(null);
    dragIdRef.current = null;
    if (id && onEventMove) onEventMove(id, k);
  }

  const snapToToday = () => setCursor(new Date());

  const navigate = (dir) => {
    const d = new Date(cursor);
    switch (viewMode) {
      case "day":    d.setDate(d.getDate() + dir);          break;
      case "week":   d.setDate(d.getDate() + dir * 7);      break;
      case "month":  d.setMonth(d.getMonth() + dir, 1);     break;
      case "agenda": d.setMonth(d.getMonth() + dir * 3);    break;
    }
    setCursor(d);
  };

  const tasksByDay = useMemo(() => (tasks || []).reduce((acc, t) => {
    if (!t.dueDate) return acc;
    const k = dayKey(new Date(t.dueDate));
    (acc[k] ??= []).push(t);
    return acc;
  }, {}), [tasks]);

  const eventsByDay = useMemo(() => (events || []).reduce((acc, ev) => {
    if (!ev.startTime) return acc;
    const k = dayKey(new Date(ev.startTime));
    (acc[k] ??= []).push(ev);
    return acc;
  }, {}), [events]);

  const todayKey  = dayKey(new Date());
  const monthGrid = useMemo(() => getMonthGrid(cursor), [cursor]);
  const weekDays  = useMemo(() => getWeekDays(cursor),  [cursor]);

  const agendaGroups = useMemo(() => {
    const dayMap = {};
    (tasks || []).filter(t => t.dueDate).forEach(t => {
      const k = dayKey(new Date(t.dueDate));
      (dayMap[k] ??= { tasks: [], events: [] }).tasks.push(t);
    });
    (events || []).filter(ev => ev.startTime).forEach(ev => {
      const k = dayKey(new Date(ev.startTime));
      (dayMap[k] ??= { tasks: [], events: [] }).events.push(ev);
    });
    return Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b));
  }, [tasks, events]);

  const hours = showFullDay ? HOURS_FULL : HOURS_DEFAULT;

  return (
    <div className="clubpm-animate-fade-in cpm-cal-root">

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="cpm-cal-toolbar">
        <div className="cpm-cal-toolbar-left">
          <button className="cpm-cal-today-btn" onClick={snapToToday}>Today</button>
          <button className="cpm-cal-nav-btn"   onClick={() => navigate(-1)}>‹</button>
          <span className="cpm-cal-date-label">
            <i className="fas fa-calendar-alt" style={{ marginRight: 6 }} />
            {formatLabel(cursor, viewMode)}
          </span>
          <button className="cpm-cal-nav-btn" onClick={() => navigate(+1)}>›</button>
        </div>
        <div className="cpm-cal-view-switcher">
          {["day","week","month","agenda"].map(v => (
            <button
              key={v}
              className={`cpm-cal-view-btn${viewMode === v ? " active" : ""}`}
              onClick={() => setViewMode(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Month View ──────────────────────────────────────────── */}
      {viewMode === "month" && (
        <div className="cpm-cal-month-grid">
          {WEEKDAY_FULL.map(d => (
            <div key={d} className="cpm-cal-month-col-header">{d}</div>
          ))}
          {monthGrid.map((day, i) => {
            const k              = dayKey(day);
            const dayTasks       = tasksByDay[k] ?? [];
            const dayEvents      = eventsByDay[k] ?? [];
            const isCurrentMonth = day.getMonth() === cursor.getMonth();
            const isToday        = k === todayKey;
            const taskSlots      = Math.min(dayTasks.length, 3);
            const eventSlots     = Math.min(dayEvents.length, 2);
            const moreEvents     = dayEvents.length - eventSlots;
            const isDragOver     = dropDay === k && dragId !== null;
            return (
              <div
                key={i}
                className={`cpm-cal-month-cell${!isCurrentMonth ? " other-month" : ""}${isToday ? " today" : ""}${isDragOver ? " drag-over" : ""}`}
                onDragOver={onEventMove ? (e) => handleCellDragOver(e, k) : undefined}
                onDragLeave={onEventMove ? handleCellDragLeave : undefined}
                onDrop={onEventMove ? (e) => handleCellDrop(e, k) : undefined}
              >
                <span className="cpm-cal-cell-num">{day.getDate()}</span>
                {dayTasks.slice(0, taskSlots).map(task => (
                  <TaskChip key={task.id} task={task} onClick={() => onTaskClick?.(task)} />
                ))}
                {dayTasks.length > 3 && (
                  <span className="cpm-cal-more">+{dayTasks.length - 3} more</span>
                )}
                {dayEvents.slice(0, eventSlots).map(ev => (
                  <EventChip
                    key={ev.id}
                    event={ev}
                    onClick={onEventClick}
                    draggable={!!onEventMove}
                    isDragging={dragId === ev.id}
                    onDragStart={(e) => handleEventDragStart(e, ev.id)}
                    onDragEnd={handleEventDragEnd}
                  />
                ))}
                {moreEvents > 0 && (
                  <span className="cpm-cal-more cpm-cal-more-events">+{moreEvents} more</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Week View ───────────────────────────────────────────── */}
      {viewMode === "week" && (
        <>
          <div className="cpm-cal-week-grid">
            <div className="cpm-cal-week-time-gutter" />
            {weekDays.map(d => (
              <div key={dayKey(d)} className={`cpm-cal-week-col-header${dayKey(d) === todayKey ? " today" : ""}`}>
                <span className="cpm-cal-week-dow">{WEEKDAY_ABBR[d.getDay()]} {d.getDate()}</span>
              </div>
            ))}

            <div className="cpm-cal-week-time-label">all day</div>
            {weekDays.map(d => (
              <div key={`allday-${dayKey(d)}`} className="cpm-cal-week-allday-cell">
                {(tasksByDay[dayKey(d)] ?? []).map(t => (
                  <TaskChip key={t.id} task={t} onClick={() => onTaskClick?.(t)} />
                ))}
              </div>
            ))}

            {hours.map(h => (
              <React.Fragment key={h}>
                <div className="cpm-cal-week-time-label">{formatHour(h)}</div>
                {weekDays.map(d => (
                  <div
                    key={`${h}-${dayKey(d)}`}
                    className={`cpm-cal-week-hour-cell${d.getDay() === 0 || d.getDay() === 6 ? " weekend" : ""}`}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
          {!showFullDay && (
            <button className="cpm-cal-show-full-day" onClick={() => setShowFullDay(true)}>
              🕐 Show Full Day
            </button>
          )}
        </>
      )}

      {/* ── Day View ────────────────────────────────────────────── */}
      {viewMode === "day" && (
        <>
          <div className="cpm-cal-week-grid cpm-cal-day-grid">
            <div className="cpm-cal-week-time-gutter" />
            <div className={`cpm-cal-week-col-header${dayKey(cursor) === todayKey ? " today" : ""}`}>
              <span className="cpm-cal-week-dow">
                {WEEKDAY_ABBR[cursor.getDay()]} {cursor.getDate()}
              </span>
            </div>

            <div className="cpm-cal-week-time-label">all day</div>
            <div className="cpm-cal-week-allday-cell">
              {(tasksByDay[dayKey(cursor)] ?? []).map(t => (
                <TaskChip key={t.id} task={t} onClick={() => onTaskClick?.(t)} />
              ))}
            </div>

            {hours.map(h => (
              <React.Fragment key={h}>
                <div className="cpm-cal-week-time-label">{formatHour(h)}</div>
                <div className="cpm-cal-week-hour-cell" />
              </React.Fragment>
            ))}
          </div>
          {!showFullDay && (
            <button className="cpm-cal-show-full-day" onClick={() => setShowFullDay(true)}>
              🕐 Show Full Day
            </button>
          )}
        </>
      )}

      {/* ── Agenda View ─────────────────────────────────────────── */}
      {viewMode === "agenda" && (
        <div className="cpm-cal-agenda">
          <div className="cpm-cal-agenda-header">
            <span>Date</span>
            <span>Time</span>
            <span>Event</span>
          </div>
          {agendaGroups.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--clubpm-text-muted)", fontSize: 13 }}>
              No upcoming tasks or events
            </div>
          ) : (
            agendaGroups.map(([k, { tasks: dayTasks, events: dayEvents }]) => {
              const d = new Date(`${k}T12:00:00`);
              return (
                <div key={k} className="cpm-cal-agenda-day-group">
                  <div className="cpm-cal-agenda-date">
                    <span className="cpm-cal-agenda-day-num">{d.getDate()}</span>
                    <span className="cpm-cal-agenda-dow">{WEEKDAY_ABBR[d.getDay()]}</span>
                    <span className="cpm-cal-agenda-month">{MONTHS_SHORT[d.getMonth()]}, {d.getFullYear()}</span>
                  </div>
                  <div className="cpm-cal-agenda-time">All day</div>
                  <div className="cpm-cal-agenda-events">
                    {dayTasks.map(task => (
                      <div
                        key={task.id}
                        className="cpm-cal-agenda-row"
                        style={{
                          background: task.status === "DONE"
                            ? "rgba(0,184,148,0.08)"
                            : task.status === "IN_PROGRESS"
                            ? "rgba(253,203,110,0.08)"
                            : "transparent",
                        }}
                        onClick={() => onTaskClick?.(task)}
                      >
                        <span className="cpm-cal-chip-handle">‹</span>
                        <span
                          className="cpm-cal-chip-status"
                          style={{
                            borderColor: task.status === "DONE"
                              ? "var(--clubpm-accent-green)"
                              : task.status === "IN_PROGRESS"
                              ? "var(--clubpm-accent-cyan)"
                              : "var(--clubpm-text-muted)",
                          }}
                        >
                          {task.status === "DONE" && <i className="fas fa-check" />}
                        </span>
                        {task.assignees?.[0]?.avatarUrl
                          ? <img src={task.assignees[0].avatarUrl} alt="" className="cpm-cal-chip-avatar" />
                          : <span className="cpm-cal-chip-avatar-initial">
                              {(task.assignees?.[0]?.displayName ?? "?")[0]}
                            </span>
                        }
                        <span className="cpm-cal-agenda-task-title">{task.title}</span>
                      </div>
                    ))}
                    {dayEvents.map(ev => {
                      const borderColor = EVENT_TYPE_COLOR[ev.type] ?? EVENT_TYPE_COLOR.OTHER;
                      const iconClass   = EVENT_TYPE_ICON[ev.type]  ?? EVENT_TYPE_ICON.OTHER;
                      const timeLabel   = ev.startTime
                        ? new Date(ev.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                        : "All day";
                      return (
                        <div
                          key={ev.id}
                          className="cpm-cal-agenda-row cpm-cal-agenda-event-row"
                          style={{ borderLeft: `3px solid ${borderColor}`, background: "rgba(108,92,231,0.06)" }}
                          onClick={() => onEventClick?.(ev)}
                        >
                          <i className={iconClass} style={{ fontSize: 11, marginRight: 6, color: borderColor, flexShrink: 0 }} />
                          <span className="cpm-cal-agenda-task-title">{ev.title}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--clubpm-text-muted)", flexShrink: 0 }}>
                            {timeLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

    </div>
  );
}
