import { useMemo, useState } from "react";
import type { Task, TaskStatus } from "../types";

// ── Constants ────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, string> = {
  TODO: "#a0a0c0",
  IN_PROGRESS: "#00cec9",
  BLOCKED: "#e17055",
  DONE: "#00b894",
};

const ROW_HEIGHT = 40;
const LABEL_WIDTH = 260;
const MIN_BAR_WIDTH = 6;
const PADDING_TOP = 50;
const PADDING_BOTTOM = 20;
const DAY_WIDTH = 32;

// ── Component ────────────────────────────────────────────────

interface GanttChartProps {
  tasks: Task[];
}

export default function GanttChart({ tasks }: GanttChartProps) {
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

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

  const chartWidth = LABEL_WIDTH + totalDays * DAY_WIDTH;
  const chartHeight = PADDING_TOP + sortedTasks.length * ROW_HEIGHT + PADDING_BOTTOM;

  // Generate month/day markers
  const markers = useMemo(() => {
    const months: { x: number; label: string }[] = [];
    const days: { x: number; label: string; isWeekend: boolean }[] = [];

    const cursor = new Date(minDate);
    let lastMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const x = LABEL_WIDTH + d * DAY_WIDTH;
      const dayOfWeek = cursor.getDay();

      days.push({
        x,
        label: cursor.getDate().toString(),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
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
  }, [minDate, totalDays]);

  const getX = (date: Date): number => {
    const diffDays =
      (date.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    return LABEL_WIDTH + diffDays * DAY_WIDTH;
  };

  if (sortedTasks.length === 0) {
    return (
      <p className="text-[var(--color-text-muted)] text-sm text-center py-12">
        No tasks with dates to display.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={chartWidth}
        height={chartHeight}
        className="select-none"
        style={{ minWidth: "100%" }}
      >
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

        {/* Grid lines */}
        {markers.days.map((d, i) => (
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

        {/* Month labels */}
        {markers.months.map((m, i) => (
          <text
            key={`month-${i}`}
            x={m.x + 4}
            y={14}
            fill="var(--color-text-secondary)"
            fontSize={11}
            fontWeight={600}
            fontFamily="Inter, sans-serif"
          >
            {m.label}
          </text>
        ))}

        {/* Day numbers */}
        {markers.days.map((d, i) => (
          <text
            key={`day-${i}`}
            x={d.x + DAY_WIDTH / 2}
            y={34}
            fill="var(--color-text-muted)"
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
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {/* Task rows */}
        {sortedTasks.map((task, index) => {
          const y = PADDING_TOP + index * ROW_HEIGHT;
          const startDate = new Date(task.createdAt);
          const endDate = task.dueDate
            ? new Date(task.dueDate)
            : new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000); // 3-day default

          const barX = getX(startDate);
          const barWidth = Math.max(getX(endDate) - barX, MIN_BAR_WIDTH);
          const color = STATUS_COLORS[task.status];
          const isHovered = hoveredTask === task.id;

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
                y={y + ROW_HEIGHT / 2 + 1}
                fill={isHovered ? "var(--color-text-primary)" : "var(--color-text-secondary)"}
                fontSize={12}
                fontFamily="Inter, sans-serif"
                dominantBaseline="middle"
              >
                {task.title.length > 28
                  ? task.title.slice(0, 28) + "…"
                  : task.title}
              </text>

              {/* Bar */}
              <rect
                x={barX}
                y={y + 10}
                width={barWidth}
                height={20}
                rx={5}
                ry={5}
                fill={color}
                opacity={isHovered ? 0.9 : 0.7}
                style={{
                  transition: "opacity 0.15s ease",
                }}
              />

              {/* Assignee label on bar */}
              {barWidth > 60 && task.assignee && (
                <text
                  x={barX + 8}
                  y={y + ROW_HEIGHT / 2 + 1}
                  fill="white"
                  fontSize={10}
                  fontWeight={500}
                  fontFamily="Inter, sans-serif"
                  dominantBaseline="middle"
                >
                  {task.assignee.displayName.split(" ")[0]}
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
                    fill="var(--color-surface-400)"
                    stroke="var(--color-border)"
                    strokeWidth={1}
                  />
                  <text
                    x={barX + barWidth + 16}
                    y={y + 24}
                    fill="var(--color-text-primary)"
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
                  stroke="var(--color-accent-pink)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  opacity={0.6}
                />
                <text
                  x={todayX}
                  y={PADDING_TOP - 8}
                  fill="var(--color-accent-pink)"
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
      </svg>
    </div>
  );
}
