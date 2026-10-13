import { prisma } from "../db/prisma.js";
import {
  ROLLUP_FLAGS,
  settingsFromRow,
  rollupBadge,
  type RollupFlag,
  type RollupSettings,
} from "./subProjectRollupCore.js";

export async function getRollupSettings(childId: string): Promise<RollupSettings> {
  const row = await prisma.subProjectRollup.findUnique({ where: { projectId: childId } });
  return settingsFromRow(row);
}

export async function saveRollupSettings(
  childId: string,
  patch: Partial<RollupSettings>,
  actorId: string,
): Promise<RollupSettings> {
  const row = await prisma.subProjectRollup.upsert({
    where: { projectId: childId },
    create: { projectId: childId, ...patch, updatedById: actorId },
    update: { ...patch, updatedById: actorId },
  });
  return settingsFromRow(row);
}

/** Non-archived children of `parentId` that have `flag` on. */
export async function getRollupChildren(parentId: string, flag: RollupFlag) {
  const children = await prisma.project.findMany({
    where: { parentId, status: { not: "ARCHIVED" }, rollup: { is: { [flag]: true } } },
    select: { id: true, name: true, status: true, rollup: true },
  });
  return children.map((c) => {
    const settings = settingsFromRow(c.rollup);
    return { id: c.id, name: c.name, settings, badge: rollupBadge(c, settings) };
  });
}

/** Every non-archived child with any flag on, shaped as `rollupSources` on the project payload. */
export async function getRollupSources(parentId: string) {
  const children = await prisma.project.findMany({
    where: { parentId, status: { not: "ARCHIVED" }, rollup: { isNot: null } },
    select: { id: true, name: true, rollup: true },
    orderBy: { name: "asc" },
  });
  const sources = [];
  for (const c of children) {
    const settings = settingsFromRow(c.rollup);
    if (!ROLLUP_FLAGS.some((f) => settings[f])) continue;
    sources.push({
      ...rollupBadge(c, settings),
      flags: {
        tasks: settings.tasks,
        github: settings.github,
        slack: settings.slack,
        vault: settings.vault,
        milestones: settings.milestones,
        insights: settings.insights,
        aiContext: settings.aiContext,
      },
    });
  }
  return sources;
}
