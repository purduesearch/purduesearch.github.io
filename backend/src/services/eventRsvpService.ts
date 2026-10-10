import { prisma } from "../db/prisma.js";

export async function setMemberRsvp(eventId: string, memberId: string, going: boolean): Promise<{ going: boolean; count: number }> {
  if (going) {
    await prisma.eventRsvp.upsert({
      where: { eventId_memberId: { eventId, memberId } },
      create: { eventId, memberId, attended: true },
      update: { attended: true, attendedAt: new Date() },
      select: { id: true },
    });
  } else {
    await prisma.eventRsvp.deleteMany({ where: { eventId, memberId } });
  }
  return { going, count: await prisma.eventRsvp.count({ where: { eventId } }) };
}

export async function getMemberRsvps(memberId: string, eventIds: string[]): Promise<Set<string>> {
  if (!eventIds.length) return new Set();
  const rows = await prisma.eventRsvp.findMany({ where: { memberId, eventId: { in: eventIds } }, select: { eventId: true } });
  return new Set(rows.map(row => row.eventId));
}
