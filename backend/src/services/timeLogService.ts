/**
 * One path for writing a TimeLog and its side effects (audit event, XP, challenge
 * hooks). Used by POST /api/tasks/:id/time-logs and by lab check-out splits.
 */
import type { TimeLog } from "@prisma/client";
import { logTime } from "./taskService.js";
import { logAuditEvent } from "./activityService.js";

export async function recordTimeLog(opts: {
  taskId: string;
  memberId: string;
  minutes: number;
  note?: string;
  source: "WEB" | "SLACK";
  labVisitId?: string;
  /** false for time from an auto-closed lab visit the member confirmed later. */
  grantXp?: boolean;
}): Promise<TimeLog> {
  const { taskId, memberId, minutes, note, source, labVisitId } = opts;
  const log = await logTime(taskId, memberId, minutes, note, labVisitId);

  logAuditEvent({
    taskId, memberId, source,
    eventType: "TIME_LOGGED",
    payload: { minutes, note: note ?? null, ...(labVisitId ? { labVisitId } : {}) },
  }).catch(console.error);

  // Engagement: award XP / doubloons proportional to hours logged (fire-and-forget)
  if (opts.grantXp !== false) {
    (async () => {
      const { handleTimeLog } = await import("./rewardService.js");
      await handleTimeLog(taskId, memberId, minutes);
    })().catch(err => console.error("[reward] handleTimeLog:", err));
  }

  // Challenge hooks
  (async () => {
    const { recordEvent } = await import("./challengeService.js");
    await recordEvent(memberId, "TIME_LOG_ENTRY", 1, { taskId });
    await recordEvent(memberId, "TIME_LOG_HOURS", minutes, { taskId });
    await recordEvent(memberId, "TIME_LOG_UNIQUE_TASKS", 1, { taskId });
    // TIME_LOG_WEEKDAY: tracked via DAILY_ACTIVE (streakService fires first action of day)
  })().catch(err => console.error("[challenge] timelog hooks:", err));

  return log;
}
