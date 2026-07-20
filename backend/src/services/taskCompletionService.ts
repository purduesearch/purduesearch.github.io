import type { NotificationType } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { logAuditEvent } from "./activityService.js";
import { createNotification } from "./notificationCrud.js";
import { queueDm } from "./dmBatcher.js";
import { getTask, updateTask } from "./taskService.js";
import { octokitForRepo, parseRepoUrl, getPull } from "./githubService.js";

// ── Shared task-completion side effects ─────────────────────────────
//
// PATCH /api/tasks/:id and PATCH /api/tasks/bulk both need to run the same
// →DONE transition side effects (CI gate, XP/doubloon grant, challenge
// progress, milestone health refresh, audit trail, completed-notification
// fan-out) so bulk completions (used by ProjectDetail's kanban group drag)
// grant the same rewards as a single-task completion instead of silently
// skipping them.

type ExistingTask = NonNullable<Awaited<ReturnType<typeof getTask>>>;
type UpdatedTask = Awaited<ReturnType<typeof updateTask>>;

// ── CI gate ──────────────────────────────────────────────────────────
//
// If the linked PR's own repo (ProjectRepo, multi-repo Workstream B) requires
// passing CI and the most recent CI signal for the task's open/draft PR in
// that repo is a failure, the →DONE transition is blocked. Must be called
// BEFORE the task is updated (mirrors the inline check that used to live in
// PATCH /:id).
//
// Gating is now per-repo (`ProjectRepo.blockDoneOnCiFail`), not per-project
// (`Project.githubBlockDoneOnCiFail`, retained only for pre-migration data).
// A task can have PR links across multiple repos; each is checked against
// its own repo's gating flag. If a linked PR's repo has no `ProjectRepo` row
// (not yet migrated / repo since removed), gating is treated as disabled for
// that PR rather than blocking the transition.
//
// `actorMemberId` is optional — existing callers (PATCH /api/tasks/:id,
// PATCH /api/tasks/bulk) don't thread the acting member through yet. When
// present it's used to fetch an authenticated Octokit (via `octokitForRepo`)
// for a live CI-status check; otherwise (or if no Octokit can be built) this
// falls back to the most-recently-recorded webhook CI activity, same as
// before.
export async function assertCiGatePasses(
  taskId: string,
  projectId: string,
  actorMemberId?: string
): Promise<string | null> {
  const openPrLinks = await prisma.gitHubLink.findMany({
    where: { taskId, kind: "PR", state: { in: ["open", "draft"] } },
  });
  if (openPrLinks.length === 0) return null;

  for (const openPr of openPrLinks) {
    const projectRepo = await prisma.projectRepo.findFirst({
      where: { projectId, slug: openPr.repoFullName },
    });
    // No ProjectRepo row for this PR's repo → gating disabled for it.
    if (!projectRepo?.blockDoneOnCiFail) continue;

    let ciFailed: boolean | null = null;

    // Prefer a live check against GitHub when we can build an authenticated client.
    if (openPr.refNumber) {
      const ref = parseRepoUrl(openPr.repoFullName);
      if (ref) {
        const o = await octokitForRepo(projectRepo.id, actorMemberId);
        if (o) {
          const pr = await getPull(o, ref, openPr.refNumber);
          if (pr && pr.checksStatus !== "none") {
            ciFailed = pr.checksStatus === "failure";
          }
        }
      }
    }

    // Fall back to the most recently recorded webhook CI activity for this task.
    if (ciFailed === null) {
      const lastCi = await prisma.activityLog.findFirst({
        where: {
          taskId,
          eventType: { in: ["GITHUB_CI_PASSED", "GITHUB_CI_FAILED"] },
        },
        orderBy: { createdAt: "desc" },
      });
      ciFailed = lastCi?.eventType === "GITHUB_CI_FAILED";
    }

    if (ciFailed) {
      return "Cannot mark as done: a linked PR has failing CI checks. Resolve them or disable CI gating in project settings.";
    }
  }

  return null;
}

// ── DONE-transition side effects ──────────────────────────────────────
//
// Only call this AFTER updateTask has moved the task's status to DONE.
// Returns the reward summary + progress milestones so the caller (single
// or bulk route) can merge them into its JSON response for the frontend
// reward dispatcher (XP bar, +XP particles, rank-up modal, progress toasts).
export async function applyCompletionSideEffects(opts: {
  taskId: string;
  actorId: string;
  existingTask: ExistingTask;
  updatedTask: UpdatedTask;
}): Promise<{
  actorReward: import("./rewardService.js").ActorRewardSummary | null;
  progressMilestones: import("./challengeService.js").ProgressMilestone[];
}> {
  const { taskId, actorId, existingTask, updatedTask } = opts;

  // Audit log — fire-and-forget, never block the caller
  logAuditEvent({
    taskId, memberId: actorId ?? null, source: "WEB",
    eventType: "TASK_COMPLETED", payload: { taskTitle: updatedTask.title },
  }).catch(console.error);

  // Completed-notification fan-out — fire-and-forget. (No actor/project
  // lookup needed here — unlike the TASK_ASSIGNED notification in the route,
  // this message doesn't interpolate the actor's display name or project.)
  (async () => {
    for (const assignee of (updatedTask.assignees ?? [])) {
      if ((assignee as any).id === actorId) continue;
      await createNotification({
        type: "TASK_COMPLETED" as NotificationType,
        recipientId: (assignee as any).id,
        actorId,
        projectId: updatedTask.projectId,
        taskId,
        message: `Task "${updatedTask.title}" was marked done`,
      });
      if ((assignee as any).slackId) queueDm((assignee as any).slackId, `✅ Task *${updatedTask.title}* was marked done`);
    }
  })().catch(console.error);

  // Milestone health refresh — fire-and-forget
  if ((updatedTask as any).milestoneId) {
    const { refreshMilestoneHealth } = await import("./milestoneService.js");
    refreshMilestoneHealth((updatedTask as any).milestoneId).catch(console.error);
  }

  // Engagement grant — awaited so the caller can surface reward deltas
  let actorReward: import("./rewardService.js").ActorRewardSummary | null = null;
  try {
    const { handleTaskComplete } = await import("./rewardService.js");
    const full = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true, title: true, dueDate: true, createdById: true,
        assignees: { select: { id: true } },
      },
    });
    if (full) actorReward = await handleTaskComplete(full, actorId);
  } catch (err) {
    console.error("[reward] handleTaskComplete:", err);
  }

  // Per-assignee challenge hooks — awaited so the caller can surface
  // progress milestones (frontend toasts at 25/50/75% bands)
  let progressMilestones: import("./challengeService.js").ProgressMilestone[] = [];
  try {
    const { recordEvent } = await import("./challengeService.js");
    for (const assignee of ((updatedTask.assignees ?? []) as any[])) {
      progressMilestones = progressMilestones.concat(
        await recordEvent(assignee.id, "TASK_COMPLETED", 1, { taskId })
      );
      if (existingTask.status === "IN_PROGRESS") {
        progressMilestones = progressMilestones.concat(
          await recordEvent(assignee.id, "TASK_MOVED_INPROGRESS_TO_DONE", 1)
        );
      }
    }
  } catch (err) {
    console.error("[challenge] task completion hooks:", err);
  }

  return { actorReward, progressMilestones };
}
