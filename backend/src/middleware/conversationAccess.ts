import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import {
  canReadConversation, canPostToConversation, type ConversationKind,
} from "../services/slackConversationAccess.js";

export interface ConversationAccess {
  canRead: boolean;
  canPost: boolean;
  kind: ConversationKind | null;
  isParticipant: boolean;
  slackId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      conversation?: ConversationAccess & { channelId: string };
    }
  }
}

/**
 * The database side of the access rules. It deliberately loads nothing about
 * the member's roles: the rule (services/slackConversationAccess.ts) has no
 * admin input, and this wrapper must not smuggle one in (D2).
 */
export async function getConversationAccess(memberId: string, channelId: string): Promise<ConversationAccess> {
  const [member, archive] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { slackId: true } }),
    prisma.slackChannelArchive.findUnique({ where: { slackChannelId: channelId }, select: { kind: true } }),
  ]);
  if (!member || !archive) {
    return { canRead: false, canPost: false, kind: archive?.kind ?? null, isParticipant: false, slackId: member?.slackId ?? null };
  }
  const row = await prisma.slackConversationMember.findUnique({
    where: { slackChannelId_slackUserId: { slackChannelId: channelId, slackUserId: member.slackId } },
    select: { slackUserId: true },
  });
  const input = { kind: archive.kind, isParticipant: !!row };
  return {
    canRead: canReadConversation(input),
    canPost: canPostToConversation(input),
    kind: archive.kind,
    isParticipant: input.isParticipant,
    slackId: member.slackId,
  };
}

/** Narrow a list of channel ids to those this member may read. Three queries total. */
export async function filterReadableChannels(memberId: string, channelIds: string[]): Promise<string[]> {
  if (channelIds.length === 0) return [];
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { slackId: true } });
  if (!member) return [];
  const [archives, memberships] = await Promise.all([
    prisma.slackChannelArchive.findMany({
      where: { slackChannelId: { in: channelIds } },
      select: { slackChannelId: true, kind: true },
    }),
    prisma.slackConversationMember.findMany({
      where: { slackUserId: member.slackId, slackChannelId: { in: channelIds } },
      select: { slackChannelId: true },
    }),
  ]);
  const kinds = new Map(archives.map((a) => [a.slackChannelId, a.kind]));
  const mine = new Set(memberships.map((m) => m.slackChannelId));
  // No archive row → kind unknown → not readable (fail closed).
  return channelIds.filter((id) => {
    const kind = kinds.get(id);
    return !!kind && canReadConversation({ kind, isParticipant: mine.has(id) });
  });
}

export async function requireConversationRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    const access = await getConversationAccess(req.memberId!, channelId);
    // 404 rather than "forbidden": whether a given DM exists is itself private.
    if (!access.canRead) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    req.conversation = { ...access, channelId };
    next();
  } catch (err) {
    console.error("conversation access check failed:", err);
    res.status(500).json({ error: "Failed to check access" });
  }
}
