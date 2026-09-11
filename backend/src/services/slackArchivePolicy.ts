/**
 * The single ingest filter for the Slack archive. Pure: no Prisma, no Slack.
 *
 * Since the portal pass (D4) bot and app messages are ARCHIVED, flagged isBot,
 * with their Block Kit kept raw for read-time rendering. Only membership and
 * channel-config noise is dropped. Every caller (live ingest, backfill) goes
 * through this one predicate so the two can never disagree.
 */

export type ArchiveDecision =
  | { archive: false; reason: "housekeeping" | "empty" | "unsupported_subtype" }
  | { archive: true; kind: "new" | "edit"; isBot: boolean }
  | { archive: true; kind: "delete" };

export interface RawSlackMessage {
  subtype?: string;
  bot_id?: string;
  user?: string;
  username?: string;
  bot_profile?: { name?: string; icons?: { image_48?: string } };
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: unknown[];
  blocks?: unknown[];
  attachments?: unknown[];
  /** "channel" | "group" | "im" | "mpim" on message events. */
  channel_type?: string;
  /** message_changed carries the new message here. */
  message?: {
    text?: string; user?: string; bot_id?: string; ts?: string; thread_ts?: string;
    blocks?: unknown[]; attachments?: unknown[]; edited?: { ts?: string };
  };
  previous_message?: { ts?: string };
  /** message_deleted carries the target ts here. */
  deleted_ts?: string;
}

/** Membership and channel-config noise Slack delivers as messages. */
const HOUSEKEEPING = new Set([
  "channel_join", "channel_leave", "channel_topic", "channel_purpose",
  "channel_name", "channel_archive", "channel_unarchive", "channel_posting_permissions",
  "group_join", "group_leave", "group_topic", "group_purpose", "group_name",
  "pinned_item", "unpinned_item", "bot_add", "bot_remove",
  "reminder_add", "tombstone", "huddle_thread",
]);

/** Subtypes that carry real, archivable content. */
const CONTENT_SUBTYPES = new Set<string | undefined>([
  undefined, "file_share", "thread_broadcast", "bot_message", "me_message",
]);

function isBotAuthored(m: { bot_id?: string; user?: string; subtype?: string }, botUserId?: string): boolean {
  return !!m.bot_id || m.subtype === "bot_message" || (!!botUserId && m.user === botUserId);
}

const nonEmpty = (a: unknown) => Array.isArray(a) && a.length > 0;

export function shouldArchive(msg: RawSlackMessage, botUserId?: string): ArchiveDecision {
  // Deletes first: they carry no user, no text, and no subtype we can inspect.
  // Applying a delete for a ts we never stored updates zero rows, which is safe.
  if (msg.subtype === "message_deleted") return { archive: true, kind: "delete" };

  // Edits: authorship lives on the INNER message.
  if (msg.subtype === "message_changed") {
    const inner = msg.message;
    if (!inner?.ts) return { archive: false, reason: "unsupported_subtype" };
    return { archive: true, kind: "edit", isBot: isBotAuthored(inner, botUserId) };
  }

  if (msg.subtype && HOUSEKEEPING.has(msg.subtype)) return { archive: false, reason: "housekeeping" };
  if (!CONTENT_SUBTYPES.has(msg.subtype)) return { archive: false, reason: "unsupported_subtype" };

  const hasText = !!msg.text && msg.text.trim().length > 0;
  if (!hasText && !nonEmpty(msg.files) && !nonEmpty(msg.blocks) && !nonEmpty(msg.attachments)) {
    return { archive: false, reason: "empty" };
  }
  return { archive: true, kind: "new", isBot: isBotAuthored(msg, botUserId) };
}
