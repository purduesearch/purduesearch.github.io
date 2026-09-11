import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { boltApp } from "../slack/bolt.js";
import { shouldArchive, type RawSlackMessage } from "./slackArchivePolicy.js";
import { ensureChannelArchive, storeArchivedMessage } from "./slackArchiveService.js";
import { getBotUserId } from "./memberService.js";
import { resolveReadClient, setConversationMembers, syncConversationMembers } from "./slackMembershipService.js";
import { userClientFor } from "./slackUserTokenService.js";
import { hasCapability } from "./slackScopes.js";

/**
 * Resumable history import.
 *
 * NEVER creates notifications. Pings are delivered only from the live event
 * path (slack/events.ts), so importing 90 days of history cannot fire hundreds
 * of them (D10). Do not add a notify call here.
 */

/** One in-flight backfill per channel, per process. */
const running = new Set<string>();
/** One DM import per member, per process. */
const importing = new Set<string>();

const PAGE = 200;
/** conversations.history is Slack Tier 3 (~50 req/min). Stay well under. */
const PACE_MS = 1_200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type HistoryMessage = RawSlackMessage & { reply_count?: number };

async function storeMessage(channelId: string, msg: HistoryMessage, botUserId: string | undefined, client: WebClient): Promise<boolean> {
  // The SAME predicate as live ingest, so historical and live archives cannot diverge.
  const decision = shouldArchive(msg, botUserId);
  if (!decision.archive || decision.kind !== "new") return false;
  // overwrite: false — replay is free and never clobbers a live-ingested row.
  return !!(await storeArchivedMessage(channelId, msg, decision.isBot, client, { overwrite: false }));
}

