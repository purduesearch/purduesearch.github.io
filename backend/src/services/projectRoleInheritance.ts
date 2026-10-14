import type { Prisma, Project } from "@prisma/client";
import type { prisma } from "../db/prisma.js";

type ProjectCreationDb = Pick<typeof prisma, "project" | "projectMember">;

/** Copy roles once at creation. Child rows remain editable through the normal
 * lead endpoint; parent changes and channel sync never overwrite them. */
export async function createProjectWithInheritedRoles(
  db: ProjectCreationDb,
  data: Prisma.ProjectUncheckedCreateInput,
): Promise<Project> {
  if (!data.parentId) return db.project.create({ data });

  const roles = await db.projectMember.findMany({
    where: {
      projectId: data.parentId,
      member: { isBot: false },
      OR: [{ isLead: true }, { leadTitle: { not: null } }],
    },
    select: { memberId: true, isLead: true, leadTitle: true, member: { select: { isAdmin: true } } },
  });

  // A nested write creates the project and its inherited memberships atomically.
  // These are admin-added members so a later channel link keeps their edit access.
  return db.project.create({
    data: {
      ...data,
      members: {
        createMany: {
          data: roles.map(role => ({
            memberId: role.memberId,
            isLead: role.member.isAdmin ? false : role.isLead,
            leadTitle: role.member.isAdmin || role.isLead ? role.leadTitle : null,
            addedManually: true,
          })),
        },
      },
    },
  });
}
