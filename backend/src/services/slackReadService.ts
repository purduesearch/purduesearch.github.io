import { prisma } from "../db/prisma.js";
import { userClientFor, clearSlackUserToken, isDeadTokenError, slackErrorCode } from "./slackUserTokenService.js";
import { hasCapability } from "./slackScopes.js";

/**
 * Pure. Order two Slack ts strings exactly. Seconds are compared as numbers
 * (string order puts "10" before "9"); the microsecond fraction as zero-padded
 * digits (a float would round the last digits away).
 */
export function compareTs(a: string, b: string): number {
  const [as, af = ""] = a.split(".");
  const [bs, bf = ""] = b.split(".");
  const sa = Number(as) || 0;
  const sb = Number(bs) || 0;
  if (sa !== sb) return sa < sb ? -1 : 1;
  const fa = af.padEnd(6, "0");
  const fb = bf.padEnd(6, "0");
  return fa === fb ? 0 : fa < fb ? -1 : 1;
}

/** Pure. The notifications a read position at `lastReadTs` covers. */
export function idsReadUpTo(notifs: { id: string; slackTs: string | null }[], lastReadTs: string): string[] {
  return notifs.filter((n) => !!n.slackTs && compareTs(n.slackTs, lastReadTs) <= 0).map((n) => n.id);
}

export function tsToDate(ts: string): Date {
  return new Date(Math.round(parseFloat(ts) * 1000));
}

/**
 * Unread top-level messages per conversation, by others, after the member's
 * read cursor. Nothing before the moment they connected Slack counts
 * (slackUserTokenAt) — otherwise a fresh DM import would show 90 days unread.
 */
export async function unreadCounts(
  member: { id: string; slackId: string; slackUserTokenAt: Date | null },
  channelIds: string[]
): Promise<Record<string, number>> {
  if (!member.slackUserTokenAt || channelIds.length === 0) return {};
  const floor = member.slackUserTokenAt;
  const rows = await prisma.$queryRaw<{ slackChannelId: string; unread: number }[]>`
    SELECT m."slackChannelId", COUNT(*)::int AS unread
    FROM "SlackMessage" m
    LEFT JOIN "SlackReadCursor" c
      ON c."slackChannelId" = m."slackChannelId" AND c."memberId" = ${member.id}
    WHERE m."slackChannelId" = ANY(${channelIds})
      AND m."threadTs" IS NULL
      AND m."deletedAt" IS NULL
      AND (m."authorSlackId" IS NULL OR m."authorSlackId" <> ${member.slackId})
      AND m."postedAt" > GREATEST(COALESCE(c."lastReadAt", ${floor}), ${floor})
    GROUP BY m."slackChannelId"`;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.slackChannelId] = r.unread;
  return out;
}

/** Move a read cursor forward only. True if it moved. */
export async function advanceCursor(memberId: string, channelId: string, ts: string): Promise<boolean> {
  const where = { memberId_slackChannelId: { memberId, slackChannelId: channelId } };
  const cur = await prisma.slackReadCursor.findUnique({ where, select: { lastReadTs: true } });
  if (cur && compareTs(ts, cur.lastReadTs) <= 0) return false;
  const at = tsToDate(ts);
  await prisma.slackReadCursor.upsert({
    where,
    create: { memberId, slackChannelId: channelId, lastReadTs: ts, lastReadAt: at },
    update: { lastReadTs: ts, lastReadAt: at },
  });
  return true;
}

/**
 * The member has seen `channelId` up to `ts`.
 *
 * pushToSlack — also move Slack's own read cursor, which clears the Slack
 * unread badge (D11). False when the read CAME from Slack, or when the
 * member's own post already marked it read there.
 */
export async function markConversationRead(
  memberId: string,
  channelId: string,
  ts: string,
  opts: { pushToSlack: boolean }
): Promise<{ advanced: boolean }> {
  const advanced = await advanceCursor(memberId, channelId, ts);
  if (advanced && opts.pushToSlack) {
    const uc = await userClientFor(memberId, { interactive: true });
    if (uc && hasCapability(uc.scopes, "mark")) {
      try {
        await uc.client.conversations.mark({ channel: channelId, ts });
      } catch (err) {
        const code = slackErrorCode(err);
        if (isDeadTokenError(code)) await clearSlackUserToken(memberId);
        else console.warn(`[slackPortal] conversations.mark failed for ${channelId}: ${code}`);
      }
    }
  }
  return { advanced };
}
