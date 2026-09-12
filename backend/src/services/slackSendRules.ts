import { isDeadTokenError } from "./slackUserTokenService.js";

/** Pure rules for the portal's write path. */

export const MAX_TEXT = 4000;
/** Slack's conversations.open accepts up to 8 other people (D13). */
export const MAX_DM_OTHERS = 8;

export interface SlackFailure { status: number; code: string; message: string }

/**
 * Slack error code → HTTP status + a sentence the UI can show.
 * 409 means exactly one thing — "reconnect Slack" — and the UI keys off it.
 */
export function mapSlackError(code: string): SlackFailure {
  if (isDeadTokenError(code) || code === "missing_scope" || code === "not_allowed_token_type") {
    return { status: 409, code: "reconnect", message: "Reconnect Slack to keep messaging from Constellation." };
  }
  switch (code) {
    case "not_in_channel": return { status: 403, code, message: "Join this channel to post in it." };
    case "channel_not_found": return { status: 404, code, message: "Slack can't find that conversation." };
    case "is_archived": return { status: 410, code, message: "This channel is archived in Slack." };
    case "msg_too_long": return { status: 400, code, message: "That message is too long for Slack." };
    case "ratelimited": return { status: 429, code, message: "Slack is rate-limiting — try again in a moment." };
    case "restricted_action": return { status: 403, code, message: "Your Slack workspace doesn't allow that." };
    case "cant_update_message":
    case "cant_delete_message":
    case "edit_window_closed":
    case "message_not_found":
      return { status: 403, code, message: "Slack won't let you change that message." };
    case "already_reacted":
    case "no_reaction":
      return { status: 200, code: "noop", message: "" };
    default:
      return { status: 502, code, message: "Slack rejected the request." };
  }
}

export function validateOutgoingText(text: unknown): { ok: true; text: string } | { ok: false; failure: SlackFailure } {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, failure: { status: 400, code: "empty", message: "Message is empty." } };
  }
  const t = text.trim();
  if (t.length > MAX_TEXT) {
    return { ok: false, failure: { status: 400, code: "too_long", message: `Messages are limited to ${MAX_TEXT} characters.` } };
  }
  return { ok: true, text: t };
}

export function validateDmTargets(meId: string, ids: unknown): { ok: true; ids: string[] } | { ok: false; failure: SlackFailure } {
  if (!Array.isArray(ids)) {
    return { ok: false, failure: { status: 400, code: "bad_targets", message: "Pick who to message." } };
  }
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))].filter((id) => id !== meId);
  if (unique.length === 0) {
    return { ok: false, failure: { status: 400, code: "bad_targets", message: "Pick at least one other person." } };
  }
  if (unique.length > MAX_DM_OTHERS) {
    return { ok: false, failure: { status: 400, code: "too_many", message: "Group messages are limited to 8 other people — use a channel for larger groups." } };
  }
  return { ok: true, ids: unique };
}

/** Slack reaction names carry no colons; the UI may send ":tada:". */
export function normalizeEmojiName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/^:+|:+$/g, "");
  return /^[a-z0-9_+\-']+(::skin-tone-[2-6])?$/i.test(name) ? name : null;
}
