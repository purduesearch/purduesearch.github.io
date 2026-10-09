type ScopeDependencies = {
  project: (id: string) => Promise<{ slackChannelId: string | null } | null>;
  channelMembers: (channelId: string) => Promise<string[]>;
  projectMembers: (id: string) => Promise<string[]>;
};

/** Linked projects use actual channel membership, including an empty channel.
 * Unlinked projects use their explicit roster. Never widen a failed lookup. */
export async function projectRosterSlackIds(projectId: string, deps?: ScopeDependencies): Promise<string[] | null> {
  if (!deps) {
    const { prisma } = await import("../db/prisma.js");
    const { getChannelMemberSlackIds } = await import("./projectService.js");
    deps = {
      project: id => prisma.project.findUnique({ where: { id }, select: { slackChannelId: true } }),
      channelMembers: async channelId => {
        const ids = await getChannelMemberSlackIds(channelId);
        return (await prisma.member.findMany({
          where: { isBot: false, slackId: { in: ids } }, select: { slackId: true },
        })).map(row => row.slackId);
      },
      projectMembers: async id => (await prisma.projectMember.findMany({
        where: { projectId: id, member: { isBot: false } }, select: { member: { select: { slackId: true } } },
      })).map(row => row.member.slackId),
    };
  }
  const project = await deps.project(projectId);
  if (!project) return null;
  return project.slackChannelId
    ? deps.channelMembers(project.slackChannelId)
    : deps.projectMembers(projectId);
}
