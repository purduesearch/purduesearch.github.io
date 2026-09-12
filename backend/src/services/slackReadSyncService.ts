import { prisma } from "../db/prisma.js";
import { userClientFor, clearSlackUserToken, isDeadTokenError, slackErrorCode } from "./slackUserTokenService.js";
import { hasCapability } from "./slackScopes.js";
import { advanceCursor, markSlackNotificationsRead } from "./slackReadService.js";

const SLACK_TYPES = ["SLACK_DM", "SLACK_MENTION", "SLACK_THREAD_REPLY", "SLACK_BROADCAST"] as const;
const MAX_PAIRS = 40;
/** conversations.info is Tier 3 (~50/min). 40 × 1.2s fits well inside the 2-minute cron. */
const PACE_MS = 1_200;

let running = false;

/**
 * Slack → Constellation read sync (D11).
 *
 * The Events API never reports that someone read a message in Slack
 * (channel_marked/im_marked are RTM-only), so this polls instead: for each
 * (member, conversation) that still has unread Slack notifications, ask Slack
 * for that member's last_read, then clear everything up to it. Bounded and
 * single-flight, so a slow Slack can't stack runs.
 */
export async function syncReadStateFromSlack(): Promise<{ checked: number; cleared: number }> {
  if (running) return { checked: 0, cleared: 0 };
  running = true;
  try {
    const pairs = await prisma.notification.findMany({
      where: { read: false, type: { in: [...SLACK_TYPES] }, slackChannelId: { not: null } },
      select: { recipientId: true, slackChannelId: true },
      distinct: ["recipientId", "slackChannelId"],
      take: MAX_PAIRS,
    });

    let checked = 0;
    let cleared = 0;
    for (const p of pairs) {
      const channelId = p.slackChannelId!;
      const uc = await userClientFor(p.recipientId);
      if (!uc || !hasCapability(uc.scopes, "read")) continue;
      try {
        const info = await uc.client.conversations.info({ channel: channelId });
        const lastRead = (info.channel as { last_read?: string } | undefined)?.last_read;
        checked++;
        // Slack omits last_read for some conversation types; nothing to sync then.
        if (lastRead && !/^0+\.0+$/.test(lastRead)) {
          await advanceCursor(p.recipientId, channelId, lastRead);
          cleared += (await markSlackNotificationsRead(p.recipientId, channelId, lastRead)).length;
        }
      } catch (err) {
        const code = slackErrorCode(err);
        if (isDeadTokenError(code)) await clearSlackUserToken(p.recipientId);
      }
      await new Promise((res) => setTimeout(res, PACE_MS));
    }
    return { checked, cleared };
  } finally {
    running = false;
  }
}
