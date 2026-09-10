import { prisma } from "../db/prisma.js";
import { boltApp } from "../slack/bolt.js";
import { shouldArchive, type RawSlackMessage } from "./slackArchivePolicy.js";
import { ensureChannelArchive, resolveAuthor } from "./slackArchiveService.js";
import { getBotUserId } from "./memberService.js";

/** One in-flight backfill per channel, per process. */
const running = new Set<string>();

const PAGE = 200;
/** conversations.history is Slack Tier 3 (~50 req/min). Stay well under. */
const PACE_MS = 1_200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tsToDate = (ts: string) => new Date(Math.round(parseFloat(ts) * 1000));

type HistoryMessage = RawSlackMessage & { reply_count?: number };

async function storeMessage(
  slackChannelId: string,
  msg: HistoryMessage,
  botUserId: string | undefined
): Promise<boolean> {
  // The SAME predicate as live ingest, so historical and live archives cannot
  // diverge in what they contain.
  const decision = shouldArchive(msg, botUserId);
  if (!decision.archive || decision.kind !== "new") return false;
  if (!msg.ts) return false;

  const author = msg.user
    ? await resolveAuthor(msg.user, boltApp.client)
    : { authorName: "Unknown", authorAvatarUrl: null, memberId: null };
  const postedAt = tsToDate(msg.ts);
  const threadTs = msg.thread_ts && msg.thread_ts !== msg.ts ? msg.thread_ts : null;

  const row = await prisma.slackMessage.upsert({
    where: { slackChannelId_ts: { slackChannelId, ts: msg.ts } },
    create: {
      slackChannelId,
      ts: msg.ts,
      threadTs,
      authorSlackId: msg.user ?? null,
      memberId: author.memberId,
      authorName: author.authorName,
      authorAvatarUrl: author.authorAvatarUrl,
      text: msg.text ?? "",
      postedAt,
    },
    update: {}, // replay is free — never clobber a live-ingested row
    select: { id: true },
  });

  for (const raw of msg.files ?? []) {
    const f = raw as { id?: string; name?: string; title?: string; mimetype?: string; size?: number; original_w?: number; original_h?: number };
    if (!f.id) continue;
    await prisma.slackMessageFile.upsert({
      where: { slackFileId: f.id },
      create: {
        messageId: row.id,
        slackFileId: f.id,
        name: f.name || f.title || f.id,
        mimeType: f.mimetype ?? null,
        sizeBytes: f.size ?? null,
        isImage: !!f.mimetype?.startsWith("image/"),
        width: f.original_w ?? null,
        height: f.original_h ?? null,
        // Backfilled files older than the 60-day cutoff are swept THAT NIGHT.
        // Intended: the cutoff is checked against postedAt, not ingest time.
        postedAt,
      },
      update: {}, // never reset `storage` — a replay must not undo a Drive mirror
    });
  }
  return true;
}

/** Import every reply in one thread, then recompute (never increment) the parent's count. */
async function storeThread(
  slackChannelId: string,
  parentTs: string,
  botUserId: string | undefined
): Promise<number> {
  let stored = 0;
  let cursor: string | undefined;
  do {
    await sleep(PACE_MS);
    const replies = await boltApp.client.conversations.replies({
      channel: slackChannelId,
      ts: parentTs,
      limit: PAGE,
      ...(cursor ? { cursor } : {}),
    });
    for (const r of (replies.messages ?? []) as HistoryMessage[]) {
      if (r.ts === parentTs) continue; // the parent repeats itself on every page
      if (await storeMessage(slackChannelId, r, botUserId)) stored++;
    }
    cursor = replies.response_metadata?.next_cursor || undefined;
  } while (cursor);

  const count = await prisma.slackMessage.count({
    where: { slackChannelId, threadTs: parentTs, deletedAt: null, NOT: { ts: parentTs } },
  });
  await prisma.slackMessage.updateMany({
    where: { slackChannelId, ts: parentTs },
    data: { replyCount: count },
  });
  return stored;
}

async function runBackfill(slackChannelId: string): Promise<void> {
  let stored = 0;

  try {
    const botUserId = (await getBotUserId(boltApp.client)) ?? undefined;

    // Resume from where a previous run stopped, if any.
    const prior = await prisma.slackChannelArchive.findUnique({
      where: { slackChannelId },
      select: { backfillCursor: true, backfillOldestTs: true },
    });
    let cursor = prior?.backfillCursor ?? undefined;
    let oldest = prior?.backfillOldestTs ?? null;

    for (;;) {
      const res = await boltApp.client.conversations.history({
        channel: slackChannelId,
        limit: PAGE,
        ...(cursor ? { cursor } : {}),
      });

      for (const m of (res.messages ?? []) as HistoryMessage[]) {
        if (await storeMessage(slackChannelId, m, botUserId)) stored++;
        if (m.ts) oldest = m.ts;
        if ((m.reply_count ?? 0) > 0 && m.ts) {
          stored += await storeThread(slackChannelId, m.ts, botUserId);
        }
      }

      cursor = res.response_metadata?.next_cursor || undefined;

      // Persist the cursor after EVERY page, so a crash or redeploy resumes
      // instead of restarting a large channel from scratch.
      await prisma.slackChannelArchive.update({
        where: { slackChannelId },
        data: { backfillCursor: cursor ?? null, backfillOldestTs: oldest },
      });

      if (!cursor) break;
      await sleep(PACE_MS);
    }

    await prisma.slackChannelArchive.update({
      where: { slackChannelId },
      data: {
        backfillStatus: "COMPLETE",
        backfilledAt: new Date(),
        backfillError: null,
        backfillCursor: null,
        messageCount: await prisma.slackMessage.count({ where: { slackChannelId } }),
      },
    });
    console.log(`📚 [slackArchive] backfill complete for ${slackChannelId} — ${stored} message(s) stored`);
  } catch (err) {
    console.error(`[slackArchive] backfill failed for ${slackChannelId}:`, err);
    // This runs detached, so a throw here would be an unhandled rejection.
    // The cursor from the last good page stays put for the next attempt.
    await prisma.slackChannelArchive
      .update({
        where: { slackChannelId },
        data: { backfillStatus: "FAILED", backfillError: String((err as Error)?.message ?? err).slice(0, 500) },
      })
      .catch((e) => console.error(`[slackArchive] could not record backfill failure for ${slackChannelId}:`, e));
  } finally {
    running.delete(slackChannelId);
  }
}

export async function startBackfill(slackChannelId: string): Promise<{ started: boolean; reason?: string }> {
  if (running.has(slackChannelId)) return { started: false, reason: "already_running" };
  // Claim the slot before the first await, or two near-simultaneous requests
  // would both pass the check above and run the same channel twice.
  running.add(slackChannelId);

  try {
    await ensureChannelArchive(slackChannelId, boltApp.client);
    await prisma.slackChannelArchive.update({
      where: { slackChannelId },
      data: { backfillStatus: "RUNNING", backfillError: null },
    });
  } catch (err) {
    running.delete(slackChannelId);
    throw err;
  }

  // Detached on purpose: the HTTP request returns immediately and the client
  // polls the status route.
  void runBackfill(slackChannelId);
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
