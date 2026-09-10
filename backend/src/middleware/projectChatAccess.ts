import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      chatChannelIds?: string[];
      chatIsAdmin?: boolean;
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
 * Read access to a project's Slack archive: admin OR project member.
 *
 * Returns the project's linked channel ids from the SAME call, so every read
 * route is scoped by construction and cannot accidentally serve another
 * project's channel. Channels are linked either via notification targets
 * (primary) or the legacy Project.slackChannelId / slackChannel fields.
 */
export async function getProjectChatAccess(
  memberId: string,
  projectId: string
): Promise<{ canRead: boolean; isAdmin: boolean; channelIds: string[] }> {
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

  if (!project) return { canRead: false, isAdmin: false, channelIds: [] };

  const isAdmin = member?.isAdmin ?? false;
  const canRead = isAdmin || !!membership;

  return { canRead, isAdmin, channelIds: unionChannelIds(targets, project) };
}

export async function requireProjectChatRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const projectId = req.params.projectId as string;
  const { canRead, isAdmin, channelIds } = await getProjectChatAccess(req.memberId!, projectId);
  if (!canRead) {
    res.status(403).json({ error: "You do not have access to this project's chat" });
    return;
  }
  req.chatChannelIds = channelIds;
  req.chatIsAdmin = isAdmin;
  next();
}
