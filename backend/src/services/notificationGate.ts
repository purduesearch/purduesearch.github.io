import { prisma } from "../db/prisma.js";

/** Fail closed during testing: only an explicit opt-in enables notifications. */
export function notificationsEnabled(disabled: unknown): boolean {
  return disabled === false;
}

export async function canNotifyMember(memberId: string): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { id: memberId }, select: { notificationsDisabled: true },
  });
  return notificationsEnabled(member?.notificationsDisabled);
}
