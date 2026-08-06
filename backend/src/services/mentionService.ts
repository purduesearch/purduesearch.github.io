import { prisma } from "../db/prisma.js";

/**
 * The one `@handle` pattern in the codebase. Task comments and blog review
 * comments both parse mentions; two regexes would drift, and a member who is
 * notified on a task but silently ignored on a draft is the worst kind of bug
 * to notice — nothing appears to be broken.
 */
const MENTION_RE = /@([a-zA-Z0-9._-]+)/g;

/** Handles named in `content`, deduped. A trailing dot is sentence punctuation. */
export function parseMentionHandles(content: string): string[] {
  const handles = [...content.matchAll(MENTION_RE)].map((m) =>
    m[1].replace(/\.$/, ""),
  );
  return [...new Set(handles.filter(Boolean))];
}

export interface MentionedMember {
  id: string;
  displayName: string;
  slackId: string | null;
}

/**
 * Members named by `@handle` in `content`. Matched on Slack handle first, since
 * that is what members actually type, with displayName as a fallback for people
 * who have never linked Slack.
 */
export async function findMentionedMembers(
  content: string,
): Promise<MentionedMember[]> {
  const handles = parseMentionHandles(content);
  if (handles.length === 0) return [];

  return prisma.member.findMany({
    where: {
      OR: [{ slackHandle: { in: handles } }, { displayName: { in: handles } }],
    },
    select: { id: true, displayName: true, slackId: true },
  });
}
