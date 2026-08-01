import { prisma } from "../db/prisma.js";
import type { BlogThreadStatus } from "@prisma/client";

export type DocType = "BLOG_POST" | "PRESS_KIT" | "COURSE_SECTION";
export type DocRef = { docType: DocType; docId: string };

export type CreateThreadInput = {
  kind: "COMMENT" | "SUGGESTION";
  anchorText: string;
  body: string;
  replaceWith?: string;
  rationale?: string;
  origin?: "HUMAN" | "AI";
};

// ── Pure permission predicates ───────────────────────────────
// Kept pure and separately tested: these encode the whole review
// permission model, and getting them wrong is the failure that matters.

/**
 * ACCEPTED / REJECTED mutate the document, so only document editors
 * (creator, co-author, admin) may set them. RESOLVED / OPEN are bookkeeping:
 * editors on any thread, everyone else only on threads they started.
 */
export function canSetThreadStatus(args: {
  status: string;
  isDocEditor: boolean;
  isThreadCreator: boolean;
}): boolean {
  const { status, isDocEditor, isThreadCreator } = args;
  if (status === "ACCEPTED" || status === "REJECTED") return isDocEditor;
  if (status === "RESOLVED" || status === "OPEN") return isDocEditor || isThreadCreator;
  return false;
}

export function canDeleteComment(args: {
  isDocEditor: boolean;
  isCommentAuthor: boolean;
}): boolean {
  return args.isDocEditor || args.isCommentAuthor;
}

// ── Document access ──────────────────────────────────────────

const THREAD_INCLUDE = {
  createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  },
};

export async function docExists(ref: DocRef): Promise<boolean> {
  if (ref.docType === "BLOG_POST") {
    return !!(await prisma.blogPost.findUnique({ where: { id: ref.docId }, select: { id: true } }));
  }
  if (ref.docType === "COURSE_SECTION") {
    return !!(await prisma.courseSection.findUnique({ where: { id: ref.docId }, select: { id: true } }));
  }
  return !!(await prisma.projectPressKit.findUnique({ where: { id: ref.docId }, select: { id: true } }));
}

/**
 * Creator, co-author, or admin. Press kits have no co-authors — creator or admin.
 * A course section inherits its course's author: `course.createdById` or admin.
 */
export async function isDocEditor(ref: DocRef, memberId: string): Promise<boolean> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  if (member?.isAdmin) return true;

  if (ref.docType === "BLOG_POST") {
    const post = await prisma.blogPost.findUnique({
      where: { id: ref.docId },
      select: { createdById: true },
    });
    if (!post) return false;
    if (post.createdById === memberId) return true;
    const coAuthor = await prisma.blogAuthor.findUnique({
      where: { postId_memberId: { postId: ref.docId, memberId } },
      select: { id: true },
    });
    return !!coAuthor;
  }

  if (ref.docType === "COURSE_SECTION") {
    const section = await prisma.courseSection.findUnique({
      where: { id: ref.docId },
      select: { course: { select: { createdById: true } } },
    });
    return section?.course.createdById === memberId;
  }

  const kit = await prisma.projectPressKit.findUnique({
    where: { id: ref.docId },
    select: { createdById: true },
  });
  return kit?.createdById === memberId;
}

function whereForRef(ref: DocRef) {
  if (ref.docType === "BLOG_POST") return { postId: ref.docId };
  if (ref.docType === "COURSE_SECTION") return { courseSectionId: ref.docId };
  return { pressKitId: ref.docId };
}

export async function getThreadDocRef(threadId: string): Promise<DocRef | null> {
  const thread = await prisma.blogThread.findUnique({
    where: { id: threadId },
    select: { postId: true, pressKitId: true, courseSectionId: true },
  });
  if (!thread) return null;
  if (thread.postId) return { docType: "BLOG_POST", docId: thread.postId };
  if (thread.pressKitId) return { docType: "PRESS_KIT", docId: thread.pressKitId };
  if (thread.courseSectionId) return { docType: "COURSE_SECTION", docId: thread.courseSectionId };
  return null;
}

