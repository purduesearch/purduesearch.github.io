import { Link } from "react-router-dom";
import type { Project } from "../types";
import MemberBadge from "./MemberBadge";

const TYPE_BADGE: Record<string, string> = {
  ENGINEERING: "badge-engineering",
  RESEARCH: "badge-research",
  HYBRID: "badge-hybrid",
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "badge-active",
  PAUSED: "badge-paused",
  COMPLETED: "badge-completed",
  ARCHIVED: "badge-archived",
};

export default function ProjectCard({ project }: { project: Project }) {
  const total = project.totalTasks ?? project.tasks?.length ?? 0;
  const done = project.doneTasks ?? project.tasks?.filter((t) => t.status === "DONE").length ?? 0;
  const pct = project.completionPercent ?? (total > 0 ? Math.round((done / total) * 100) : 0);

  const daysUntilTarget = project.targetDate
    ? Math.ceil(
        (new Date(project.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <Link
      to={`/projects/${project.id}`}
      className="glass-card p-5 block no-underline group"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-primary)] transition-colors leading-snug">
          {project.name}
        </h3>
        <span className={`badge ${TYPE_BADGE[project.type] ?? ""} shrink-0`}>
          {project.type}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3 line-clamp-2 leading-relaxed">
          {project.description}
        </p>
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[var(--color-text-secondary)]">
            {done} / {total} tasks done
          </span>
          <span className="text-[var(--color-text-muted)]">{pct}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className={`badge ${STATUS_BADGE[project.status] ?? ""}`}>
            {project.status}
          </span>
          {daysUntilTarget !== null && (
            <span
              className={`text-xs ml-2 ${
                daysUntilTarget < 0
                  ? "text-[var(--color-accent-red)]"
                  : daysUntilTarget < 7
                    ? "text-[var(--color-accent-orange)]"
                    : "text-[var(--color-text-muted)]"
              }`}
            >
              {daysUntilTarget < 0
                ? `${Math.abs(daysUntilTarget)}d overdue`
                : `${daysUntilTarget}d left`}
            </span>
          )}
        </div>

        {/* Member avatars */}
        <div className="flex -space-x-2">
          {project.members?.slice(0, 4).map((pm) => (
            <MemberBadge key={pm.memberId} member={pm.member} size="sm" />
          ))}
          {(project.members?.length ?? 0) > 4 && (
            <div className="w-6 h-6 rounded-full bg-[var(--color-surface-400)] flex items-center justify-center text-[10px] text-[var(--color-text-muted)] ring-2 ring-[var(--color-surface-100)]">
              +{(project.members?.length ?? 0) - 4}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
