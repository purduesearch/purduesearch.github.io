import React, { useMemo, useState, useRef, useEffect } from "react";

// ── Constants ────────────────────────────────────────────────

const STATUS_COLORS = {
  TODO: "#a0a0c0",
  IN_PROGRESS: "#e6a817",
  BLOCKED: "#e17055",
  DONE: "#00b894",
};

const MILESTONE_COLORS = {
  ON_TRACK:  "var(--clubpm-accent-primary)",
  AT_RISK:   "var(--clubpm-accent-yellow)",
  BEHIND:    "#e17055",
  COMPLETED: "var(--clubpm-accent-green)",
  CANCELLED: "var(--clubpm-text-muted)",
};

const ROW_HEIGHT = 60;
const LABEL_WIDTH = 260;
const MIN_BAR_WIDTH = 6;
const PADDING_TOP = 50;
const PADDING_BOTTOM = 20;

const SCALE_DAY_WIDTHS = {
  day:   32,
  week:  8,
  month: 3,
};

// ── Critical path helpers ────────────────────────────────────

function computeCriticalPath(sortedTasks) {
  if (!sortedTasks.length) return new Set();

  // Check if any task has dependencies
  const anyDeps = sortedTasks.some(
    (t) => t.dependencies && t.dependencies.length > 0
  );
  if (!anyDeps) return new Set();

  // Build id → task map
  const taskMap = new Map(sortedTasks.map((t) => [t.id, t]));

  // Find task with latest dueDate as end node
  const withDue = sortedTasks.filter((t) => t.dueDate);
  if (!withDue.length) return new Set();

  const endTask = withDue.reduce((best, t) =>
    new Date(t.dueDate) > new Date(best.dueDate) ? t : best
  );

  // Build reverse adjacency: for each task, which tasks depend on it?
  // We want to walk backward from endTask through its declared dependencies
  const criticalSet = new Set();
  const queue = [endTask.id];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (criticalSet.has(currentId)) continue;
    criticalSet.add(currentId);

    const current = taskMap.get(currentId);
    if (!current) continue;

    if (current.dependencies && current.dependencies.length > 0) {
      for (const dep of current.dependencies) {
        const predId = dep.taskId;
        if (predId && taskMap.has(predId) && !criticalSet.has(predId)) {
          queue.push(predId);
        }
      }
    }
  }

  return criticalSet;
}

// ── Component ────────────────────────────────────────────────

