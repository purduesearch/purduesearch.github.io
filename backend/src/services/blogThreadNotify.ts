import { prisma } from "../db/prisma.js";
import { createNotification } from "./notificationCrud.js";
import { queueDm } from "./dmBatcher.js";
import type { DocRef } from "./blogThreadService.js";

/**
 * Tell a draft's authors that someone reviewed it. Fire-and-forget: a review
 * comment must still succeed if Slack or the notification write fails, so this
 * never throws and callers do not await it.
 */
export async function notifyThreadActivity(args: {
  docRef: DocRef;
  actorId: string;
  threadId: string;
  kind: "COMMENT" | "SUGGESTION";
  snippet: string;
}): Promise<void> {
  try {
    const { docRef, actorId, kind, snippet } = args;

    let recipientIds: string[] = [];
    let label = "a draft";

    if (docRef.docType === "BLOG_POST") {
      const post = await prisma.blogPost.findUnique({
        where: { id: docRef.docId },
        select: { title: true, createdById: true, authors: { select: { memberId: true } } },
      });
      if (!post) return;
      label = post.title || "a draft";
      recipientIds = [post.createdById, ...post.authors.map((a) => a.memberId)];
    } else {
      const kit = await prisma.projectPressKit.findUnique({
        where: { id: docRef.docId },
        select: { createdById: true, project: { select: { name: true } } },
      });
      if (!kit) return;
      label = `${kit.project?.name ?? "Project"} press kit`;
      recipientIds = [kit.createdById];
    }

    // Never notify the person who just acted.
    const targets = [...new Set(recipientIds)].filter((id) => id && id !== actorId);
    if (targets.length === 0) return;

    const actor = await prisma.member.findUnique({
      where: { id: actorId },
      select: { displayName: true },
    });
    const who = actor?.displayName ?? "Someone";
    const verb = kind === "SUGGESTION" ? "suggested an edit on" : "commented on";
    const message = `${who} ${verb} “${label}”: ${snippet.slice(0, 120)}`;

    const members = await prisma.member.findMany({
      where: { id: { in: targets } },
      select: { id: true, slackId: true },
    });

    await Promise.all(members.map((m) =>
      createNotification({
        type: "BLOG_COMMENTED",
        recipientId: m.id,
        actorId,
        message,
        metadata: { threadId: args.threadId, docType: docRef.docType, docId: docRef.docId },
      })
    ));

    members.forEach((m) => { if (m.slackId) queueDm(m.slackId, message); });
  } catch (err) {
    console.error("[blogThreadNotify] failed:", err);
  }
}