/**
 * The parent thread id of a comment, or null if no such comment exists.
 * Route handlers use this to confirm a `:cid` actually belongs to the `:id`
 * thread in the URL before making any permission decision — permissions are
 * derived from the thread's document, so an uncorrelated comment id would
 * otherwise be judged against the wrong document.
 */
export async function getCommentThreadId(commentId: string): Promise<string | null> {
  const comment = await prisma.blogThreadComment.findUnique({
    where: { id: commentId },
    select: { threadId: true },
  });
  return comment?.threadId ?? null;
}

// ── Reads / writes ───────────────────────────────────────────

export async function listThreads(ref: DocRef) {
  return prisma.blogThread.findMany({
    where: whereForRef(ref),
    include: THREAD_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

function threadById(id: string) {
  return prisma.blogThread.findUnique({ where: { id }, include: THREAD_INCLUDE });
}

export async function createThread(ref: DocRef, memberId: string, input: CreateThreadInput) {
  const thread = await prisma.blogThread.create({
    data: {
      ...whereForRef(ref),
      kind: input.kind,
      origin: input.origin ?? "HUMAN",
      anchorText: input.anchorText.slice(0, 2000),
      replaceWith: input.replaceWith ?? null,
      rationale: input.rationale ?? null,
      createdById: memberId,
      // The opening comment is optional for AI suggestions, whose explanation
      // lives in `rationale` instead.
      ...(input.body.trim()
        ? { comments: { create: { authorId: memberId, body: input.body.trim() } } }
        : {}),
    },
    include: THREAD_INCLUDE,
  });
  return thread;
}

export async function addComment(threadId: string, memberId: string, body: string) {
  await prisma.blogThreadComment.create({ data: { threadId, authorId: memberId, body: body.trim() } });
  return threadById(threadId);
}

export async function updateComment(commentId: string, memberId: string, body: string) {
  const comment = await prisma.blogThreadComment.findUnique({ where: { id: commentId } });
  if (!comment) return null;
  if (comment.authorId !== memberId) return null; // only the author edits their own text
  await prisma.blogThreadComment.update({ where: { id: commentId }, data: { body: body.trim() } });
  return threadById(comment.threadId);
}

export async function deleteComment(commentId: string, memberId: string, docEditor: boolean) {
  const comment = await prisma.blogThreadComment.findUnique({ where: { id: commentId } });
  if (!comment) return null;
  if (!canDeleteComment({ isDocEditor: docEditor, isCommentAuthor: comment.authorId === memberId })) {
    return null;
  }
  await prisma.blogThreadComment.delete({ where: { id: commentId } });
  return threadById(comment.threadId);
}

/**
 * Idempotent on terminal status: if the thread is already ACCEPTED/REJECTED,
 * the current state is returned unchanged. This is what makes two co-editors
 * racing on the same suggestion safe — the second caller learns the outcome
 * rather than overwriting it.
 */
export async function setThreadStatus(
  threadId: string,
  memberId: string,
  status: BlogThreadStatus,
  docEditor: boolean,
) {
  const thread = await prisma.blogThread.findUnique({ where: { id: threadId } });
  if (!thread) return null;

  if (thread.status === "ACCEPTED" || thread.status === "REJECTED") {
    return threadById(threadId);
  }
  if (!canSetThreadStatus({
    status,
    isDocEditor: docEditor,
    isThreadCreator: thread.createdById === memberId,
  })) {
    return null;
  }

  const terminal = status !== "OPEN";
  await prisma.blogThread.update({
    where: { id: threadId },
    data: {
      status,
      resolvedById: terminal ? memberId : null,
      resolvedAt: terminal ? new Date() : null,
    },
  });
  return threadById(threadId);
}
