// Deterministic skill scoring (pure). Gemini never picks a level: it only labels
// each artifact (skills, contribution, complexity, outcome); everything below is
// arithmetic over those labels, so a re-run with the same evidence and
// SCORING_VERSION gives the same answer.
//
// Level (what the person can do) and confidence (how sure we are) are computed
// separately on purpose: one fresh item is "probably level 2, low confidence",
// not "level 1".
//
// Commit counts and file ownership are NOT inputs. A collector emits one
// evidence item per PR / CAD version / task, and each is weighted by what the
// person did (contribution), how hard it was (complexity), and how it ended.

export const SCORING_VERSION = "1-contributions";

export type Contribution = "AUTHORED" | "REVIEWED" | "LED" | "ASSISTED";
export type Outcome = "MERGED" | "SHIPPED" | "REWORKED" | "ABANDONED" | "NONE";
export type Trend = "GROWING" | "STABLE" | "FADING";
export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";

export interface EvidenceInput {
  id: string;
  contributionKey?: string | null;
  source: string;
  projectId?: string | null;
  occurredAt: Date;
  contribution: Contribution;
  /** 1-5 */
  complexity: number;
  outcome: Outcome;
  superseded?: boolean;
  /** model-reported fit of this artifact to the skill, 0-1 */
  skills: { skillId: string; fit: number }[];
}

export interface AssessmentResult {
  level: number;
  confidence: number;
  confidenceBand: ConfidenceBand;
  firstSeen: Date;
  lastDemonstrated: Date;
  trend: Trend;
  rationale: string;
  evidenceIds: string[];
  evidenceCount: number;
  sourceDiversity: number;
  projectDiversity: number;
}

export const CONTRIBUTION_WEIGHT: Record<Contribution, number> = { AUTHORED: 1, LED: 1.2, REVIEWED: 0.6, ASSISTED: 0.4 };
export const COMPLEXITY_WEIGHT: Record<number, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1, 5: 1.25 };
export const OUTCOME_WEIGHT: Record<Outcome, number> = { MERGED: 1, SHIPPED: 1, NONE: 0.7, REWORKED: 0.6, ABANDONED: 0.15 };

const DAY_MS = 86_400_000;
export const HALF_LIFE_DAYS = 270;
export const DECAY_FLOOR = 0.25;
/** Saturation scale: score = 1 - exp(-mass / MASS_SCALE). */
export const MASS_SCALE = 2;
/** Minimum saturated score for level 1..5. */
export const LEVEL_THRESHOLDS = [0.05, 0.25, 0.5, 0.75, 0.9] as const;
/** Level N needs this many distinct non-abandoned items... */
export const LEVEL_MIN_ITEMS = [1, 1, 2, 3, 4] as const;
/** Levels 3-5 also need one item with complexity >= N - 1. */
export const BAND_MEDIUM = 0.4;
export const BAND_HIGH = 0.7;

const clampComplexity = (c: number) => Math.min(5, Math.max(1, Math.round(c) || 1));

export function recencyDecay(ageDays: number): number {
  if (ageDays <= 0) return 1;
  return Math.max(DECAY_FLOOR, Math.pow(0.5, ageDays / HALF_LIFE_DAYS));
}

/** Undecayed-by-time weight of one item for one skill (the "what did they do" part). */
export function baseWeight(e: Pick<EvidenceInput, "contribution" | "complexity" | "outcome">, fit: number): number {
  return CONTRIBUTION_WEIGHT[e.contribution] * COMPLEXITY_WEIGHT[clampComplexity(e.complexity)] * OUTCOME_WEIGHT[e.outcome] * Math.min(1, Math.max(0, fit));
}

export function bandFor(confidence: number): ConfidenceBand {
  return confidence >= BAND_HIGH ? "HIGH" : confidence >= BAND_MEDIUM ? "MEDIUM" : "LOW";
}

export interface ScoreItem {
  e: EvidenceInput;
  fit: number;
  age: number;
  base: number;
  counts: boolean;
}

export function levelFor(score: number, items: ScoreItem[]): number {
  const usable = items.filter((i) => i.counts);
  let level = 0;
  for (let n = 1; n <= 5; n++) {
    if (score < LEVEL_THRESHOLDS[n - 1]) break;
    if (usable.length < LEVEL_MIN_ITEMS[n - 1]) break;
    if (n >= 3 && !usable.some((i) => clampComplexity(i.e.complexity) >= n - 1)) break;
    level = n;
  }
  return Math.max(1, level); // some evidence exists, so never "no level"
}

