// Pure pathway matching: one member against one occupation. Deterministic, no model,
// and deliberately no overall score or percentage (locked decision 7).

export type PathwayStatus = "demonstrated" | "learning" | "claimed" | "none";
export const SKILL_LIMIT = 7;
/** At most this many club tasks are suggested per emerging O*NET task. */
export const EMERGING_TASK_CAP = 5;
export const MIN_SHARED_TOKENS = 2;

export interface PathwayInput {
  occupation: { code: string; title: string };
  software: { example: string; exampleNorm: string; categoryId: string; hot: boolean; inDemand: boolean }[];
  ratings: { elementId: string; scale: string; value: number; suppress?: boolean; notRelevant?: boolean }[];
  /** Only ESSENTIAL_SKILL / TRANSFERABLE_SKILL elements count as skills; others are ignored. */
  elements: { id: string; name: string; domain: string }[];
  softwareLinks: { skillId: string; ref: string }[];
  elementLinks: { skillId: string; ref: string }[];
  assessments: { skillId: string; provenance: string; level: number }[];
  goalSkillIds: string[];
  /** Skills with an OPEN/UPHELD dispute (any identity; projected through `canonical`). */
  disputedSkillIds: string[];
  /** skillId -> canonical skillId; a missing id is already canonical. */
  canonical?: ReadonlyMap<string, string>;
  metrics: { metricId: string; dwaId: string | null; value: number }[];
  dwas: { dwaId: string; name: string }[];
  emergingTasks: { id: number | string; task: string; category: string }[];
  candidateTasks: { id: string; title: string; projectId: string; projectName: string }[];
  related: { code: string; title: string; tier: string; rank: number }[];
}

export interface PathwayTool { example: string; categoryId: string; hot: boolean; inDemand: boolean; status: PathwayStatus }
export interface PathwaySkill { elementId: string; name: string; importance: number; status: PathwayStatus; notInferred: boolean }
export interface PathwayActivity { dwaId: string; name: string; metricIds: string[] }
export interface PathwayEmerging {
  id: string; task: string; category: string;
  tasks: { id: string; title: string; projectId: string; projectName: string; sharedTokens: string[] }[];
}
export interface PathwayRelated { code: string; title: string; tier: string }
export interface Pathway {
  occupation: { code: string; title: string };
  tools: PathwayTool[]; skills: PathwaySkill[]; activities: PathwayActivity[];
  emerging: PathwayEmerging[]; related: PathwayRelated[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const RANK: Record<PathwayStatus, number> = { demonstrated: 3, learning: 2, claimed: 1, none: 0 };

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "that", "this", "these", "those", "are", "was", "were", "can",
  "using", "use", "used", "new", "via", "per", "will", "has", "have", "not", "but", "any", "all", "its",
  "our", "your", "their", "than", "then", "also", "such", "may", "more", "other",
]);

/** Lowercase, split on non-alphanumerics, drop stopwords and tokens shorter than 3 chars. */
export function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOPWORDS.has(t)));
}

export function sharedTokens(a: string, b: string): string[] {
  const right = tokens(b);
  return [...tokens(a)].filter(t => right.has(t)).sort(cmp);
}

/** Status of one canonical skill. A disputed skill loses its assessment-derived standing. */
export function statusOf(rows: readonly { provenance: string; level: number }[], isGoal: boolean, disputed: boolean): PathwayStatus {
  let demonstrated = false, learning = isGoal, claimed = false;
  if (!disputed) {
    for (const r of rows) {
      if (r.level < 1) continue;
      if (r.provenance === "SELF_CLAIMED") claimed = true;
      else if (r.provenance === "MANAGER_VERIFIED" || (r.provenance === "AI_INFERRED" && r.level >= 3)) demonstrated = true;
      else learning = true; // AI level 1-2, or a peer endorsement
    }
  }
  return demonstrated ? "demonstrated" : learning ? "learning" : claimed ? "claimed" : "none";
}

