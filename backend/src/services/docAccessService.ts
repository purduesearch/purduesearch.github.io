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
