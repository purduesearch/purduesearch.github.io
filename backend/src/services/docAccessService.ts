import type { DocAccessLevel } from "@prisma/client";
import { prisma } from "../db/prisma.js";

/** Identifies one collaborative document. Exactly one key is set. */
export type DocRef =
  | { postId: string }
  | { pressKitId: string }
  | { courseSectionId: string };

const RANK: Record<DocAccessLevel, number> = {
  VIEW: 1, COMMENT: 2, EDIT: 3, OWNER: 4,
};

export function maxLevel(
  a: DocAccessLevel | null,
  b: DocAccessLevel | null,
): DocAccessLevel | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

export function atLeast(
  level: DocAccessLevel | null,
  required: DocAccessLevel,
): boolean {
  return !!level && RANK[level] >= RANK[required];
}

export interface AccessInputs {
  isAdmin: boolean;
  inherited: DocAccessLevel | null;
  grant: DocAccessLevel | null;
  club: DocAccessLevel | null;
}

/**
 * Effective access is the maximum over four independent sources. Admins are
 * modelled as an OWNER source rather than an early return so the rule stays a
 * single max and there is no ordering to get wrong.
 */
export function combineAccess(inputs: AccessInputs): DocAccessLevel | null {
  const admin: DocAccessLevel | null = inputs.isAdmin ? "OWNER" : null;
  return maxLevel(maxLevel(admin, inputs.inherited), maxLevel(inputs.grant, inputs.club));
}

/**
 * Expands a DocRef into the single FK column it targets. Every read and write
 * goes through this so no handler hand-builds a polymorphic where/data object
 * and trips the num_nonnulls CHECK constraint.
 */
export function docRefToWhere(ref: DocRef) {
  if ("postId" in ref) return { postId: ref.postId };
  if ("pressKitId" in ref) return { pressKitId: ref.pressKitId };
  return { courseSectionId: ref.courseSectionId };
}

/**
 * Access implied by owning/participating in the thing the document belongs to.
 * This is what preserves today's reachability: without it, "default none" would
 * strip every project member of their press kit on migration day.
 */
async function inheritedAccess(
  memberId: string,
  ref: DocRef,
): Promise<DocAccessLevel | null> {
  if ("postId" in ref) {
    const post = await prisma.blogPost.findUnique({
      where: { id: ref.postId }, select: { createdById: true },
    });
    return post?.createdById === memberId ? "OWNER" : null;
  }

  if ("pressKitId" in ref) {
    const kit = await prisma.projectPressKit.findUnique({
      where: { id: ref.pressKitId }, select: { projectId: true, createdById: true },
    });
    if (!kit) return null;
    if (kit.createdById === memberId) return "OWNER";
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_memberId: { projectId: kit.projectId, memberId } },
      select: { memberId: true },
    });
    return membership ? "EDIT" : null;
  }

  const section = await prisma.courseSection.findUnique({
    where: { id: ref.courseSectionId },
    select: { course: { select: { createdById: true } } },
  });
  return section?.course.createdById === memberId ? "OWNER" : null;
}

/**
 * Effective access level for this member on this document, or null for none.
 * The single source of truth — REST, the collab handshake, and the UI all call
 * this. Do not reimplement the rule anywhere else.
 */
export async function resolveDocAccess(
  memberId: string,
  ref: DocRef,
): Promise<DocAccessLevel | null> {
  const where = docRefToWhere(ref);

  const [me, inherited, grant, share] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }),
    inheritedAccess(memberId, ref),
    prisma.docAccessGrant.findFirst({
      where: { ...where, memberId }, select: { level: true },
    }),
    prisma.docShareSettings.findFirst({
      where, select: { clubLevel: true },
    }),
  ]);

  return combineAccess({
    isAdmin: !!me?.isAdmin,
    inherited,
    grant: grant?.level ?? null,
    // OWNER is not a representable club tier; clamp defensively in case a row
    // was written directly against the database.
    club: share?.clubLevel === "OWNER" ? "EDIT" : (share?.clubLevel ?? null),
  });
}
