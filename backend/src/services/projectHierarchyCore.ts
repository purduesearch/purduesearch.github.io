/** Pure sub-project rules. The hierarchy is one level deep: a project is either
 * top-level, a parent (has children) or a child (has a parent) — never both. */

type ParentRow = { id: string; parentId: string | null; trainingForMemberId: string | null };

/** Why `projectId` cannot sit under `parent`, or null when it can.
 * Pass `projectId: null` for a project that is being created. */
export function parentAssignmentError(input: {
  projectId: string | null;
  parent: ParentRow | null;
  childCount: number;
}): string | null {
  const { projectId, parent, childCount } = input;
  if (!parent) return "Parent project not found";
  if (parent.trainingForMemberId) return "A training project cannot have sub-projects";
  if (projectId && parent.id === projectId) return "A project cannot be its own parent";
  if (parent.parentId) return "Sub-projects cannot have their own sub-projects";
  if (childCount > 0) return "A project with sub-projects cannot become a sub-project";
  return null;
}

/** Why a project cannot be hard-deleted, or null when it can. */
export function deleteBlockedReason(childNames: string[]): string | null {
  if (childNames.length === 0) return null;
  return `Delete or detach its sub-projects first: ${childNames.slice(0, 5).join(", ")}${childNames.length > 5 ? "…" : ""}`;
}

/** Typed-name confirmation: exact match after trimming, case-sensitive. */
export function deleteConfirmationMatches(projectName: string, typed: unknown): boolean {
  return typeof typed === "string" && typed.trim() === projectName.trim();
}
