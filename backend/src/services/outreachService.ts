import { prisma } from "../db/prisma.js";
import type { SubmissionStatus, SubmissionType, HashtagStat } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────

interface CreateSubmissionInput {
  title: string;
  type: SubmissionType;
  status?: SubmissionStatus;
  content?: string;
  mediaUrls?: string[];
  platform?: string[];
  projectId?: string;
  eventId?: string;
  authorId: string;
  scheduledAt?: Date;
}

interface UpdateSubmissionInput {
  title?: string;
  type?: SubmissionType;
  status?: SubmissionStatus;
  content?: string;
  mediaUrls?: string[];
  platform?: string[];
  projectId?: string | null;
  eventId?: string | null;
  reviewerId?: string | null;
  reviewNote?: string | null;
  scheduledAt?: Date | null;
  publishedAt?: Date | null;
}

interface ListSubmissionsFilters {
  status?: SubmissionStatus;
  type?: SubmissionType;
  projectId?: string;
  authorId?: string;
  from?: Date;
  to?: Date;
}

// ── Shared include for list/get ──────────────────────────────

const submissionListInclude = {
  author: { select: { id: true, displayName: true, avatarUrl: true } },
  project: { select: { id: true, name: true } },
  event: { select: { id: true, title: true, startTime: true } },
} as const;

const submissionDetailInclude = {
  author: true,
  reviewer: { select: { id: true, displayName: true, avatarUrl: true } },
  project: { select: { id: true, name: true } },
  event: { select: { id: true, title: true, startTime: true, type: true } },
} as const;

// ── Service ──────────────────────────────────────────────────

export async function createSubmission(data: CreateSubmissionInput) {
  const submission = await prisma.outreachSubmission.create({
    data: {
      title: data.title,
      type: data.type,
      status: data.status ?? "DRAFT",
      content: data.content,
      mediaUrls: data.mediaUrls ?? [],
      platform: data.platform ?? [],
      authorId: data.authorId,
      ...(data.projectId ? { projectId: data.projectId } : {}),
      ...(data.eventId ? { eventId: data.eventId } : {}),
      ...(data.scheduledAt ? { scheduledAt: data.scheduledAt } : {}),
    },
    include: submissionDetailInclude,
  });
  if (data.content) {
    recordHashtagUsage(data.content).catch(console.error);
  }
  return submission;
}

export async function updateSubmission(id: string, data: UpdateSubmissionInput) {
  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.mediaUrls !== undefined) updateData.mediaUrls = data.mediaUrls;
  if (data.platform !== undefined) updateData.platform = data.platform;
  if (data.reviewNote !== undefined) updateData.reviewNote = data.reviewNote;
  if (data.scheduledAt !== undefined) updateData.scheduledAt = data.scheduledAt;
  if (data.publishedAt !== undefined) updateData.publishedAt = data.publishedAt;

  if (data.projectId !== undefined) updateData.projectId = data.projectId;
  if (data.eventId !== undefined) updateData.eventId = data.eventId;
  if (data.reviewerId !== undefined) updateData.reviewerId = data.reviewerId;

  const updated = await prisma.outreachSubmission.update({
    where: { id },
    data: updateData,
    include: submissionDetailInclude,
  });
  if (data.content) {
    recordHashtagUsage(data.content).catch(console.error);
  }
  return updated;
}

export async function deleteSubmission(id: string) {
  return prisma.outreachSubmission.delete({ where: { id } });
}

