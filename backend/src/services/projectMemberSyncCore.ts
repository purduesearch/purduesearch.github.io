// Pure planning step for syncProjectMembersFromChannel.
//
// The sync used to call Slack users.info and upsert a ProjectMember for every
// channel member, one after another, on every project page load. That made
// the project page as slow as the channel was large. The plan below limits
// Slack calls to members we have never seen, and DB writes to members who are
// not yet in the project.

export interface KnownChannelMember {
  slackId: string;
  memberId: string;
  isBot: boolean;
  inProject: boolean;
}

export interface ChannelMemberSyncPlan {
  /** Existing non-bot members missing from the project: add without a Slack call. */
  addMemberIds: string[];
  /** Slack ids with no Member row yet: resolve through users.info, then add. */
  resolveSlackIds: string[];
}

export function planChannelMemberSync(
  channelSlackIds: string[],
  known: KnownChannelMember[],
): ChannelMemberSyncPlan {
  const bySlackId = new Map(known.map(k => [k.slackId, k]));
  const addMemberIds: string[] = [];
  const resolveSlackIds: string[] = [];
  const seen = new Set<string>();

  for (const slackId of channelSlackIds) {
    if (seen.has(slackId)) continue;
    seen.add(slackId);
    const k = bySlackId.get(slackId);
    if (!k) resolveSlackIds.push(slackId);
    else if (!k.isBot && !k.inProject) addMemberIds.push(k.memberId);
  }

  return { addMemberIds, resolveSlackIds };
}
