/**
 * Who may read or post in a Slack conversation through Constellation.
 *
 * Mirrors Slack exactly:
 *   public channel              → any club member may read
 *   private channel, DM, group  → only members of that conversation in Slack
 *
 * There is deliberately NO administrator input anywhere in this module. A
 * Slack workspace admin cannot read a DM they are not in, so neither can a
 * Constellation admin. Keeping the flag out of every signature makes a bypass
 * impossible to add by accident; the test file also asserts this source never
 * names one.
 */
export type ConversationKind = "CHANNEL" | "PRIVATE_CHANNEL" | "IM" | "MPIM";

export function canReadConversation(input: { kind: ConversationKind; isParticipant: boolean }): boolean {
  if (input.kind === "CHANNEL") return true;
  return input.isParticipant;
}

/** Slack itself refuses posts from non-members (not_in_channel), even in public channels. */
export function canPostToConversation(input: { kind: ConversationKind; isParticipant: boolean }): boolean {
  return input.isParticipant;
}

/**
 * From a message event's `channel_type`. Unknown values fail CLOSED: a
 * mis-classified private conversation must never become world-readable.
 */
export function kindFromChannelType(channelType: string | undefined): ConversationKind {
  switch (channelType) {
    case "im": return "IM";
    case "mpim": return "MPIM";
    case "group": return "PRIVATE_CHANNEL";
    case "channel": return "CHANNEL";
    default: return "PRIVATE_CHANNEL";
  }
}

/** From a conversations.info / conversations.list `channel` object. */
export function kindFromConversation(c: {
  is_im?: boolean; is_mpim?: boolean; is_private?: boolean; is_group?: boolean; is_channel?: boolean;
}): ConversationKind {
  if (c.is_im) return "IM";
  if (c.is_mpim) return "MPIM";
  if (c.is_private || c.is_group) return "PRIVATE_CHANNEL";
  return "CHANNEL";
}

/**
 * Last-resort guess from the id alone. D… is always a DM. Everything else is
 * treated as private: modern workspaces mint C… ids for private channels too.
 */
export function kindFromChannelId(id: string): ConversationKind {
  return id.startsWith("D") ? "IM" : "PRIVATE_CHANNEL";
}
