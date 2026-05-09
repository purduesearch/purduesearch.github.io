import React from "react";
import { Link } from "react-router-dom";
import MemberBadge from "./MemberBadge";

const TYPE_BADGE = {
  ENGINEERING: "clubpm-badge-engineering",
  RESEARCH: "clubpm-badge-research",
  HYBRID: "clubpm-badge-hybrid",
};

const STATUS_BADGE = {
  ACTIVE: "clubpm-badge-active",
  PAUSED: "clubpm-badge-paused",
  COMPLETED: "clubpm-badge-completed",
  ARCHIVED: "clubpm-badge-archived",
};

export default function ProjectCard({ project }) {
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
      to={`/clubpm/projects/${project.id}`}
      className="clubpm-glass-card p-5 block no-underline group"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-[var(--clubpm-text-primary)] group-hover:text-[var(--clubpm-accent-primary)] transition-colors leading-snug">
          {project.name}
        </h3>
        <span className={`clubpm-badge ${TYPE_BADGE[project.type] ?? ""} shrink-0`}>
          {project.type}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-xs text-[var(--clubpm-text-muted)] mb-3 line-clamp-2 leading-relaxed">
          {project.description}
        </p>
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[var(--clubpm-text-secondary)]">
            {done} / {total} tasks done
          </span>
          <span className="text-[var(--clubpm-text-muted)]">{pct}%</span>
        </div>
        <div className="clubpm-progress-bar">
          <div className="clubpm-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className={`clubpm-badge ${STATUS_BADGE[project.status] ?? ""}`}>
            {project.status}
          </span>
          {daysUntilTarget !== null && (
            <span
              className={`text-xs ml-2 ${
                daysUntilTarget < 0
                  ? "text-[var(--clubpm-accent-red)]"
                  : daysUntilTarget < 7
                    ? "text-[var(--clubpm-accent-orange)]"
                    : "text-[var(--clubpm-text-muted)]"
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
            <div className="w-6 h-6 rounded-full bg-[var(--clubpm-surface-400)] flex items-center justify-center text-[10px] text-[var(--clubpm-text-muted)] ring-2 ring-[var(--clubpm-surface-100)]">
              +{(project.members?.length ?? 0) - 4}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
