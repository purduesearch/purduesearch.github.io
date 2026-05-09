import React, { useState, useEffect } from "react";
import { get } from "../../api/clubPmClient";

const ACTIVITY_ICONS = {
  TASK_CREATED: "✨",
  TASK_UPDATED: "✏️",
  TASK_DELETED: "🗑️",
  STATUS_CHANGED: "🔄",
  ASSIGNEE_CHANGED: "👤",
  COMMENT_ADDED: "💬",
  SUBTASK_ADDED: "📎",
  DEPENDENCY_ADDED: "🔗",
  MILESTONE_CREATED: "🎯",
  MILESTONE_COMPLETED: "🏆",
  PROJECT_UPDATED: "📁",
  RECURRING_SPAWNED: "🔁",
};

const ACTIVITY_LABELS = {
  TASK_CREATED: "created a task",
  TASK_UPDATED: "updated a task",
  TASK_DELETED: "deleted a task",
  STATUS_CHANGED: "changed status",
  ASSIGNEE_CHANGED: "changed assignees",
  COMMENT_ADDED: "added a comment",
  SUBTASK_ADDED: "added a subtask",
  DEPENDENCY_ADDED: "added a dependency",
  MILESTONE_CREATED: "created a milestone",
  MILESTONE_COMPLETED: "completed a milestone",
  PROJECT_UPDATED: "updated the project",
  RECURRING_SPAWNED: "recurring task spawned",
};

export default function ProjectActivity({ projectId }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get(`/api/activity/project/${projectId}`)
      .then(setActivities)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--clubpm-accent-primary)] border-t-transparent clubpm-animate-spin" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">📜</p>
        <p className="text-[var(--clubpm-text-muted)]">No activity recorded yet.</p>
        <p className="text-xs text-[var(--clubpm-text-muted)] mt-1">
          Activity will appear here as tasks are created and updated.
        </p>
      </div>
    );
  }

  // Group by date
  const grouped = {};
  activities.forEach((a) => {
    const dateKey = new Date(a.createdAt).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(a);
  });

  return (
    <div className="max-w-3xl clubpm-animate-fade-in">
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--clubpm-text-muted)] mb-4 sticky top-0 bg-[var(--clubpm-surface-50)] py-1 z-10">
            {date}
          </h3>
          <div className="relative pl-8 border-l-2 border-[var(--clubpm-border)] space-y-4">
            {items.map((activity) => (
              <div key={activity.id} className="relative">
                {/* Timeline dot */}
                <div className="absolute -left-[25px] top-1 w-4 h-4 rounded-full bg-[var(--clubpm-surface-200)] border-2 border-[var(--clubpm-accent-primary)] flex items-center justify-center text-[8px]">
                  {ACTIVITY_ICONS[activity.type] || "•"}
                </div>
                <div className="clubpm-glass-card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {activity.member && (
                      <span className="text-sm font-semibold text-[var(--clubpm-text-primary)]">
                        {activity.member.displayName}
                      </span>
                    )}
                    <span className="text-xs text-[var(--clubpm-text-secondary)]">
                      {ACTIVITY_LABELS[activity.type] || activity.type}
                    </span>
                  </div>
                  {activity.metadata && (
                    <div className="text-xs text-[var(--clubpm-text-muted)] mt-1">
                      {activity.metadata.taskTitle && (
                        <span>
                          on <strong>{activity.metadata.taskTitle}</strong>
                        </span>
                      )}
                      {activity.metadata.oldStatus && activity.metadata.newStatus && (
                        <span>
                          {" "}
                          — {activity.metadata.oldStatus} → {activity.metadata.newStatus}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-[var(--clubpm-text-muted)] mt-1">
                    {new Date(activity.createdAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
