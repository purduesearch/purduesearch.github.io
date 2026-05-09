import { prisma } from "../db/prisma.js";
import type { ActivityType } from "@prisma/client";

// ── Activity Logging Service ─────────────────────────────────

export async function logActivity(data: {
  type: ActivityType;
  entityId: string;
  entityType: "Task" | "Project" | "Milestone";
  projectId?: string;
  memberId?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.activity.create({
    data: {
      type: data.type,
      entityId: data.entityId,
      entityType: data.entityType,
      projectId: data.projectId,
      memberId: data.memberId,
      metadata: (data.metadata as any) ?? undefined,
    },
    include: { member: true },
  });
}

export async function getProjectActivities(
  projectId: string,
  take = 50,
  cursor?: string
) {
  return prisma.activity.findMany({
    where: { projectId },
    include: { member: true },
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
}

export async function getEntityActivities(entityId: string, take = 30) {
  return prisma.activity.findMany({
    where: { entityId },
    include: { member: true },
    orderBy: { createdAt: "desc" },
    take,
  });
}
