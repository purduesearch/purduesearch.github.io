import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { userClientFor, clearSlackUserToken, isDeadTokenError, slackErrorCode } from "./slackUserTokenService.js";
import { hasCapability, type SlackCapability } from "./slackScopes.js";
import { ensureChannelArchive, storeArchivedMessage, applyReaction, emitChat } from "./slackArchiveService.js";
import { setConversationMembers, addConversationMember } from "./slackMembershipService.js";
import { markConversationRead } from "./slackReadService.js";
import { startBackfill } from "./slackBackfillService.js";
import { mapSlackError, type SlackFailure } from "./slackSendRules.js";
import type { ConversationKind } from "./slackConversationAccess.js";
import type { RawSlackMessage } from "./slackArchivePolicy.js";

/** Everything here acts AS the member with their own user token (D1). */

export class SendError extends Error {
  constructor(public readonly failure: SlackFailure) {
    super(failure.message);
  }
}

type Actor = { client: WebClient; slackId: string };

async function actAs(memberId: string, caps: SlackCapability[]): Promise<Actor> {
  // interactive: fail fast on a rate limit — the member is waiting on a button.
  const uc = await userClientFor(memberId, { interactive: true });
  if (!uc || !caps.every((c) => hasCapability(uc.scopes, c))) throw new SendError(mapSlackError("missing_scope"));
  return { client: uc.client, slackId: uc.slackId };
}

async function call<T>(memberId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const code = (err as { code?: string }).code === "slack_webapi_rate_limited_error" ? "ratelimited" : slackErrorCode(err);
    if (isDeadTokenError(code)) await clearSlackUserToken(memberId);
    throw new SendError(mapSlackError(code));
  }
}

export async function sendMessage(
  memberId: string,
  channelId: string,
  convKind: ConversationKind,
  input: { text: string; threadTs?: string; broadcast?: boolean }
): Promise<{ ts: string }> {
  const me = await actAs(memberId, ["post"]);
  const args = input.threadTs
    ? { channel: channelId, text: input.text, thread_ts: input.threadTs, reply_broadcast: !!input.broadcast, unfurl_links: true }
    : { channel: channelId, text: input.text, unfurl_links: true };
  const res = await call(memberId, () => me.client.chat.postMessage(args));
  const ts = res.ts as string;
  const posted = (res.message ?? {}) as RawSlackMessage;

  // D7: write the row from Slack's answer now. The echo event upserts the same
  // (channel, ts), so this is idempotent; forceHuman pins isBot = false
  // whatever flags the echo carries.
  await storeArchivedMessage(
    channelId,
    { ...posted, ts, user: me.slackId, text: posted.text ?? input.text, thread_ts: input.threadTs },
    false,
    me.client,
    { overwrite: true, forceHuman: true }
  );
  emitChat({ channelId, convKind, ts, threadTs: input.threadTs ?? null, kind: "new" });
  // Slack treats your own post as read; mirror that without a second API call.
  await markConversationRead(memberId, channelId, ts, { pushToSlack: false });
  return { ts };
}

async function ownRow(channelId: string, ts: string, slackId: string) {
  const row = await prisma.slackMessage.findUnique({
    where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
    select: { id: true, authorSlackId: true, deletedAt: true, threadTs: true },
  });
  if (!row || row.deletedAt) throw new SendError({ status: 404, code: "not_found", message: "That message no longer exists." });
  if (row.authorSlackId !== slackId) throw new SendError({ status: 403, code: "not_yours", message: "You can only change your own messages." });
  return row;
}

export async function editMessage(memberId: string, channelId: string, convKind: ConversationKind, ts: string, text: string): Promise<void> {
  const me = await actAs(memberId, ["post"]);
  const row = await ownRow(channelId, ts, me.slackId);
  await call(memberId, () => me.client.chat.update({ channel: channelId, ts, text }));
  await prisma.slackMessage.update({ where: { id: row.id }, data: { text, editedAt: new Date() } });
  emitChat({ channelId, convKind, ts, threadTs: row.threadTs, kind: "edit" });
}

export async function deleteMessage(memberId: string, channelId: string, convKind: ConversationKind, ts: string): Promise<void> {
  const me = await actAs(memberId, ["post"]);
  const row = await ownRow(channelId, ts, me.slackId);
  await call(memberId, () => me.client.chat.delete({ channel: channelId, ts }));
  // Tombstone now; the message_deleted echo also recomputes reply counts and
  // retracts notifications (Task 24).
  await prisma.slackMessage.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
  emitChat({ channelId, convKind, ts, threadTs: row.threadTs, kind: "delete" });
}

export async function react(memberId: string, channelId: string, ts: string, name: string, add: boolean): Promise<void> {
  const me = await actAs(memberId, ["react"]);
  try {
    await call(memberId, () =>
      add
        ? me.client.reactions.add({ channel: channelId, timestamp: ts, name })
        : me.client.reactions.remove({ channel: channelId, timestamp: ts, name })
    );
  } catch (err) {
    // already_reacted / no_reaction: Slack is already in the state we want.
    if (!(err instanceof SendError && err.failure.code === "noop")) throw err;
  }
  await applyReaction(channelId, ts, `:${name}:`, me.slackId, add);
}

export async function uploadFile(
  memberId: string,
  channelId: string,
  file: { buffer: Buffer; filename: string },
  opts: { threadTs?: string; comment?: string }
): Promise<void> {
  const me = await actAs(memberId, ["post", "files"]);
  await call(memberId, () =>
    me.client.filesUploadV2({
      channel_id: channelId,
      file: file.buffer,
      filename: file.filename,
      initial_comment: opts.comment,
      thread_ts: opts.threadTs,
    } as Parameters<WebClient["filesUploadV2"]>[0])
  );
  // The file_share message arrives through the normal event path, which
  // archives it and its attachment like any other message.
}

export async function openDm(memberId: string, otherMemberIds: string[]): Promise<{ channelId: string; kind: ConversationKind }> {
  const me = await actAs(memberId, ["dm"]);
  const others = await prisma.member.findMany({
    where: { id: { in: otherMemberIds }, isBot: false },
    select: { slackId: true },
  });
  if (others.length !== otherMemberIds.length) {
    throw new SendError({ status: 404, code: "unknown_member", message: "One of those people isn't a club member." });
  }
  const users = others.map((o) => o.slackId);
  const res = await call(memberId, () => me.client.conversations.open({ users: users.join(","), return_im: true }));
  const channelId = (res.channel as { id?: string } | undefined)?.id;
  if (!channelId) throw new SendError({ status: 502, code: "open_failed", message: "Slack didn't open the conversation." });

  const kind: ConversationKind = users.length === 1 ? "IM" : "MPIM";
  await ensureChannelArchive(channelId, me.client, { kind });
  await setConversationMembers(channelId, [me.slackId, ...users]);

  // First open of a conversation that already has Slack history: import it
  // with the opener's own token. No-op once imported.
  const a = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { backfillStatus: true },
  });
  if (a?.backfillStatus === "NOT_STARTED") await startBackfill(channelId, { requesterMemberId: memberId });
  return { channelId, kind };
}

export async function joinChannel(memberId: string, channelId: string): Promise<void> {
  const me = await actAs(memberId, ["join"]);
  await call(memberId, () => me.client.conversations.join({ channel: channelId }));
  await addConversationMember(channelId, me.slackId);
}
