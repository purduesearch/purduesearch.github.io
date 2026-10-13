type ScopeDependencies = {
  project: (id: string) => Promise<{ slackChannelId: string | null; parentId?: string | null; parentMembersCanEdit?: boolean } | null>;
  channelMembers: (channelId: string) => Promise<string[]>;
  projectMembers: (id: string) => Promise<string[]>;
  /** Admin-added members, who belong to a linked project without being in its channel. */
  manualMembers?: (id: string) => Promise<string[]>;
};

/** Linked projects use actual channel membership (plus admin-added members), including an empty channel.
 * Unlinked projects use their explicit roster. Never widen a failed lookup. */
export async function projectRosterSlackIds(projectId: string, deps?: ScopeDependencies): Promise<string[] | null> {
  if (!deps) {
    const { prisma } = await import("../db/prisma.js");
    const { getChannelMemberSlackIds } = await import("./projectService.js");
    deps = {
      project: id => prisma.project.findUnique({ where: { id }, select: { slackChannelId: true, parentId: true, rollup: { select: { parentMembersCanEdit: true } } } })
        .then(p => p && { slackChannelId: p.slackChannelId, parentId: p.parentId, parentMembersCanEdit: p.rollup?.parentMembersCanEdit ?? false }),
      channelMembers: async channelId => {
        const ids = await getChannelMemberSlackIds(channelId);
        return (await prisma.member.findMany({
          where: { isBot: false, slackId: { in: ids } }, select: { slackId: true },
        })).map(row => row.slackId);
      },
      projectMembers: async id => (await prisma.projectMember.findMany({
        where: { projectId: id, member: { isBot: false } }, select: { member: { select: { slackId: true } } },
      })).map(row => row.member.slackId),
      manualMembers: async id => (await prisma.projectMember.findMany({
        where: { projectId: id, addedManually: true, member: { isBot: false } }, select: { member: { select: { slackId: true } } },
      })).map(row => row.member.slackId),
    };
  }
  const project = await deps.project(projectId);
  if (!project) return null;
  const own = await ownRoster(projectId, project.slackChannelId, deps);
  if (!project.parentId || !project.parentMembersCanEdit) return own;
  // Sub-projects are one level deep, so the parent's own call never recurses again.
  const parent = await projectRosterSlackIds(project.parentId, deps);
  return parent ? [...new Set([...own, ...parent])] : own;
}

async function ownRoster(projectId: string, slackChannelId: string | null, deps: ScopeDependencies): Promise<string[]> {
  if (!slackChannelId) return deps.projectMembers(projectId);
  const channel = await deps.channelMembers(slackChannelId);
  const manual = deps.manualMembers ? await deps.manualMembers(projectId) : [];
  return [...new Set([...channel, ...manual])];
}