async function storeThread(channelId: string, parentTs: string, botUserId: string | undefined, client: WebClient): Promise<number> {
  let stored = 0;
  let cursor: string | undefined;
  do {
    await sleep(PACE_MS);
    const replies = await client.conversations.replies({
      channel: channelId, ts: parentTs, limit: PAGE, ...(cursor ? { cursor } : {}),
    });
    for (const r of (replies.messages ?? []) as HistoryMessage[]) {
      if (r.ts === parentTs) continue; // the parent repeats itself on every page
      if (await storeMessage(channelId, r, botUserId, client)) stored++;
    }
    cursor = replies.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return stored;
}

async function runBackfill(channelId: string, client: WebClient): Promise<void> {
  let stored = 0;
  try {
    const botUserId = (await getBotUserId(boltApp.client)) ?? undefined;
    const prior = await prisma.slackChannelArchive.findUnique({
      where: { slackChannelId: channelId },
      select: { backfillCursor: true, backfillOldestTs: true },
    });
    let cursor = prior?.backfillCursor ?? undefined;
    let oldest = prior?.backfillOldestTs ?? null;

    for (;;) {
      const res = await client.conversations.history({ channel: channelId, limit: PAGE, ...(cursor ? { cursor } : {}) });
      for (const m of (res.messages ?? []) as HistoryMessage[]) {
        if (await storeMessage(channelId, m, botUserId, client)) stored++;
        if (m.ts) oldest = m.ts;
        if ((m.reply_count ?? 0) > 0 && m.ts) stored += await storeThread(channelId, m.ts, botUserId, client);
      }
      cursor = res.response_metadata?.next_cursor || undefined;
      // Persist after EVERY page so a crash or redeploy resumes, not restarts.
      await prisma.slackChannelArchive.update({
        where: { slackChannelId: channelId },
        data: { backfillCursor: cursor ?? null, backfillOldestTs: oldest },
      });
      if (!cursor) break;
      await sleep(PACE_MS);
    }

    await prisma.slackChannelArchive.update({
      where: { slackChannelId: channelId },
      data: {
        backfillStatus: "COMPLETE",
        backfilledAt: new Date(),
        backfillError: null,
        backfillCursor: null,
        messageCount: await prisma.slackMessage.count({ where: { slackChannelId: channelId } }),
      },
    });
    console.log(`📚 [slackArchive] backfill complete for ${channelId} — ${stored} message(s) stored`);
  } catch (err) {
    console.error(`[slackArchive] backfill failed for ${channelId}:`, err);
    await prisma.slackChannelArchive
      .update({
        where: { slackChannelId: channelId },
        data: { backfillStatus: "FAILED", backfillError: String((err as Error)?.message ?? err).slice(0, 500) },
      })
      .catch((e) => console.error(`[slackArchive] could not record backfill failure for ${channelId}:`, e));
  } finally {
    running.delete(channelId);
  }
}

/** Claim the slot, mark RUNNING, run to completion. Resolves when done. */
async function backfillNow(channelId: string, client: WebClient): Promise<void> {
  if (running.has(channelId)) return;
  running.add(channelId);
  try {
    await prisma.slackChannelArchive.update({
      where: { slackChannelId: channelId },
      data: { backfillStatus: "RUNNING", backfillError: null },
    });
  } catch (err) {
    running.delete(channelId);
    throw err;
  }
  await runBackfill(channelId, client);
}

/**
 * Admin- or member-triggered import of one conversation, with whichever token
 * can read it (bot, else the requester, else any participant).
 */
export async function startBackfill(
  channelId: string,
  opts: { requesterMemberId?: string } = {}
): Promise<{ started: boolean; reason?: string }> {
  if (running.has(channelId)) return { started: false, reason: "already_running" };
  await ensureChannelArchive(channelId, boltApp.client);
  const reader = await resolveReadClient(channelId, opts.requesterMemberId);
  if (!reader) return { started: false, reason: "no_reader" };
  // Detached: the HTTP request returns immediately and the client polls status.
  void backfillNow(channelId, reader.client).catch((err) =>
    console.error(`[slackArchive] backfill could not start for ${channelId}:`, err)
  );
  return { started: true };
}

export async function getBackfillStatus(slackChannelId: string) {
  const a = await prisma.slackChannelArchive.findUnique({ where: { slackChannelId } });
  return {
    status: a?.backfillStatus ?? "NOT_STARTED",
    cursor: a?.backfillCursor ?? null,
    error: a?.backfillError ?? null,
    messageCount: a?.messageCount ?? 0,
  };
}

/**
 * A member's own DMs and group DMs: discover them with THEIR token (the bot
 * can see none of them), record membership, then import each sequentially.
 */
export async function importMemberDms(memberId: string): Promise<{ started: boolean; conversations?: number; reason?: string }> {
  if (importing.has(memberId)) return { started: false, reason: "already_running" };
  const uc = await userClientFor(memberId);
  if (!uc) return { started: false, reason: "not_connected" };
  if (!hasCapability(uc.scopes, "read")) return { started: false, reason: "reconnect" };

  importing.add(memberId);
  const found: { id: string; kind: "IM" | "MPIM"; other?: string }[] = [];
  try {
    let cursor: string | undefined;
    do {
      const res = await uc.client.conversations.list({
        types: "im,mpim", exclude_archived: true, limit: 200, ...(cursor ? { cursor } : {}),
      });
      for (const c of (res.channels ?? []) as { id?: string; is_im?: boolean; user?: string }[]) {
        if (c.id) found.push({ id: c.id, kind: c.is_im ? "IM" : "MPIM", other: c.user });
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    for (const c of found) {
      await ensureChannelArchive(c.id, uc.client, { kind: c.kind });
      if (c.kind === "IM") await setConversationMembers(c.id, c.other ? [uc.slackId, c.other] : [uc.slackId]);
      else await syncConversationMembers(c.id, uc.client);
    }
  } catch (err) {
    importing.delete(memberId);
    throw err;
  }

  void (async () => {
    try {
      for (const c of found) {
        const a = await prisma.slackChannelArchive.findUnique({
          where: { slackChannelId: c.id },
          select: { backfillStatus: true },
        });
        if (a?.backfillStatus === "COMPLETE") continue;
        await backfillNow(c.id, uc.client).catch((err) =>
          console.error(`[slackArchive] DM import failed for ${c.id}:`, err)
        );
      }
    } finally {
      importing.delete(memberId);
    }
  })();

  return { started: true, conversations: found.length };
}

/** Admin: import every public channel not yet imported (bot token). */
export async function backfillAllPublicChannels(): Promise<{ queued: number }> {
  const rows = await prisma.slackChannelArchive.findMany({
    where: { kind: "CHANNEL", archiveEnabled: true, backfillStatus: { in: ["NOT_STARTED", "FAILED"] } },
    select: { slackChannelId: true },
  });
  void (async () => {
    for (const r of rows) {
      await backfillNow(r.slackChannelId, boltApp.client).catch((err) =>
        console.error(`[slackArchive] public backfill failed for ${r.slackChannelId}:`, err)
      );
    }
  })();
  return { queued: rows.length };
}
