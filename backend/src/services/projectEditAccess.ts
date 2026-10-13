import { prisma } from "../db/prisma.js";
import { getChannelMemberSlackIds } from "./projectService.js";
import { projectRosterSlackIds } from "./projectRosterScope.js";
import { canEditProjectRule } from "./subProjectRollupCore.js";

type EditProject = {
  id: string;
  slackChannelId: string | null;
  parentId: string | null;
  rollup: { parentMembersCanEdit: boolean } | null;
};

const EDIT_PROJECT_SELECT = {
  id: true,
  slackChannelId: true,
  parentId: true,
  rollup: { select: { parentMembersCanEdit: true } },
} as const;

/** parentMembersCanEdit is on and the member is on the parent's roster (or has a row there). */
async function isOnParentRoster(
  memberId: string,
  slackId: string | null,
  project: EditProject,
): Promise<boolean> {
  if (!project.parentId || !project.rollup?.parentMembersCanEdit) return false;
  const row = await prisma.projectMember.findUnique({
    where: { projectId_memberId: { projectId: project.parentId, memberId } },
    select: { memberId: true },
  });
  if (row) return true;
  if (!slackId) return false;
  const roster = await projectRosterSlackIds(project.parentId);
  return !!roster && roster.includes(slackId);
}

/** Can `memberId` edit `projectId`? Channel members, admin-added members, and (opt-in) parent roster. */
export async function canEditProject(memberId: string, projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: EDIT_PROJECT_SELECT });
  if (!project?.slackChannelId) return true;

  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { slackId: true } });
  const manual = await prisma.projectMember.findFirst({
    where: { projectId, memberId, addedManually: true },
    select: { memberId: true },
  });
  if (manual) return true;

  const channelIds = await getChannelMemberSlackIds(project.slackChannelId);
  const inChannel = !!member?.slackId && channelIds.includes(member.slackId);
  const viaParent = inChannel ? false : await isOnParentRoster(memberId, member?.slackId ?? null, project);
  return canEditProjectRule({ slackChannelId: project.slackChannelId, inChannel, addedManually: false, viaParent });
}

/** Batch form for payloads: one channel lookup per distinct channel. */
export async function canEditProjectsBatch(memberId: string, projectIds: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const ids = [...new Set(projectIds)];
  if (!ids.length) return result;

  const [projects, member, manualRows] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: ids } }, select: EDIT_PROJECT_SELECT }),
    prisma.member.findUnique({ where: { id: memberId }, select: { slackId: true } }),
    prisma.projectMember.findMany({
      where: { projectId: { in: ids }, memberId, addedManually: true },
      select: { projectId: true },
    }),
  ]);
  const manual = new Set(manualRows.map((r) => r.projectId));
  const slackId = member?.slackId ?? null;

  const channelCache = new Map<string, Promise<string[]>>();
  const channelIds = (channelId: string) => {
    let hit = channelCache.get(channelId);
    if (!hit) { hit = getChannelMemberSlackIds(channelId); channelCache.set(channelId, hit); }
    return hit;
  };

  for (const id of ids) if (!projects.some((p) => p.id === id)) result.set(id, false);
  await Promise.all(projects.map(async (project) => {
    if (!project.slackChannelId) { result.set(project.id, true); return; }
    if (manual.has(project.id)) { result.set(project.id, true); return; }
    const inChannel = !!slackId && (await channelIds(project.slackChannelId)).includes(slackId);
    const viaParent = inChannel ? false : await isOnParentRoster(memberId, slackId, project);
    result.set(project.id, canEditProjectRule({
      slackChannelId: project.slackChannelId, inChannel, addedManually: false, viaParent,
    }));
  }));
  return result;
}
