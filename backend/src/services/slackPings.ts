import type { ConversationKind } from "./slackConversationAccess.js";

/**
 * Pure. Who one Slack message pings, and how — mirroring Slack's default
 * notification rules (D8). One ping per recipient; the strongest reason wins.
 *
 * Slack's per-user mute and keyword settings have no API, so they can't be
 * mirrored; Constellation's own mute is applied by the caller.
 */
export type PingType = "SLACK_DM" | "SLACK_MENTION" | "SLACK_THREAD_REPLY" | "SLACK_BROADCAST";
export interface Ping { slackUserId: string; type: PingType }

export interface PingInput {
  convKind: ConversationKind;
  authorSlackId: string | null;
  /** Our own Club PM bot. Constellation already notified natively for its posts (D9). */
  isOwnBot: boolean;
  /** Raw mrkdwn. */
  text: string;
  /** Parent ts when this message is a thread reply. */
  threadTs: string | null;
  /** Slack members of the conversation (SlackConversationMember). */
  conversationMemberIds: string[];
  /** People following the thread: its parent's author, prior repliers, and people mentioned in it. */
  threadParticipantIds: string[];
  /** Expanded user groups, for <!subteam^S…> mentions. */
  userGroupMembers: Record<string, string[]>;
}

const STRENGTH: Record<PingType, number> = {
  SLACK_DM: 0, SLACK_MENTION: 1, SLACK_THREAD_REPLY: 2, SLACK_BROADCAST: 3,
};

/** Slack does not ping for mentions inside code. */
export function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}

export function extractMentions(text: string): { users: string[]; groups: string[]; broadcast: boolean } {
  const t = stripCode(text);
  const users = [...t.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]);
  const groups = [...t.matchAll(/<!subteam\^([A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]);
  const broadcast = /<!(channel|here|everyone)(?:\|[^>]*)?>/.test(t);
  return { users: [...new Set(users)], groups: [...new Set(groups)], broadcast };
}

export function computePings(input: PingInput): Ping[] {
  if (input.isOwnBot) return [];
  const isDm = input.convKind === "IM" || input.convKind === "MPIM";
  const members = new Set(input.conversationMemberIds);
  const out = new Map<string, PingType>();
  const give = (id: string, type: PingType) => {
    if (!id || id === input.authorSlackId) return;
    const prev = out.get(id);
    if (!prev || STRENGTH[type] < STRENGTH[prev]) out.set(id, type);
  };

  if (isDm) for (const id of members) give(id, "SLACK_DM");

  const m = extractMentions(input.text);
  // Slack doesn't notify someone mentioned in a conversation they're not in.
  for (const id of m.users) if (members.has(id)) give(id, "SLACK_MENTION");
  for (const g of m.groups) {
    for (const id of input.userGroupMembers[g] ?? []) if (members.has(id)) give(id, "SLACK_MENTION");
  }
  // @here is treated like @channel: we cannot see who is "active".
  if (m.broadcast && !isDm) for (const id of members) give(id, "SLACK_BROADCAST");
  if (input.threadTs) {
    for (const id of input.threadParticipantIds) if (members.has(id)) give(id, "SLACK_THREAD_REPLY");
  }

  return [...out].map(([slackUserId, type]) => ({ slackUserId, type }));
}