export async function listSubmissions(filters: ListSubmissionsFilters) {
  const where: Record<string, unknown> = {};

  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.authorId) where.authorId = filters.authorId;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  return prisma.outreachSubmission.findMany({
    where,
    include: submissionListInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getSubmission(id: string) {
  return prisma.outreachSubmission.findUnique({
    where: { id },
    include: submissionDetailInclude,
  });
}

export async function reviewSubmission(
  id: string,
  reviewerId: string,
  status: "APPROVED" | "REJECTED" | "IN_REVIEW",
  note?: string
) {
  return prisma.outreachSubmission.update({
    where: { id },
    data: {
      status,
      reviewerId,
      reviewNote: note ?? null,
    },
    include: submissionDetailInclude,
  });
}

export async function getOutreachDigest() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [recentMilestonesRaw, upcomingEventsRaw, pendingCount, approvedCount] =
    await Promise.all([
      prisma.milestone.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: thirtyDaysAgo },
        },
        select: {
          title: true,
          completedAt: true,
          project: { select: { name: true } },
        },
        orderBy: { completedAt: "desc" },
        take: 5,
      }),
      prisma.event.findMany({
        where: {
          startTime: { gte: now, lte: thirtyDaysAhead },
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          type: true,
        },
        orderBy: { startTime: "asc" },
        take: 5,
      }),
      prisma.outreachSubmission.count({
        where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } },
      }),
      prisma.outreachSubmission.count({
        where: { status: "APPROVED" },
      }),
    ]);

  return {
    recentMilestones: recentMilestonesRaw.map((m) => ({
      projectName: m.project.name,
      milestoneTitle: m.title,
      completedAt: (m.completedAt ?? now).toISOString(),
    })),
    upcomingEvents: upcomingEventsRaw.map((e) => ({
      id: e.id,
      title: e.title,
      startTime: e.startTime.toISOString(),
      type: e.type,
    })),
    pendingSubmissions: pendingCount,
    approvedSubmissions: approvedCount,
  };
}

export async function getContentCalendar(from: Date, to: Date) {
  return prisma.outreachSubmission.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
    },
    include: submissionListInclude,
    orderBy: { scheduledAt: "asc" },
  });
}

export async function listComments(submissionId: string) {
  return prisma.outreachComment.findMany({
    where: { submissionId, parentId: null },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      replies: {
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function addComment(
  submissionId: string,
  authorId: string,
  body: string,
  mentions: string[] = [],
  parentId?: string
) {
  if (parentId) {
    const parent = await prisma.outreachComment.findUnique({ where: { id: parentId } });
    if (!parent || parent.submissionId !== submissionId) {
      throw new Error("Invalid parentId: comment does not belong to this submission");
    }
  }
  return prisma.outreachComment.create({
    data: { submissionId, authorId, body, mentions, parentId },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });
}

// ── Hashtag utilities ────────────────────────────────────────

export async function recordHashtagUsage(content: string) {
  if (!content?.trim()) return;
  const tags = content.match(/\B#[a-zA-Z][a-zA-Z0-9_]*/g) ?? [];
  const unique = [...new Set(tags.map(t => t.toLowerCase()))];
  const now = new Date();
  await Promise.all(
    unique.map(tag =>
      prisma.hashtagStat.upsert({
        where: { tag },
        update: { useCount: { increment: 1 }, lastUsedAt: now },
        create: { tag, useCount: 1, lastUsedAt: now },
      })
    )
  );
}

export async function seedHashtagsFromSubmissions(): Promise<number> {
  const submissions = await prisma.outreachSubmission.findMany({
    where: { status: { in: ['APPROVED', 'PUBLISHED'] }, content: { not: null } },
    select: { content: true },
  });

  const tagCounts = new Map<string, number>();
  for (const s of submissions) {
    const matches = s.content?.match(/\B#[a-zA-Z][a-zA-Z0-9_]*/g) ?? [];
    for (const tag of matches) {
      const norm = tag.toLowerCase();
      tagCounts.set(norm, (tagCounts.get(norm) ?? 0) + 1);
    }
  }

  const now = new Date();
  await Promise.all(
    [...tagCounts.entries()].map(([tag, count]) =>
      prisma.hashtagStat.upsert({
        where: { tag },
        update: { useCount: { increment: count }, lastUsedAt: now },
        create: { tag, useCount: count, lastUsedAt: now },
      })
    )
  );

  return tagCounts.size;
}

export async function listHashtags(query?: string): Promise<HashtagStat[]> {
  return prisma.hashtagStat.findMany({
    where: query
      ? { tag: { contains: query.toLowerCase() } }
      : undefined,
    orderBy: [{ useCount: 'desc' }, { tag: 'asc' }],
    take: 30,
  });
}

export type { CreateSubmissionInput, UpdateSubmissionInput, ListSubmissionsFilters };
