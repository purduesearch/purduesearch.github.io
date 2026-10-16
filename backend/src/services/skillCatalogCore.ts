// Pure identity, privacy and consolidation rules. Similarity never establishes equivalence.
import { normalizeSkillName, wouldCreateCycle } from "./skillMatchCore.js";
import type { EvidenceInput } from "./skillScoringCore.js";

export const CATALOG_POLICY_VERSION = "catalog-v1";
export interface CatalogNode { id: string; canonicalId?: string | null }

export function canonicalMap(nodes: CatalogNode[]): Map<string, string> {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const out = new Map<string, string>();
  for (const n of nodes) {
    const seen = new Set<string>();
    let cur = n.id;
    while (byId.get(cur)?.canonicalId) {
      if (seen.has(cur)) throw new Error("Skill identity cycle");
      seen.add(cur);
      cur = byId.get(cur)!.canonicalId!;
      if (!byId.has(cur)) throw new Error("Missing canonical skill");
    }
    out.set(n.id, cur);
  }
  return out;
}

export function identityIds(id: string, map: ReadonlyMap<string, string>): string[] {
  const target = map.get(id) ?? id;
  return [...map.keys()].filter(k => map.get(k) === target);
}

/** Every original must permit sharing; absent selections are private. */
export function sharingProjection(map: ReadonlyMap<string, string>, choices: ReadonlyMap<string, boolean>): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const [id, root] of map) out.set(root, (out.get(root) ?? true) && choices.get(id) === true);
  return out;
}

export function projectedDisputes(ids: Iterable<string>, map: ReadonlyMap<string, string>): Set<string> {
  return new Set([...ids].map(id => map.get(id) ?? id));
}

/** Deduplicate aliases on one artifact and explicit linked records, without adding mass. */
export function projectEvidence(rows: (EvidenceInput & { contributionKey?: string | null })[], map: ReadonlyMap<string, string>): EvidenceInput[] {
  const groups = new Map<string, EvidenceInput>();
  for (const r of rows) {
    const groupKey = r.contributionKey ? `${r.projectId ?? ""}|${r.contributionKey}` : r.id;
    const tags = new Map<string, number>();
    for (const s of r.skills) { const id = map.get(s.skillId) ?? s.skillId; tags.set(id, Math.max(tags.get(id) ?? 0, s.fit)); }
    for (const [skillId, fit] of tags) {
      const key = `${groupKey}|${skillId}`;
      const normalized = { ...r, skills: [{ skillId, fit }] };
      const prior = groups.get(key);
      if (!prior) { groups.set(key, normalized); continue; }
      // Pick a complete supported record instead of combining the strongest
      // role, complexity and outcome from different fragments.
      const priorFit = prior.skills[0].fit;
      if (fit > priorFit || (fit === priorFit && normalized.id < prior.id)) groups.set(key, normalized);
    }
  }
  return [...groups.values()];
}

export interface MergeNode extends CatalogNode { name: string; type: string; status: string; description?: string | null; source?: string; externalId?: string | null; policyLocked?: boolean }
export function mergeProblem(source: MergeNode, target: MergeNode, edges: { fromId: string; toId: string; kind: string }[], affectedMembers: number, automatic: boolean, maxMembers = 5): string | null {
  if (source.id === target.id || source.canonicalId || target.canonicalId) return "Choose two current canonical concepts";
  if (source.status !== "ACTIVE" || target.status !== "ACTIVE") return "Both concepts must be active";
  if (source.policyLocked || target.policyLocked) return "A concept is locked against consolidation";
  if (source.type !== target.type) return "Different concept types must remain separate";
  if (source.externalId && target.externalId && source.externalId !== target.externalId) return "External identities conflict";
  if (source.externalId && target.externalId && source.source && target.source && source.source !== target.source) return "External identity namespaces require a reviewed mapping";
  const hierarchy = edges.filter(e => e.kind === "PARENT" || e.kind === "PREREQUISITE");
  const projected = hierarchy.map(e => ({ fromId: e.fromId === source.id ? target.id : e.fromId, toId: e.toId === source.id ? target.id : e.toId }));
  if (projected.some(e => e.fromId === e.toId) || projected.some(e => wouldCreateCycle(projected.filter(x => x !== e), e.fromId, e.toId))) return "Consolidation would collapse a hierarchy or create a cycle";
  if (automatic && normalizeSkillName(source.name) !== normalizeSkillName(target.name)) return "Semantic equivalence requires reviewed replay validation";
  if (automatic && !(source.externalId && source.externalId === target.externalId) && !(source.description && target.description && source.description.trim().toLowerCase() === target.description.trim().toLowerCase())) return "Concept definitions need an equivalence review";
  if (automatic && affectedMembers > maxMembers) return "Affected-member limit exceeded";
  return null;
}

export function proposalProblem(p: { name: string; description?: string | null; supportingQuote?: string | null; rationale?: string | null }, artifact: { source: string; body: string; title: string; memberRole: string } | undefined, nearCount: number): string | null {
  if (!artifact || !["GITHUB", "CAD", "REVIEW"].includes(artifact.source)) return "An attributable authored or reviewed source is needed for automatic creation";
  if (!p.description || p.description.length < 25 || p.description.length > 500) return "A useful concept definition is needed";
  if (!p.rationale || p.rationale.length < 15) return "A supporting rationale is needed";
  const quote = p.supportingQuote?.replace(/\s+/g, " ").trim() ?? "";
  const text = artifact.body.replace(/\s+/g, " ");
  if (quote.length < 20 || quote.length > 400 || !text.includes(quote)) return "An exact supporting source passage is needed";
  if (nearCount) return "A similar existing concept needs an equivalence check";
  return null;
}
