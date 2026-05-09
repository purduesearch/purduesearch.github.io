import React, { useState } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PRIORITY_COLORS = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#22c55e",
};

export default function CalendarView({ tasks, onTaskClick }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("month"); // "month" | "week"

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const navigate = (dir) => {
    const d = new Date(currentDate);
    if (viewMode === "month") {
      d.setMonth(d.getMonth() + dir);
    } else {
      d.setDate(d.getDate() + dir * 7);
    }
    setCurrentDate(d);
  };

  // ── Month View helpers ──
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const getTasksForDate = (dateStr) => {
    return tasks.filter((t) => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate).toISOString().split("T")[0] === dateStr;
    });
  };

  // Build calendar grid
  const cells = [];
  // Previous month fill
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevDays - i;
    const d = new Date(year, month - 1, day);
    cells.push({ day, date: d, isCurrentMonth: false });
  }
  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, date: new Date(year, month, day), isCurrentMonth: true });
  }
  // Next month fill
  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day++) {
    cells.push({ day, date: new Date(year, month + 1, day), isCurrentMonth: false });
  }

  // ── Week View helpers ──
  const weekStart = new Date(currentDate);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="clubpm-animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-[var(--clubpm-surface-200)] hover:bg-[var(--clubpm-surface-300)] text-[var(--clubpm-text-primary)] flex items-center justify-center transition-colors"
          >
            ‹
          </button>
          <h2 className="text-xl font-bold text-[var(--clubpm-text-primary)]">
            {viewMode === "month"
              ? `${MONTHS[month]} ${year}`
              : `Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </h2>
          <button
            onClick={() => navigate(1)}
            className="w-8 h-8 rounded-lg bg-[var(--clubpm-surface-200)] hover:bg-[var(--clubpm-surface-300)] text-[var(--clubpm-text-primary)] flex items-center justify-center transition-colors"
          >
            ›
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--clubpm-accent-primary)]/10 text-[var(--clubpm-accent-primary)] hover:bg-[var(--clubpm-accent-primary)]/20 transition-colors font-medium"
          >
            Today
          </button>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-[var(--clubpm-border)]">
          {["month", "week"].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                viewMode === mode
                  ? "bg-[var(--clubpm-accent-primary)] text-white"
                  : "bg-[var(--clubpm-surface-200)] text-[var(--clubpm-text-secondary)] hover:bg-[var(--clubpm-surface-300)]"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Month View */}
      {viewMode === "month" && (
        <div className="rounded-xl border border-[var(--clubpm-border)] overflow-hidden bg-[var(--clubpm-surface-100)]">
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {DAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-3 text-center text-xs font-semibold text-[var(--clubpm-text-muted)] uppercase tracking-wider bg-[var(--clubpm-surface-200)] border-b border-[var(--clubpm-border)]"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {cells.map((cell, i) => {
              const dateStr = cell.date.toISOString().split("T")[0];
              const dayTasks = getTasksForDate(dateStr);
              const isToday = dateStr === today;

              return (
                <div
                  key={i}
                  className={`min-h-[100px] p-1.5 border-b border-r border-[var(--clubpm-border)] transition-colors ${
                    cell.isCurrentMonth
                      ? "bg-[var(--clubpm-surface-100)]"
                      : "bg-[var(--clubpm-surface-50)] opacity-40"
                  } ${isToday ? "ring-2 ring-inset ring-[var(--clubpm-accent-primary)]/30" : ""}`}
                >
                  <span
                    className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday
                        ? "bg-[var(--clubpm-accent-primary)] text-white"
                        : "text-[var(--clubpm-text-secondary)]"
                    }`}
                  >
                    {cell.day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayTasks.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onTaskClick?.(t)}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate transition-colors hover:opacity-80"
                        style={{
                          backgroundColor: `${PRIORITY_COLORS[t.priority] || "#6366f1"}22`,
                          color: PRIORITY_COLORS[t.priority] || "#6366f1",
                          borderLeft: `2px solid ${PRIORITY_COLORS[t.priority] || "#6366f1"}`,
                        }}
                      >
                        {t.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[10px] text-[var(--clubpm-text-muted)] pl-1">
                        +{dayTasks.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {viewMode === "week" && (
        <div className="rounded-xl border border-[var(--clubpm-border)] overflow-hidden bg-[var(--clubpm-surface-100)]">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {weekDays.map((d) => {
              const dateStr = d.toISOString().split("T")[0];
              const dayTasks = getTasksForDate(dateStr);
              const isToday = dateStr === today;

              return (
                <div
                  key={dateStr}
                  className={`min-h-[400px] border-r border-[var(--clubpm-border)] last:border-r-0 ${
                    isToday ? "bg-[var(--clubpm-accent-primary)]/5" : ""
                  }`}
                >
                  <div
                    className={`px-3 py-3 text-center border-b border-[var(--clubpm-border)] ${
                      isToday ? "bg-[var(--clubpm-accent-primary)]/10" : "bg-[var(--clubpm-surface-200)]"
                    }`}
                  >
                    <p className="text-xs text-[var(--clubpm-text-muted)] uppercase">{DAYS[d.getDay()]}</p>
                    <p
                      className={`text-lg font-bold ${
                        isToday ? "text-[var(--clubpm-accent-primary)]" : "text-[var(--clubpm-text-primary)]"
                      }`}
                    >
                      {d.getDate()}
                    </p>
                  </div>
                  <div className="p-2 space-y-1.5">
                    {dayTasks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onTaskClick?.(t)}
                        className="w-full text-left p-2 rounded-lg transition-all hover:scale-[1.02]"
                        style={{
                          backgroundColor: `${PRIORITY_COLORS[t.priority] || "#6366f1"}15`,
                          borderLeft: `3px solid ${PRIORITY_COLORS[t.priority] || "#6366f1"}`,
                        }}
                      >
                        <p className="text-xs font-medium text-[var(--clubpm-text-primary)] truncate">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-[var(--clubpm-text-muted)] mt-0.5">
                          {t.priority} • {t.status.replace("_", " ")}
                        </p>
                      </button>
                    ))}
                    {dayTasks.length === 0 && (
                      <p className="text-[10px] text-[var(--clubpm-text-muted)] text-center py-4 opacity-50">
                        No tasks
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
