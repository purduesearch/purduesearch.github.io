// Per-artifact analysis: build the prompt from the live taxonomy, call the model
// through the injected SkillsLlm, validate, and report usage. No DB access, so it
// is fully testable with a fake LLM. Persisting evidence/proposals is the
// pipeline's job (Phase 5).

import { rankSkillCandidates, type AliasIndex, type SkillLite, resolveSkillName } from "./skillMatchCore.js";
import {
  ANALYSIS_JSON_SCHEMA,
  buildAnalysisPrompt,
  type PromptCandidate,
  type SkillArtifact,
} from "./skillPrompts.js";
import { validateAnalysis, type ValidAnalysis } from "./skillValidateCore.js";
import { isRetryable, type BatchItem, type LlmUsage, type SkillsLlm } from "./ai/skillsGemini.js";

export interface TaxonomySkill extends SkillLite {
  type: string;
  parentIds: string[];
}

export interface Taxonomy {
  skills: TaxonomySkill[];
  index: AliasIndex;
}

/** Send the whole taxonomy while it is small; above this, prefilter. */
export const MAX_ALL_CANDIDATES = 160;
const PREFILTER_TOP = 60;

export function selectCandidates(artifact: SkillArtifact, skills: TaxonomySkill[], maxAll = MAX_ALL_CANDIDATES): TaxonomySkill[] {
  if (skills.length <= maxAll) return skills;
  const text = `${artifact.title}\n${artifact.body}\n${Object.values(artifact.facts).join(" ")}`;
  const byId = new Map(skills.map((s) => [s.id, s]));
  const chosen = new Map<string, TaxonomySkill>();
  for (const hit of rankSkillCandidates(text, skills, PREFILTER_TOP)) {
    const s = byId.get(hit.id);
    if (!s) continue;
    chosen.set(s.id, s);
    for (const p of s.parentIds) { const ps = byId.get(p); if (ps) chosen.set(ps.id, ps); }
  }
  for (const s of skills) if (s.type === "SOFT_SKILL") chosen.set(s.id, s);
  return [...chosen.values()];
}

export interface PreparedAnalysis {
  prompt: string;
  keyToSkillId: Map<string, string>;
  candidateCount: number;
}

export function prepareAnalysis(artifact: SkillArtifact, taxonomy: Taxonomy): PreparedAnalysis {
  const chosen = selectCandidates(artifact, taxonomy.skills).slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const keyToSkillId = new Map<string, string>();
  const candidates: PromptCandidate[] = chosen.map((s, i) => {
    const key = `s${i + 1}`;
    keyToSkillId.set(key, s.id);
    return { key, name: s.name, type: s.type, aliases: s.aliases };
  });
  return { prompt: buildAnalysisPrompt(artifact, candidates), keyToSkillId, candidateCount: candidates.length };
}

export type AnalysisOutcome =
  | { status: "ok"; analysis: ValidAnalysis; usage: LlmUsage; candidateCount: number }
  | { status: "invalid"; reason: string; usage: LlmUsage }
  | { status: "error"; error: string; retryable: boolean };

const ZERO: LlmUsage = { tokensIn: 0, tokensOut: 0 };

function finish(text: string, usage: LlmUsage, prep: PreparedAnalysis, taxonomy: Taxonomy): AnalysisOutcome {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { status: "invalid", reason: "response was not valid JSON", usage }; }
  const result = validateAnalysis(raw, prep.keyToSkillId, (name) => resolveSkillName(name, taxonomy.index));
  return result.ok
    ? { status: "ok", analysis: result.value, usage, candidateCount: prep.candidateCount }
    : { status: "invalid", reason: result.reason, usage };
}

export async function analyzeArtifact(artifact: SkillArtifact, taxonomy: Taxonomy, llm: SkillsLlm): Promise<AnalysisOutcome> {
  const prep = prepareAnalysis(artifact, taxonomy);
  try {
    const { text, usage } = await llm.generateJson({ prompt: prep.prompt, schema: ANALYSIS_JSON_SCHEMA });
    return finish(text, usage, prep, taxonomy);
  } catch (err) {
    return { status: "error", error: String((err as Error)?.message ?? err).slice(0, 300), retryable: isRetryable(err) };
  }
}

/** Batch mode: one job for many artifacts. A whole-job failure marks every item retryable. */
export async function analyzeArtifactsBatch(
  artifacts: { id: string; artifact: SkillArtifact }[],
  taxonomy: Taxonomy,
  llm: SkillsLlm,
): Promise<Map<string, AnalysisOutcome>> {
  const out = new Map<string, AnalysisOutcome>();
  if (!llm.batchGenerateJson) throw new Error("LLM does not support batch mode");
  const prepared = new Map(artifacts.map((a) => [a.id, prepareAnalysis(a.artifact, taxonomy)]));
  const items: BatchItem[] = artifacts.map((a) => ({ key: a.id, prompt: prepared.get(a.id)!.prompt, schema: ANALYSIS_JSON_SCHEMA }));
  try {
    for (const r of await llm.batchGenerateJson(items)) {
      const prep = prepared.get(r.key);
      if (!prep) continue;
      out.set(r.key, r.text ? finish(r.text, r.usage, prep, taxonomy) : { status: "error", error: r.error ?? "no response", retryable: true });
    }
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 300);
    for (const a of artifacts) out.set(a.id, { status: "error", error: msg, retryable: true });
  }
  for (const a of artifacts) if (!out.has(a.id)) out.set(a.id, { status: "error", error: "missing from batch results", retryable: true });
  return out;
}

export { ZERO as ZERO_USAGE };
