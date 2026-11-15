// Exact local-reference matching only. The extraction normalizers are shared identities.
import { normalizeExample, normalizeText } from "./onetCsvCore.js";

export interface LinkSkill { id: string; name: string; aliases: readonly (string | { alias: string })[] }
export interface LinkElement { id: string; name: string; domain?: string }
export interface LinkProposal {
  skillId: string;
  kind: "SOFTWARE" | "ELEMENT" | "DWA";
  ref: string;
  relation: "EXACT";
  reason: string;
}
export const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function proposeLinks(skills: readonly LinkSkill[], softwareExamples: readonly { example: string }[], elements: readonly LinkElement[]): LinkProposal[] {
  const software = new Set(softwareExamples.map(row => normalizeExample(row.example)).filter(ref => ref && ref !== "c"));
  // "c" conflates C, C++, and C#. Never assert equivalence via that stored identity.
  const proposals = new Map<string, LinkProposal>();
  for (const skill of [...skills].sort((a, b) => compareText(a.id, b.id))) {
    const names = [{ value: skill.name, source: "name" }, ...skill.aliases
      .map(alias => ({ value: typeof alias === "string" ? alias : alias.alias, source: "alias" }))
      .sort((a, b) => compareText(a.value, b.value))];
    for (const { value, source } of names) {
      const add = (kind: LinkProposal["kind"], ref: string) => {
        const key = JSON.stringify([skill.id, kind, ref]);
        if (!proposals.has(key)) proposals.set(key, { skillId: skill.id, kind, ref, relation: "EXACT", reason: `Exact normalized ${source} match: ${value}` });
      };
      const example = normalizeExample(value);
      if (software.has(example)) add("SOFTWARE", example);
      const text = normalizeText(value);
      if (text) for (const element of elements) if (text === normalizeText(element.name)) add(element.domain === "DWA" ? "DWA" : "ELEMENT", element.id);
    }
  }
  return [...proposals.values()].sort((a, b) => compareText(a.skillId, b.skillId) || compareText(a.kind, b.kind) || compareText(a.ref, b.ref));
}