export default function GanttChart({ tasks, milestones = [] }) {
  const [hoveredTask, setHoveredTask] = useState(null);
  const [scale, setScale] = useState("week");
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef(null);
  const [centerMode, setCenterMode] = useState("today");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    setContainerWidth(containerRef.current.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const { minDate, totalDays, sortedTasks } = useMemo(() => {
    const tasksWithDates = tasks.filter(
      (t) => t.createdAt || t.dueDate
    );

    if (tasksWithDates.length === 0) {
      const now = new Date();
      return {
        minDate: now,
        maxDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        totalDays: 30,
        sortedTasks: [],
      };
    }

    const allDates = tasksWithDates.flatMap((t) => [
      new Date(t.createdAt),
      t.dueDate ? new Date(t.dueDate) : new Date(t.createdAt),
    ]);

    const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...allDates.map((d) => d.getTime())));

    // Add padding
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);

    const days = Math.max(
      Math.ceil((max.getTime() - min.getTime()) / (1000 * 60 * 60 * 24)),
      7
    );

    const sorted = [...tasksWithDates].sort((a, b) => {
      const aStart = new Date(a.createdAt).getTime();
      const bStart = new Date(b.createdAt).getTime();
      return aStart - bStart;
    });

    return { minDate: min, maxDate: max, totalDays: days, sortedTasks: sorted };
  }, [tasks]);

  const criticalPathSet = useMemo(
    () => computeCriticalPath(sortedTasks),
    [sortedTasks]
  );

  // Dynamically compute DAY_WIDTH so bars fill the container; scale buttons act as zoom multipliers
  const baseDayWidth = containerWidth > LABEL_WIDTH && totalDays > 0
    ? (containerWidth - LABEL_WIDTH) / totalDays
    : SCALE_DAY_WIDTHS[scale];
  const scaleMultiplier = { day: 4, week: 1, month: 0.4 };
  const DAY_WIDTH = Math.max(baseDayWidth * (scaleMultiplier[scale] ?? 1), SCALE_DAY_WIDTHS[scale]);

  const anchorScrollX = useMemo(() => {
    const active = tasks.filter(t => t.status !== "DONE" && t.progress !== "COMPLETED");
    let anchorDate;
    if (centerMode === "today") {
      anchorDate = new Date();
    } else if (centerMode === "oldest_active") {
      if (!active.length) return 0;
      anchorDate = new Date(Math.min(...active.map(t => new Date(t.createdAt).getTime())));
    } else {
      if (!active.length) return 0;
      anchorDate = new Date(Math.max(...active.map(t =>
        t.dueDate ? new Date(t.dueDate).getTime() : new Date(t.createdAt).getTime()
      )));
    }
    const diffMs = anchorDate.getTime() - minDate.getTime();
    return Math.max(0, (diffMs / 86400000) * DAY_WIDTH);
  }, [centerMode, tasks, minDate, DAY_WIDTH]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = anchorScrollX;
    }
  }, [anchorScrollX]);

  const chartWidth = LABEL_WIDTH + totalDays * DAY_WIDTH;
  const chartHeight = PADDING_TOP + sortedTasks.length * ROW_HEIGHT + PADDING_BOTTOM;

  // Generate month/day markers
  const markers = useMemo(() => {
    const months = [];
    const days = [];

    const cursor = new Date(minDate);
    let lastMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const x = LABEL_WIDTH + d * DAY_WIDTH;
      const dayOfWeek = cursor.getDay();
      const isMonday = dayOfWeek === 1;

      days.push({
        x,
        label: cursor.getDate().toString(),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isMonday,
        month: cursor.getMonth(),
        date: new Date(cursor),
      });

      if (cursor.getMonth() !== lastMonth) {
        months.push({
          x,
          label: cursor.toLocaleDateString("en-US", {
            month: "short",
            year: "2-digit",
          }),
        });
        lastMonth = cursor.getMonth();
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return { months, days };
  }, [minDate, totalDays, DAY_WIDTH]);

  const getX = (date) => {
    const diffDays =
      (date.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    return LABEL_WIDTH + diffDays * DAY_WIDTH;
  };

  // Build task index map for dependency arrows
  const taskIndexMap = useMemo(
    () => new Map(sortedTasks.map((t, i) => [t.id, i])),
    [sortedTasks]
  );

  // Compute dependency arrow segments
  const dependencyArrows = useMemo(() => {
    const arrows = [];

    sortedTasks.forEach((successor, succIdx) => {
      if (!successor.dependencies || successor.dependencies.length === 0) return;

      const succStartDate = new Date(successor.createdAt);
      const succBarX = getX(succStartDate);

      const succY = PADDING_TOP + succIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      successor.dependencies.forEach((dep) => {
        const predIdx = taskIndexMap.get(dep.taskId);
        if (predIdx === undefined) return;

        const pred = sortedTasks[predIdx];
        const predEndDate = pred.dueDate
          ? new Date(pred.dueDate)
          : new Date(new Date(pred.createdAt).getTime() + 3 * 24 * 60 * 60 * 1000);

        const predBarX = getX(new Date(pred.createdAt));
        const predBarWidth = Math.max(getX(predEndDate) - predBarX, MIN_BAR_WIDTH);

        const x1 = predBarX + predBarWidth; // right edge of predecessor bar
        const y1 = PADDING_TOP + predIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const x2 = succBarX; // left edge of successor bar
        const y2 = succY;

        const cpOffset = 40;
        const d = `M ${x1},${y1} C ${x1 + cpOffset},${y1} ${x2 - cpOffset},${y2} ${x2},${y2}`;

        arrows.push({ d, key: `${pred.id}->${successor.id}` });
      });
    });

    return arrows;
  }, [sortedTasks, taskIndexMap, minDate, DAY_WIDTH]);

  if (sortedTasks.length === 0) {
    return (
      <p style={{ color: "var(--pm-text-muted)", fontSize: 14, textAlign: "center", padding: "48px 0" }}>
        No tasks with dates to display.
      </p>
    );
  }

  return (
    <div ref={containerRef}>
      {/* ── Scale controls ───────────────────────────────── */}
      <div className="pm-gantt-toolbar">
        {["day", "week", "month"].map((s) => (
          <button
            key={s}
            className={`pm-gantt-scale-btn${scale === s ? " active" : ""}`}
            onClick={() => setScale(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div style={{ width: 1, background: "var(--clubpm-border)", margin: "0 8px", alignSelf: "stretch" }} />
        {[
          { id: "oldest_active", label: "Oldest" },
          { id: "today",         label: "Today"  },
          { id: "newest_active", label: "Newest" },
        ].map((m) => (
          <button
            key={m.id}
            className={`pm-gantt-scale-btn${centerMode === m.id ? " active" : ""}`}
            onClick={() => setCenterMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Chart ────────────────────────────────────────── */}
      <div className="overflow-x-auto" ref={scrollRef}>
        <svg
          width={chartWidth}
          height={chartHeight}
          className="select-none"
          style={{ minWidth: "100%" }}
        >
          {/* Arrow marker definition */}
          <defs>
            <marker
              id="gantt-arrow"
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <path
                d="M0,0 L0,6 L6,3 z"
                fill="var(--pm-accent-teal)"
                opacity="0.6"
              />
            </marker>
          </defs>

          {/* Background stripes for weekends */}
          {markers.days
            .filter((d) => d.isWeekend)
            .map((d, i) => (
              <rect
                key={`weekend-${i}`}
                x={d.x}
                y={PADDING_TOP}
                width={DAY_WIDTH}
                height={chartHeight - PADDING_TOP}
                fill="rgba(255, 255, 255, 0.02)"
              />
            ))}

          {/* Grid lines — show all in day mode, only Mondays in week, none in month */}
          {markers.days
            .filter((d) => {
              if (scale === "day") return true;
              if (scale === "week") return d.isMonday;
              return false; // month: skip day lines, rely on month lines
            })
            .map((d, i) => (
              <line
                key={`grid-${i}`}
                x1={d.x}
                y1={PADDING_TOP}
                x2={d.x}
                y2={chartHeight}
                stroke="rgba(255, 255, 255, 0.04)"
                strokeWidth={1}
              />
            ))}

          {/* Month grid lines (always) */}
          {markers.months.map((m, i) => (
            <line
              key={`mgrid-${i}`}
              x1={m.x}
              y1={PADDING_TOP}
              x2={m.x}
              y2={chartHeight}
              stroke="rgba(255, 255, 255, 0.07)"
              strokeWidth={1}
            />
          ))}

          {/* Month labels */}
          {markers.months.map((m, i) => (
            <text
              key={`month-${i}`}
              x={m.x + 4}
              y={14}
              fill="var(--clubpm-text-secondary)"
              fontSize={11}
              fontWeight={600}
              fontFamily="Inter, sans-serif"
            >
              {m.label}
            </text>
          ))}

          {/* Day numbers — only in day scale or on Mondays in week scale */}
          {scale !== "month" &&
            markers.days
              .filter((d) => scale === "day" || d.isMonday)
              .map((d, i) => (
                <text
                  key={`day-${i}`}
                  x={d.x + DAY_WIDTH / 2}
                  y={34}
                  fill="var(--clubpm-text-muted)"
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="Inter, sans-serif"
                >
                  {d.label}
                </text>
              ))}

          {/* Header separator */}
          <line
            x1={0}
            y1={PADDING_TOP - 4}
            x2={chartWidth}
            y2={PADDING_TOP - 4}
            stroke="var(--clubpm-border)"
            strokeWidth={1}
          />

          {/* Task rows */}
          {sortedTasks.map((task, index) => {
            const y = PADDING_TOP + index * ROW_HEIGHT;
            const startDate = new Date(task.createdAt);
            const endDate = task.dueDate
              ? new Date(task.dueDate)
              : new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);

            const barX = getX(startDate);
            const barWidth = Math.max(getX(endDate) - barX, MIN_BAR_WIDTH);
            const color = STATUS_COLORS[task.status];
            const isHovered = hoveredTask === task.id;
            const isCritical = criticalPathSet.has(task.id);

            return (
              <g
                key={task.id}
                onMouseEnter={() => setHoveredTask(task.id)}
                onMouseLeave={() => setHoveredTask(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Row highlight */}
                {isHovered && (
                  <rect
                    x={0}
                    y={y}
                    width={chartWidth}
                    height={ROW_HEIGHT}
                    fill="rgba(108, 92, 231, 0.05)"
                  />
                )}

                {/* Row separator */}
                <line
                  x1={0}
                  y1={y + ROW_HEIGHT}
                  x2={chartWidth}
                  y2={y + ROW_HEIGHT}
                  stroke="rgba(255, 255, 255, 0.03)"
                  strokeWidth={1}
                />

                {/* Task label */}
                <text
                  x={12}
                  y={y + ROW_HEIGHT / 2}
                  fill={isHovered ? "var(--clubpm-text-primary)" : "var(--clubpm-text-secondary)"}
                  fontSize={13}
                  fontFamily="Inter, sans-serif"
                  dominantBaseline="middle"
                >
                  {task.title.length > 28
                    ? task.title.slice(0, 28) + "…"
                    : task.title}
                </text>

                {/* Critical path star indicator in label column */}
                {isCritical && (
                  <text
                    x={246}
                    y={y + ROW_HEIGHT / 2}
                    fill="var(--pm-accent-amber)"
                    fontSize={10}
                    dominantBaseline="middle"
                    fontFamily="Inter, sans-serif"
                  >
                    ★
                  </text>
                )}

                {/* Bar — critical path gets glow + full opacity */}
                <rect
                  x={barX}
                  y={y + 16}
                  width={barWidth}
                  height={28}
                  rx={6}
                  fill={color}
                  opacity={isCritical ? 1.0 : isHovered ? 0.9 : 0.7}
                  style={{
                    transition: "opacity 0.15s ease",
                    filter: isCritical
                      ? "drop-shadow(0 0 4px var(--pm-accent-amber))"
                      : "none",
                  }}
                />

                {/* Critical path left-edge dot */}
                {isCritical && (
                  <circle
                    cx={barX + 5}
                    cy={y + 16 + 14}
                    r={3}
                    fill="var(--pm-accent-amber)"
                    opacity={0.9}
                  />
                )}

                {/* Assignees label on bar */}
                {barWidth > 60 && task.assignees && task.assignees.length > 0 && (
                  <text
                    x={barX + (isCritical ? 14 : 8)}
                    y={y + ROW_HEIGHT / 2}
                    fill="white"
                    fontSize={11}
                    fontWeight={500}
                    fontFamily="Inter, sans-serif"
                    dominantBaseline="middle"
                  >
                    {task.assignees[0].displayName.split(" ")[0]}
                    {task.assignees.length > 1 && ` +${task.assignees.length - 1}`}
                  </text>
                )}

                {/* Tooltip on hover */}
                {isHovered && (
                  <g>
                    <rect
                      x={barX + barWidth + 8}
                      y={y + 4}
                      width={180}
                      height={32}
                      rx={6}
                      fill="var(--clubpm-surface-400)"
                      stroke="var(--clubpm-border)"
                      strokeWidth={1}
                    />
                    <text
                      x={barX + barWidth + 16}
                      y={y + 24}
                      fill="var(--clubpm-text-primary)"
                      fontSize={10}
                      fontFamily="Inter, sans-serif"
                    >
                      {task.status.replace("_", " ")} · {task.priority} ·{" "}
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "No due date"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Milestone markers */}
          {milestones
            .filter((m) => m.dueDate != null)
            .map((m) => {
              const milestoneDate = new Date(m.dueDate);
              const daysDiff = Math.floor(
                (milestoneDate.getTime() - minDate.getTime()) / 86400000
              );
              const x = LABEL_WIDTH + daysDiff * DAY_WIDTH;
              if (x < LABEL_WIDTH || x > chartWidth) return null;
              const color = MILESTONE_COLORS[m.status] ?? MILESTONE_COLORS.ON_TRACK;
              return (
                <g key={`milestone-${m.id}`}>
                  {/* Vertical dashed line */}
                  <line
                    x1={x} y1={0} x2={x} y2={chartHeight}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="4,3"
                    opacity={0.7}
                  />
                  {/* Diamond marker */}
                  <rect
                    x={x - 5}
                    y={PADDING_TOP / 2 - 5}
                    width={10}
                    height={10}
                    transform={`rotate(45, ${x}, ${PADDING_TOP / 2})`}
                    fill={color}
                    stroke="var(--clubpm-surface-100)"
                    strokeWidth={1}
                  />
                  {/* Rotated label */}
                  <text
                    x={x}
                    y={PADDING_TOP / 2 - 10}
                    textAnchor="end"
                    fontSize={9}
                    fill={color}
                    transform={`rotate(-45, ${x}, ${PADDING_TOP / 2 - 10})`}
                    style={{ userSelect: "none" }}
                    fontFamily="Inter, sans-serif"
                  >
                    {m.title && m.title.length > 12 ? m.title.slice(0, 11) + "…" : m.title}
                  </text>
                </g>
              );
            })}

          {/* Today line */}
          {(() => {
            const todayX = getX(new Date());
            if (todayX >= LABEL_WIDTH && todayX <= chartWidth) {
              return (
                <g>
                  <line
                    x1={todayX}
                    y1={PADDING_TOP}
                    x2={todayX}
                    y2={chartHeight}
                    stroke="var(--pm-accent-coral)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    opacity={0.6}
                  />
                  <text
                    x={todayX}
                    y={PADDING_TOP - 8}
                    fill="var(--pm-accent-coral)"
                    fontSize={9}
                    textAnchor="middle"
                    fontWeight={600}
                    fontFamily="Inter, sans-serif"
                  >
                    TODAY
                  </text>
                </g>
              );
            }
            return null;
          })()}

          {/* Dependency arrows — rendered on top of everything */}
          {dependencyArrows.map((arrow) => (
            <path
              key={arrow.key}
              d={arrow.d}
              fill="none"
              stroke="var(--pm-accent-teal)"
              strokeWidth={1.5}
              opacity={0.4}
              markerEnd="url(#gantt-arrow)"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