export function buildPathway(input: PathwayInput): Pathway {
  const canon = (id: string) => input.canonical?.get(id) ?? id;
  const disputed = new Set(input.disputedSkillIds.map(canon));
  const goals = new Set(input.goalSkillIds.map(canon));
  const rowsBySkill = new Map<string, { provenance: string; level: number }[]>();
  for (const a of input.assessments) {
    const id = canon(a.skillId), list = rowsBySkill.get(id) ?? [];
    list.push(a);
    rowsBySkill.set(id, list);
  }
  const skillStatus = (id: string) => statusOf(rowsBySkill.get(id) ?? [], goals.has(id), disputed.has(id));
  const best = (links: { skillId: string; ref: string }[], ref: string): PathwayStatus => {
    let out: PathwayStatus = "none";
    for (const l of links) {
      if (l.ref !== ref) continue;
      const s = skillStatus(canon(l.skillId));
      if (RANK[s] > RANK[out]) out = s;
    }
    return out;
  };

  const toolMap = new Map<string, { example: string; categoryId: string; hot: boolean; inDemand: boolean }>();
  for (const s of [...input.software].sort((a, b) => cmp(a.example, b.example) || cmp(a.categoryId, b.categoryId))) {
    if (!(s.inDemand || s.hot)) continue;
    const prior = toolMap.get(s.exampleNorm);
    toolMap.set(s.exampleNorm, prior
      ? { ...prior, hot: prior.hot || s.hot, inDemand: prior.inDemand || s.inDemand }
      : { example: s.example, categoryId: s.categoryId, hot: s.hot, inDemand: s.inDemand });
  }
  const tools: PathwayTool[] = [...toolMap.entries()]
    .map(([norm, t]) => ({ ...t, status: best(input.softwareLinks, norm) }))
    .sort((a, b) => Number(b.hot) - Number(a.hot) || cmp(a.example, b.example) || cmp(a.categoryId, b.categoryId));

  const elements = new Map(input.elements.map(e => [e.id, e]));
  const linkedElements = new Set(input.elementLinks.map(l => l.ref));
  const skills = input.ratings
    .filter(r => r.scale === "IM" && !r.suppress && !r.notRelevant)
    .flatMap(r => {
      const e = elements.get(r.elementId);
      return e && (e.domain === "ESSENTIAL_SKILL" || e.domain === "TRANSFERABLE_SKILL") ? [{ e, value: r.value }] : [];
    })
    .sort((a, b) => b.value - a.value || cmp(a.e.name, b.e.name) || cmp(a.e.id, b.e.id))
    .slice(0, SKILL_LIMIT)
    .map(({ e, value }): PathwaySkill => ({
      elementId: e.id, name: e.name, importance: value,
      status: best(input.elementLinks, e.id), notInferred: !linkedElements.has(e.id),
    }));

  const byDwa = new Map<string, Set<string>>();
  for (const m of input.metrics) {
    if (!m.dwaId || !(m.value > 0)) continue;
    const set = byDwa.get(m.dwaId) ?? new Set<string>();
    set.add(m.metricId);
    byDwa.set(m.dwaId, set);
  }
  const activities: PathwayActivity[] = input.dwas
    .filter(d => byDwa.has(d.dwaId))
    .map(d => ({ dwaId: d.dwaId, name: d.name, metricIds: [...byDwa.get(d.dwaId)!].sort(cmp) }))
    .sort((a, b) => cmp(a.name, b.name) || cmp(a.dwaId, b.dwaId));

  const emerging = [...input.emergingTasks]
    .sort((a, b) => cmp(a.task, b.task) || cmp(String(a.id), String(b.id)))
    .map((e): PathwayEmerging => {
      const tasks = input.candidateTasks
        .map(t => ({ ...t, sharedTokens: sharedTokens(e.task, t.title) }))
        .filter(t => t.sharedTokens.length >= MIN_SHARED_TOKENS)
        .sort((a, b) => b.sharedTokens.length - a.sharedTokens.length || cmp(a.title, b.title) || cmp(a.id, b.id))
        .slice(0, EMERGING_TASK_CAP);
      return { id: String(e.id), task: e.task, category: e.category, tasks };
    });

  const related = input.related
    .filter(r => r.tier.startsWith("Primary"))
    .sort((a, b) => a.rank - b.rank || cmp(a.code, b.code))
    .map(r => ({ code: r.code, title: r.title, tier: r.tier }));

  return { occupation: input.occupation, tools, skills, activities, emerging, related };
}
