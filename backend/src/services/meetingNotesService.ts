import { prisma } from "../db/prisma.js";

// ── Types ────────────────────────────────────────────────────

interface ProjectSummary {
  id: string;
  name: string;
  tasksCreated: number;
  tasksCompleted: number;
  tasksBlocked: number;
  tasksOverdue: number;
  milestonesCompleted: string[];
  milestoneStatusChanges: Array<{ title: string; from: string; to: string }>;
  keyChanges: Array<{ description: string; timestamp: string }>;
}

interface MeetingTemplate {
  generatedAt: string;
  weekRange: { start: string; end: string };
  projects: ProjectSummary[];
  clubWide: {
    totalTasksCompleted: number;
    totalNewTasks: number;
    velocityDelta: string;
    membersActive: number;
  };
  agendaTemplate: string;
}

// ── Helper ───────────────────────────────────────────────────

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function computeVelocityDelta(current: number, previous: number): string {
  if (previous === 0 && current === 0) return "→ Steady";
  if (previous === 0) return `↑ ${current > 0 ? "∞" : "0"}%`;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return `↑ ${pct}%`;
  if (pct < 0) return `↓ ${Math.abs(pct)}%`;
  return "→ Steady";
}

// ── Main export ──────────────────────────────────────────────

export async function generateWeeklyMeetingTemplate(
  weekEndDate?: Date
): Promise<MeetingTemplate> {
  const now = new Date();
  const weekEnd = weekEndDate ?? now;

  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const prevWeekEnd = new Date(weekStart);
  const prevWeekStart = new Date(weekEnd);
  prevWeekStart.setDate(prevWeekStart.getDate() - 14);

  // ── Fetch all active projects ────────────────────────────
  const activeProjects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // ── Per-project stats ────────────────────────────────────
  const projectSummaries: ProjectSummary[] = await Promise.all(
    activeProjects.map(async (project): Promise<ProjectSummary> => {
      const [
        tasksCreated,
        tasksCompleted,
        tasksBlocked,
        tasksOverdue,
        completedMilestones,
        recentLogs,
        milestoneLogs,
      ] = await Promise.all([
        // Tasks created this week
        prisma.task.count({
          where: {
            projectId: project.id,
            createdAt: { gte: weekStart, lte: weekEnd },
          },
        }),
        // Tasks completed this week
        prisma.task.count({
          where: {
            projectId: project.id,
            status: "DONE",
            updatedAt: { gte: weekStart, lte: weekEnd },
          },
        }),
        // Currently blocked tasks
        prisma.task.count({
          where: {
            projectId: project.id,
            status: "BLOCKED",
          },
        }),
        // Overdue tasks (not done, due date in the past)
        prisma.task.count({
          where: {
            projectId: project.id,
            status: { not: "DONE" },
            dueDate: { lt: now },
          },
        }),
        // Milestones completed this week
        prisma.milestone.findMany({
          where: {
            projectId: project.id,
            status: "COMPLETED",
            completedAt: { gte: weekStart, lte: weekEnd },
          },
          select: { title: true },
        }),
        // Recent activity log entries (key changes), limited to 5
        prisma.activityLog.findMany({
          where: {
            projectId: project.id,
            createdAt: { gte: weekStart, lte: weekEnd },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { eventType: true, payload: true, createdAt: true },
        }),
        // Milestone-related activity log entries for status changes
        prisma.activityLog.findMany({
          where: {
            projectId: project.id,
            createdAt: { gte: weekStart, lte: weekEnd },
            eventType: {
              in: ["TASK_UPDATED", "PROJECT_UPDATED"],
            },
          },
          select: { payload: true, createdAt: true },
        }),
      ]);

      // Build keyChanges from ActivityLog
      const keyChanges = recentLogs.map((log) => {
        const payload = log.payload as Record<string, unknown>;
        const description =
          (typeof payload.taskTitle === "string" ? payload.taskTitle : null) ??
          log.eventType.replace(/_/g, " ").toLowerCase();
        return {
          description,
          timestamp: log.createdAt.toISOString(),
        };
      });

      // Build milestoneStatusChanges from relevant log payloads
      const milestoneStatusChanges: Array<{
        title: string;
        from: string;
        to: string;
      }> = [];

      for (const log of milestoneLogs) {
        const payload = log.payload as Record<string, unknown>;
        const changes = payload.changes as
          | Array<{ field: string; from: string; to: string }>
          | undefined;
        if (Array.isArray(changes)) {
          for (const change of changes) {
            if (
              change.field === "status" &&
              typeof payload.taskTitle === "string"
            ) {
              milestoneStatusChanges.push({
                title: payload.taskTitle,
                from: change.from,
                to: change.to,
              });
            }
          }
        }
      }

      return {
        id: project.id,
        name: project.name,
        tasksCreated,
        tasksCompleted,
        tasksBlocked,
        tasksOverdue,
        milestonesCompleted: completedMilestones.map((m) => m.title),
        milestoneStatusChanges,
        keyChanges,
      };
    })
  );

  // ── Club-wide stats ──────────────────────────────────────
  const totalTasksCompleted = projectSummaries.reduce(
    (sum, p) => sum + p.tasksCompleted,
    0
  );
  const totalNewTasks = projectSummaries.reduce(
    (sum, p) => sum + p.tasksCreated,
    0
  );

  // Previous week's completed tasks for velocity comparison
  const prevWeekCompleted = await prisma.task.count({
    where: {
      status: "DONE",
      updatedAt: { gte: prevWeekStart, lte: prevWeekEnd },
      project: { status: "ACTIVE" },
    },
  });

  const velocityDelta = computeVelocityDelta(totalTasksCompleted, prevWeekCompleted);

  // Count distinct active members this week
  const activeMemberRows = await prisma.activityLog.findMany({
    where: {
      createdAt: { gte: weekStart, lte: weekEnd },
      memberId: { not: null },
    },
    select: { memberId: true },
    distinct: ["memberId"],
  });
  const membersActive = activeMemberRows.length;

  // ── Build agenda markdown ────────────────────────────────
  const dateLabel = formatDateLabel(weekEnd);

  let agenda = `# Leadership Meeting — ${dateLabel}\n`;
  agenda += `## Quick Stats\n`;
  agenda += `- Tasks completed: ${totalTasksCompleted} | New tasks: ${totalNewTasks} | Active members: ${membersActive}\n`;
  agenda += `- Velocity: ${velocityDelta}\n\n`;
  agenda += `## Project Updates\n`;

  for (const p of projectSummaries) {
    agenda += `### ${p.name}\n`;
    agenda += `- ✅ ${p.tasksCompleted} tasks completed, ${p.tasksCreated} new tasks created\n`;
    agenda += `- ⚠️ ${p.tasksBlocked} blocked tasks, ${p.tasksOverdue} overdue tasks\n`;
    for (const milestone of p.milestonesCompleted) {
      agenda += `- 🎯 Milestone "${milestone}" completed\n`;
    }
    for (const change of p.keyChanges) {
      agenda += `- ${change.description}\n`;
    }
    agenda += `\n`;
  }

  agenda += `## Discussion Items\n`;
  agenda += `- [ ] _Add discussion items here_\n\n`;
  agenda += `## Action Items\n`;
  agenda += `- [ ] _Add action items here_\n`;

  // ── Assemble template ────────────────────────────────────
  return {
    generatedAt: now.toISOString(),
    weekRange: {
      start: weekStart.toISOString(),
      end: weekEnd.toISOString(),
    },
    projects: projectSummaries,
    clubWide: {
      totalTasksCompleted,
      totalNewTasks,
      velocityDelta,
      membersActive,
    },
    agendaTemplate: agenda,
  };
}