/** Assess one skill from the evidence that mentions it. Returns null with no usable evidence. */
export function assessSkill(skillId: string, evidence: EvidenceInput[], now: Date): AssessmentResult | null {
  const items: ScoreItem[] = [];
  for (const e of evidence) {
    if (e.superseded) continue;
    const s = e.skills.find((x) => x.skillId === skillId);
    if (!s) continue;
    const age = Math.max(0, (now.getTime() - e.occurredAt.getTime()) / DAY_MS);
    items.push({ e, fit: s.fit, age, base: baseWeight(e, s.fit), counts: e.outcome !== "ABANDONED" && s.fit > 0 });
  }
  if (!items.length) return null;

  const mass = items.reduce((sum, i) => sum + i.base * recencyDecay(i.age), 0);
  const score = 1 - Math.exp(-mass / MASS_SCALE);
  const level = levelFor(score, items);

  const counted = items.filter((i) => i.counts);
  const nEff = items.reduce((sum, i) => sum + Math.min(1, i.fit) * (i.e.outcome === "ABANDONED" ? 0.2 : 1), 0);
  const sources = new Set(counted.map((i) => i.e.source));
  const projects = new Set(counted.map((i) => i.e.projectId).filter(Boolean));
  const newest = items.reduce((a, b) => (a.e.occurredAt >= b.e.occurredAt ? a : b));
  const oldest = items.reduce((a, b) => (a.e.occurredAt <= b.e.occurredAt ? a : b));
  const sinceNewest = Math.max(0, (now.getTime() - newest.e.occurredAt.getTime()) / DAY_MS);

  const countTerm = 1 - Math.exp(-nEff / 3);
  const srcTerm = Math.min(1, (sources.size - 1) / 2);
  const projTerm = Math.min(1, (projects.size - 1) / 2);
  const recTerm = Math.pow(0.5, sinceNewest / 180);
  let confidence = 0.5 * countTerm + 0.2 * Math.max(0, srcTerm) + 0.1 * Math.max(0, projTerm) + 0.2 * recTerm;
  // One artifact can never earn more than LOW, however strong it looks.
  if (counted.length < 2) confidence = Math.min(confidence, BAND_MEDIUM - 0.01);
  confidence = Math.round(Math.min(1, Math.max(0, confidence)) * 1000) / 1000;

  const trend = trendFor(items);
  const strongest = counted.reduce((m, i) => Math.max(m, clampComplexity(i.e.complexity)), 0);
  const rationale =
    `${items.length} evidence item${items.length === 1 ? "" : "s"} across ${sources.size || 1} source${sources.size === 1 ? "" : "s"}` +
    (strongest ? `; strongest complexity ${strongest}/5` : "") +
    `; last demonstrated ${newest.e.occurredAt.toISOString().slice(0, 10)}.`;

  return {
    level,
    confidence,
    confidenceBand: bandFor(confidence),
    firstSeen: oldest.e.occurredAt,
    lastDemonstrated: newest.e.occurredAt,
    trend,
    rationale,
    evidenceIds: items.sort((a, b) => b.base - a.base).map((i) => i.e.id),
    evidenceCount: items.length,
    sourceDiversity: sources.size,
    projectDiversity: projects.size,
  };
}

/** Last 90 days vs the 180 before that (normalised per 90 days). Stale skills fade. */
export function trendFor(items: Pick<ScoreItem, "age" | "base" | "counts">[]): Trend {
  const live = items.filter((i) => i.counts);
  if (!live.length) return "FADING";
  const newestAge = Math.min(...live.map((i) => i.age));
  if (newestAge > 180) return "FADING";
  const recent = live.filter((i) => i.age <= 90).reduce((s, i) => s + i.base, 0);
  const prior = live.filter((i) => i.age > 90 && i.age <= 270).reduce((s, i) => s + i.base, 0) / 2;
  if (recent > 0 && prior === 0) return "GROWING";
  if (recent === 0 && prior > 0) return "FADING";
  if (prior === 0) return "STABLE";
  const ratio = recent / prior;
  return ratio >= 1.5 ? "GROWING" : ratio <= 0.5 ? "FADING" : "STABLE";
}

/** One member's AI-inferred assessments, keyed by skill id. Only skills with evidence appear. */
export function assessMember(evidence: EvidenceInput[], now: Date): Map<string, AssessmentResult> {
  const skillIds = new Set<string>();
  for (const e of evidence) if (!e.superseded) for (const s of e.skills) skillIds.add(s.skillId);
  const out = new Map<string, AssessmentResult>();
  for (const id of [...skillIds].sort()) {
    const a = assessSkill(id, evidence, now);
    if (a) out.set(id, a);
  }
  return out;
}
