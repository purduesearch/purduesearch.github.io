/**
 * The single ingest filter for the Slack archive. Pure: no Prisma, no Slack.
 *
 * Bot messages are not archived. That policy lives here, in one predicate,
 * rather than scattered through the event handler — so flipping it later
 * ("store bot messages, render collapsed") is a one-function change.
 * Note the tradeoff: a bot message skipped at ingest is unrecoverable once it
 * passes Slack's retention boundary.
 */

export type ArchiveDecision =
  | { archive: false; reason: "bot" | "housekeeping" | "empty" | "unsupported_subtype" }
  | { archive: true; kind: "new" | "edit" | "delete" };

export interface RawSlackMessage {
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: unknown[];
  /** message_changed carries the new message here. */
  message?: { text?: string; user?: string; bot_id?: string; ts?: string; thread_ts?: string };
  previous_message?: { ts?: string };
  /** message_deleted carries the target ts here. */
  deleted_ts?: string;
}

/** Membership and channel-config noise Slack delivers as messages. */
const HOUSEKEEPING = new Set([
  "channel_join", "channel_leave", "channel_topic", "channel_purpose",
  "channel_name", "channel_archive", "channel_unarchive", "channel_posting_permissions",
  "group_join", "group_leave", "group_topic", "group_purpose", "group_name",
  "pinned_item", "unpinned_item", "bot_message", "bot_add", "bot_remove",
  "reminder_add", "tombstone", "huddle_thread",
]);

/** Subtypes that carry real, archivable content. */
const CONTENT_SUBTYPES = new Set([undefined as unknown as string, "file_share", "thread_broadcast"]);

const BOT = { archive: false, reason: "bot" } as const;

export function shouldArchive(msg: RawSlackMessage, botUserId?: string): ArchiveDecision {
  // Deletes first: they carry no user, no text, and no subtype we can inspect.
  // Applying a delete for a ts we never stored updates zero rows, which is safe,
  // so there is no need to know whether the original was a bot message.
  if (msg.subtype === "message_deleted") return { archive: true, kind: "delete" };

  // Edits next: the authorship fields live on the INNER message, so an edited
  // bot message has no bot_id on the outer envelope.
  if (msg.subtype === "message_changed") {
    const inner = msg.message;
    if (!inner) return { archive: false, reason: "unsupported_subtype" };
    if (inner.bot_id || (botUserId && inner.user === botUserId)) return BOT;
    return { archive: true, kind: "edit" };
  }

  if (msg.bot_id) return BOT;
  if (botUserId && msg.user === botUserId) return BOT;
  if (msg.subtype && HOUSEKEEPING.has(msg.subtype)) return { archive: false, reason: "housekeeping" };
  if (!CONTENT_SUBTYPES.has(msg.subtype as string)) return { archive: false, reason: "unsupported_subtype" };

  const hasText = !!msg.text && msg.text.trim().length > 0;
  const hasFiles = Array.isArray(msg.files) && msg.files.length > 0;
  if (!hasText && !hasFiles) return { archive: false, reason: "empty" };

  return { archive: true, kind: "new" };
}
