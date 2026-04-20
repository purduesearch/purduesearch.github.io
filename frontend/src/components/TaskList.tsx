import type { Task } from "../types";

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "var(--color-accent-red)",
  HIGH: "var(--color-accent-orange)",
  MEDIUM: "var(--color-accent-orange)",
  LOW: "var(--color-accent-green)",
};

const STATUS_ICON: Record<string, string> = {
  TODO: "📋",
  IN_PROGRESS: "🔧",
  BLOCKED: "🚫",
  DONE: "✅",
};

interface TaskListProps {
  tasks: Task[];
  showProject?: boolean;
}

export default function TaskList({ tasks, showProject = false }: TaskListProps) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const dueStr = task.dueDate
          ? new Date(task.dueDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : null;

        const isOverdue =
          task.dueDate &&
          new Date(task.dueDate) < new Date() &&
          task.status !== "DONE";

        return (
          <div
            key={task.id}
            className="group flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--color-surface-200)] transition-colors"
          >
            <span className="text-sm mt-0.5 shrink-0">
              {STATUS_ICON[task.status]}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium leading-snug ${
                  task.status === "DONE"
                    ? "text-[var(--color-text-muted)] line-through"
                    : "text-[var(--color-text-primary)]"
                }`}
              >
                {task.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {showProject && task.project && (
                  <span className="text-[10px] text-[var(--color-accent-secondary)] bg-[var(--color-surface-300)] px-1.5 py-0.5 rounded">
                    {task.project.name}
                  </span>
                )}
                {dueStr && (
                  <span
                    className={`text-[10px] ${
                      isOverdue
                        ? "text-[var(--color-accent-red)]"
                        : "text-[var(--color-text-muted)]"
                    }`}
                  >
                    {isOverdue ? "⚠ " : "📅 "}
                    {dueStr}
                  </span>
                )}
              </div>
            </div>
            <div
              className="w-2 h-2 rounded-full shrink-0 mt-1.5"
              style={{
                backgroundColor: PRIORITY_DOT[task.priority],
              }}
              title={task.priority}
            />
          </div>
        );
      })}
    </div>
  );
}
