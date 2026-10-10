import { prisma } from "../db/prisma.js";
import { createNotification } from "./notificationCrud.js";
import type { DocRef } from "./blogThreadService.js";

/**
 * The document's human-readable name and the people who own it. Returns null
 * when the document is gone, which every caller treats as "nothing to notify".
 */
async function docSummary(
  docRef: DocRef,
): Promise<{ label: string; recipientIds: string[] } | null> {
  if (docRef.docType === "BLOG_POST") {
    const post = await prisma.blogPost.findUnique({
      where: { id: docRef.docId },
      select: { title: true, createdById: true, authors: { select: { memberId: true } } },
    });
    if (!post) return null;
    return {
      label: post.title || "a draft",
      recipientIds: [post.createdById, ...post.authors.map((a) => a.memberId)],
    };
  }

  // A course section is a collaborative document like the other two, and
  // isDocEditor already treats the course author as its owner. Without this
  // branch the pressKit lookup below runs with a section id, finds nothing, and
  // every comment and mention on a course section is silently never delivered.
  if (docRef.docType === "COURSE_SECTION") {
    const section = await prisma.courseSection.findUnique({
      where: { id: docRef.docId },
      select: { title: true, course: { select: { title: true, createdById: true } } },
    });
    if (!section) return null;
    return {
      label: `${section.course.title} — ${section.title || "a section"}`,
      recipientIds: [section.course.createdById],
    };
  }

  const kit = await prisma.projectPressKit.findUnique({
    where: { id: docRef.docId },
    select: { createdById: true, project: { select: { name: true } } },
  });
  if (!kit) return null;
  return {
    label: `${kit.project?.name ?? "Project"} press kit`,
    recipientIds: [kit.createdById],
  };
}

/**
 * Ping each explicitly mentioned member; ordinary review activity stays silent.
 * Fire-and-forget — the comment is already written by the time this runs.
 *
 * Whether the mentioned member can actually open the document is not decided
 * here; the route answers that so the commenter can be offered a grant.
 */
export async function notifyMentions(args: {
  docRef: DocRef;
  actorId: string;
  threadId: string;
  members: { id: string; slackId: string | null }[];
  snippet: string;
}): Promise<void> {
  try {
    const { docRef, actorId, threadId, members, snippet } = args;
    if (members.length === 0) return;

    const summary = await docSummary(docRef);
    if (!summary) return;

    const actor = await prisma.member.findUnique({
      where: { id: actorId },
      select: { displayName: true },
    });
    const who = actor?.displayName ?? "Someone";
    const message = `${who} mentioned you on “${summary.label}”: ${snippet.slice(0, 120)}`;

    await Promise.all(members.map((m) =>
      createNotification({
        type: "BLOG_COMMENTED",
        recipientId: m.id,
        actorId,
        message,
        slackText: message,
        metadata: {
          threadId,
          docType: docRef.docType,
          docId: docRef.docId,
          mention: true,
        },
      })
    ));

  } catch (err) {
    console.error("[blogThreadNotify] mention notify failed:", err);
  }
}
