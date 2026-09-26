import { createHash } from "node:crypto";

export type ReviewRule = { id: string; scope: string; value: string; reviewerId: string };
export type ReviewItem = { itemId: string; versionId: string; subsystem?: string | null; parentIds?: string[] };
export type ReviewSignoff = { memberId: string; fingerprint: string; prHeadSha: string | null };
export type PrSnapshot = { title: string; state: string; draft: boolean; headSha: string; author: string; reviews: { login: string; state: string; submittedAt: string; headSha?: string | null }[]; checks: { name: string; status: string; conclusion: string | null }[]; timeline: { kind: string; label: string; at: string; actor?: string }[]; error?: string };

export function proposalFingerprint(items: ReviewItem[]): string {
  const stable = items.map(({ itemId, versionId }) => `${itemId}:${versionId}`).sort().join("|");
  return createHash("sha256").update(stable).digest("hex");
}

export function matchesRule(rule: ReviewRule, item: ReviewItem): boolean {
  if (rule.scope === "BOM_PARENT") return !!item.parentIds?.includes(rule.value);
  if (rule.scope !== "SUBSYSTEM" || !item.subsystem) return false;
  const prefix = rule.value.toLowerCase();
  const subsystem = item.subsystem.toLowerCase();
  return subsystem === prefix || subsystem.startsWith(`${prefix}/`);
}

export function canSignoff(memberId: string, rules: ReviewRule[], items: ReviewItem[]): boolean {
  return rules.some(rule => rule.reviewerId === memberId && items.some(item => matchesRule(rule, item)));
}

export function bomAncestors(itemId: string, edges: { childId: string; parentId: string }[]): string[] {
  const found = new Set<string>();
  const visit = (id: string) => {
    for (const edge of edges) if (edge.childId === id && !found.has(edge.parentId)) {
      found.add(edge.parentId);
      visit(edge.parentId);
    }
  };
  visit(itemId);
  found.delete(itemId);
  return [...found];
}

/** The one mapping from CR items to rule inputs. Subsystem is the part-number path; parents are every BOM ancestor. */
export function buildReviewItems(crItems: { itemId: string; versionId: string }[], vaultItems: { id: string; partNumber: string | null }[], edges: { childId: string; parentId: string }[]): ReviewItem[] {
  return crItems.map(ci => ({ itemId: ci.itemId, versionId: ci.versionId, subsystem: vaultItems.find(v => v.id === ci.itemId)?.partNumber ?? null, parentIds: bomAncestors(ci.itemId, edges) }));
}

export function shouldAuditHead(previous: PrSnapshot | null, next: PrSnapshot): boolean {
  return previous?.headSha !== next.headSha;
}

/**
 * `activeReviewerIds`, when given, is the set of members who still hold project access. A rule whose
 * reviewer is outside it can never be satisfied, so it fails with an admin-facing reason instead of
 * sitting in "pending" forever, and any sign-off that reviewer left behind stops counting.
 */
export function reviewGate(input: { items: ReviewItem[]; rules: ReviewRule[]; signoffs: ReviewSignoff[]; pr: PrSnapshot | null; prLinked: boolean; requiredChecks: string[]; activeReviewerIds?: Set<string> }): { state: "approved" | "pending" | "failing" | "stale"; reasons: string[]; required: { ruleId: string; reviewerId: string; state: string }[] } {
  const fingerprint = proposalFingerprint(input.items);
  const head = input.pr?.headSha ?? null;
  const active = (id: string) => !input.activeReviewerIds || input.activeReviewerIds.has(id);
  const required = input.rules.filter(rule => input.items.some(item => matchesRule(rule, item))).map(rule => {
    if (!active(rule.reviewerId)) return { ruleId: rule.id, reviewerId: rule.reviewerId, state: "unauthorized" };
    const signoff = input.signoffs.find(s => s.memberId === rule.reviewerId);
    return { ruleId: rule.id, reviewerId: rule.reviewerId, state: !signoff ? "pending" : signoff.fingerprint !== fingerprint || signoff.prHeadSha !== head ? "stale" : "approved" };
  });
  const reasons: string[] = [];
  let state: "approved" | "pending" | "failing" | "stale" = "approved";
  const mark = (next: typeof state, reason: string) => { reasons.push(reason); if ({ approved: 0, pending: 1, stale: 2, failing: 3 }[next] > { approved: 0, pending: 1, stale: 2, failing: 3 }[state]) state = next; };
  if (required.some(r => r.state === "unauthorized")) mark("failing", "A required reviewer no longer has project access; an admin must update the reviewer rules");
  if (required.some(r => r.state === "pending")) mark("pending", "Required reviewer sign-off is pending");
  if (required.some(r => r.state === "stale")) mark("stale", "Reviewer sign-off is stale after a version or PR head change");
  if (input.prLinked) {
    const pr = input.pr;
    if (!pr || pr.error) mark("pending", pr?.error || "PR status is unavailable");
    else {
      if (pr.draft || pr.state !== "open") mark("failing", "PR must be open and ready for review");
      const latest = new Map<string, string>();
      for (const review of pr.reviews) if (!review.headSha || review.headSha === pr.headSha) latest.set(review.login.toLowerCase(), review.state.toUpperCase());
      const states = [...latest.entries()].filter(([login]) => login !== pr.author.toLowerCase()).map(([, review]) => review);
      if (states.includes("CHANGES_REQUESTED")) mark("failing", "GitHub reviewer requested changes");
      if (!states.includes("APPROVED")) mark("pending", "GitHub PR approval is pending");
      const checks = input.requiredChecks.length ? input.requiredChecks.map(name => pr.checks.find(c => c.name === name) ?? { name, status: "missing", conclusion: null }) : pr.checks;
      if (!checks.length) mark("pending", "No GitHub checks reported");
      for (const check of checks) {
        if (["failure", "cancelled", "timed_out", "action_required"].includes(check.conclusion || "")) mark("failing", `${check.name} failed`);
        else if (check.status !== "completed" || !["success", "neutral", "skipped"].includes(check.conclusion || "")) mark("pending", `${check.name} is pending`);
      }
    }
  }
  return { state, reasons, required };
}
