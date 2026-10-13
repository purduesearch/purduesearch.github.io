import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { filterReadableChannels } from "./conversationAccess.js";
import { getRollupChildren } from "../services/subProjectRollupService.js";

type RollupBadge = Awaited<ReturnType<typeof getRollupChildren>>[number]["badge"];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      chatChannelIds?: string[];
      chatIsAdmin?: boolean;
      chatChannelSource?: Map<string, RollupBadge>;
    }
  }
}

/**
 * Union the channel ids a project is linked through. Pure, and separated out
 * because this is the part that leaks another project's conversation if it is
 * wrong.
 *
 * The legacy `Project.slackChannel` column holds a channel NAME in some rows and
 * a raw id in others, so it is admitted only when it looks like an id
 * (C… public, G… private). Treating a name as an id would widen the read scope.
 */
export function unionChannelIds(
  targets: { slackChannelId: string | null }[],
  project: { slackChannelId: string | null; slackChannel: string | null }
): string[] {
  const ids = new Set<string>();
  for (const t of targets) if (t.slackChannelId) ids.add(t.slackChannelId);
  if (project.slackChannelId) ids.add(project.slackChannelId);
  if (project.slackChannel && /^[CG][A-Z0-9]+$/.test(project.slackChannel)) {
    ids.add(project.slackChannel);
  }
  return [...ids];
}

/**
 * Candidate channel ids contributed by roll-up children, each tagged with its
 * badge. Pure. A channel the parent already links itself stays local (no badge),
 * and the first child to claim an id wins. These are only CANDIDATES: the caller
 * must still run them through the readability filter.
 */
export function planRollupChannels(
  localIds: string[],
  children: { badge: RollupBadge; channelIds: string[] }[]
): Map<string, RollupBadge> {
  const local = new Set(localIds);
  const out = new Map<string, RollupBadge>();
  for (const c of children) {
    for (const id of c.channelIds) if (!local.has(id) && !out.has(id)) out.set(id, c.badge);
  }
  return out;
}

/**
 * Read access to a project's chat tab: admin OR project member — and then only the linked channels Slack lets this member see.
 *
 * Returns the project's linked channel ids from the SAME call, so every read
 * route is scoped by construction and cannot accidentally serve another
 * project's channel. Channels are linked either via notification targets
 * (primary) or the legacy Project.slackChannelId / slackChannel fields.
 */
export async function getProjectChatAccess(
  memberId: string,
  projectId: string
): Promise<{
  canRead: boolean;
  isAdmin: boolean;
  /** This project's own readable channels. Backfill and admin routes use only these. */
  channelIds: string[];
  /** Readable channels rolled up from sub-projects, keyed by channel id. */
  channelSource: Map<string, RollupBadge>;
}> {
  const [member, project, membership, targets] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { slackChannelId: true, slackChannel: true },
    }),
    // ProjectMember has a composite primary key ([projectId, memberId]) and no
    // `id` column, so the existence probe selects memberId.
    prisma.projectMember.findFirst({ where: { projectId, memberId }, select: { memberId: true } }),
    prisma.projectNotificationTarget.findMany({
      where: { projectId },
      select: { slackChannelId: true },
    }),
  ]);

  if (!project) return { canRead: false, isAdmin: false, channelIds: [], channelSource: new Map() };

  const isAdmin = member?.isAdmin ?? false;
  const canRead = isAdmin || !!membership;
  // D3: project membership decides where a channel SHOWS UP, never who may
  // read it. A private linked channel is listed only for its Slack members —
  // admins included. Admin still gates the project-level tools (backfill,
  // storage health), which expose no message content.
  const localCandidates = unionChannelIds(targets, project);
  let candidateSource = new Map<string, RollupBadge>();
  if (canRead) {
    const children = await getRollupChildren(projectId, "slack");
    if (children.length) {
      const childTargets = await prisma.projectNotificationTarget.findMany({
        where: { projectId: { in: children.map((c) => c.id) } },
        select: { projectId: true, slackChannelId: true },
      });
      const childProjects = await prisma.project.findMany({
        where: { id: { in: children.map((c) => c.id) } },
        select: { id: true, slackChannelId: true, slackChannel: true },
      });
      candidateSource = planRollupChannels(
        localCandidates,
        children.map((c) => ({
          badge: c.badge,
          channelIds: unionChannelIds(
            childTargets.filter((t) => t.projectId === c.id),
            childProjects.find((p) => p.id === c.id) ?? { slackChannelId: null, slackChannel: null }
          ),
        }))
      );
    }
  }
  // One readability pass over local AND rolled-up ids: added ids never skip it.
  const readable = canRead
    ? new Set(await filterReadableChannels(memberId, [...localCandidates, ...candidateSource.keys()]))
    : new Set<string>();
  const channelIds = localCandidates.filter((id) => readable.has(id));
  const channelSource = new Map([...candidateSource].filter(([id]) => readable.has(id)));
  return { canRead, isAdmin, channelIds, channelSource };
}

export async function requireProjectChatRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const projectId = req.params.projectId as string;
  const { canRead, isAdmin, channelIds, channelSource } = await getProjectChatAccess(req.memberId!, projectId);
  if (!canRead) {
    res.status(403).json({ error: "You do not have access to this project's chat" });
    return;
  }
  req.chatChannelIds = channelIds;
  req.chatChannelSource = channelSource;
  req.chatIsAdmin = isAdmin;
  next();
}
