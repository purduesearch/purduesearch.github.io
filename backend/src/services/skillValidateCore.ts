// Validation of Gemini's per-artifact output (pure). The model is a labeller, not
// an authority: every key must map back to a candidate we supplied, enums and
// ranges are enforced here, and free-text proposals are alias-matched against the
// existing taxonomy before they can reach the admin queue.

import {
  CONTRIBUTIONS,
  MAX_PROPOSED_PER_ARTIFACT,
  MAX_SKILLS_PER_ARTIFACT,
  MAX_SUMMARY_CHARS,
  OUTCOMES,
  SKILL_TYPES,
} from "./skillPrompts.js";
import type { Contribution, Outcome } from "./skillScoringCore.js";

export type SkillTypeName = (typeof SKILL_TYPES)[number];

export interface ValidAnalysis {
  skills: { skillId: string; fit: number }[];
  proposed: { name: string; type: SkillTypeName; rationale: string }[];
  contribution: Contribution;
  complexity: number;
  outcome: Outcome;
  summary: string;
  warnings: string[];
}

export type ValidationResult = { ok: true; value: ValidAnalysis } | { ok: false; reason: string };

/** Fits below this are noise and are dropped. */
export const MIN_FIT = 0.3;
/** A proposal that alias-matches an existing skill is kept, at this fit, as that skill. */
export const MAPPED_PROPOSAL_FIT = 0.6;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

function cleanText(v: string): string {
  return v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function truncateSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

const URLISH = /https?:\/\/|www\./i;

export function validateAnalysis(
  raw: unknown,
  /** candidate key (s1..sN) -> real skill id */
  keyToSkillId: ReadonlyMap<string, string>,
  /** taxonomy alias lookup: name -> skill id | null */
  resolveName: (name: string) => string | null,
): ValidationResult {
  if (!isObj(raw)) return { ok: false, reason: "response is not an object" };
  const warnings: string[] = [];

  if (!oneOf(CONTRIBUTIONS, raw.contribution)) return { ok: false, reason: `bad contribution: ${String(raw.contribution)}` };
  if (!oneOf(OUTCOMES, raw.outcome)) return { ok: false, reason: `bad outcome: ${String(raw.outcome)}` };
  if (typeof raw.complexity !== "number" || !Number.isFinite(raw.complexity)) return { ok: false, reason: "complexity is not a number" };
  const complexity = Math.min(5, Math.max(1, Math.round(raw.complexity)));
  if (complexity !== raw.complexity) warnings.push(`complexity ${raw.complexity} clamped to ${complexity}`);

  if (typeof raw.summary !== "string") return { ok: false, reason: "summary missing" };
  let summary = cleanText(raw.summary);
  if (summary.length < 10) return { ok: false, reason: "summary too short" };
  if (URLISH.test(summary)) { summary = summary.replace(/\S*(https?:\/\/|www\.)\S*/gi, "").replace(/\s+/g, " ").trim(); warnings.push("url removed from summary"); }
  if (summary.length < 10) return { ok: false, reason: "summary empty after cleaning" };
  if (summary.length > MAX_SUMMARY_CHARS) { summary = truncateSentence(summary, MAX_SUMMARY_CHARS); warnings.push("summary truncated"); }

  const skills = new Map<string, number>();
  const rawSkills = Array.isArray(raw.skills) ? raw.skills : [];
  if (!Array.isArray(raw.skills)) warnings.push("skills was not an array");
  for (const item of rawSkills.slice(0, 50)) {
    if (!isObj(item) || typeof item.key !== "string") { warnings.push("skill entry malformed"); continue; }
    const id = keyToSkillId.get(item.key.trim().toLowerCase());
    if (!id) { warnings.push(`unknown skill key dropped: ${String(item.key).slice(0, 20)}`); continue; }
    const fit = typeof item.fit === "number" && Number.isFinite(item.fit) ? Math.min(1, Math.max(0, item.fit)) : 0;
    if (fit < MIN_FIT) continue;
    skills.set(id, Math.max(skills.get(id) ?? 0, fit));
  }

  const proposed: ValidAnalysis["proposed"] = [];
  const rawProposed = Array.isArray(raw.proposedSkills) ? raw.proposedSkills : [];
  for (const item of rawProposed.slice(0, MAX_PROPOSED_PER_ARTIFACT)) {
    if (!isObj(item) || typeof item.name !== "string") { warnings.push("proposal malformed"); continue; }
    const name = cleanText(item.name);
    if (name.length < 2 || name.length > 80 || URLISH.test(name)) { warnings.push("proposal name rejected"); continue; }
    const existing = resolveName(name);
    if (existing) {
      // Same skill under another name: map it instead of queueing a duplicate.
      skills.set(existing, Math.max(skills.get(existing) ?? 0, MAPPED_PROPOSAL_FIT));
      warnings.push(`proposal "${name}" mapped to existing skill`);
      continue;
    }
    if (proposed.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
    proposed.push({
      name,
      type: oneOf(SKILL_TYPES, item.type) ? item.type : "TOOL",
      rationale: typeof item.rationale === "string" ? truncateSentence(cleanText(item.rationale), 300) : "",
    });
  }

  const ranked = [...skills.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_SKILLS_PER_ARTIFACT);
  if (skills.size > ranked.length) warnings.push("skills capped");

  return {
    ok: true,
    value: {
      skills: ranked.map(([skillId, fit]) => ({ skillId, fit: Math.round(fit * 100) / 100 })),
      proposed,
      contribution: raw.contribution,
      complexity,
      outcome: raw.outcome,
      summary,
      warnings,
    },
  };
}
