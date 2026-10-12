// Natural-language skill questions, pure part: parse what can be parsed without a
// model, rank/fuse candidates, build the prompt, and validate the answer.
//
// Retrieval is structured first (skills, level, recency), embeddings second, and
// the model only writes prose over rows we hand it. Every person and every
// evidence item it mentions must map back to a key we supplied; anything else is
// dropped, and an answer with no valid citation falls back to a plain list built
// from the data.

import { normalizeSkillName, type AliasIndex } from "./skillMatchCore.js";

export interface ParsedQuery {
  skillIds: string[];
  matchedPhrases: string[];
  minLevel: number | null;
  activeWithinDays: number | null;
}

const WORD_LEVELS: [RegExp, number][] = [
  [/\b(expert|master|authority)\b/, 5],
  [/\b(advanced|senior|very experienced)\b/, 4],
  [/\b(proficient|experienced|strong|solid|competent)\b/, 3],
];

export function tokenizeQuestion(q: string): string[] {
  return q.toLowerCase().replace(/c\+\+/g, "cplusplus").replace(/c#/g, "csharp").split(/[^a-z0-9]+/).filter(Boolean);
}

/** Longest-first window match of skill names/aliases in the question. */
export function parseStructuredQuery(question: string, index: AliasIndex): ParsedQuery {
  const words = tokenizeQuestion(question);
  const taken = new Array<boolean>(words.length).fill(false);
  const skillIds: string[] = [], phrases: string[] = [];
  for (let size = Math.min(5, words.length); size >= 1; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      if (taken.slice(i, i + size).some(Boolean)) continue;
      const phrase = words.slice(i, i + size);
      const norm = normalizeSkillName(phrase.join(""));
      if (norm.length < 3) continue; // "c", "ee", "pm" are too ambiguous to trust inside a sentence
      const id = index.byNorm.get(norm);
      if (!id) continue;
      if (!skillIds.includes(id)) skillIds.push(id);
      phrases.push(phrase.join(" "));
      for (let j = i; j < i + size; j++) taken[j] = true;
    }
  }

  const q = question.toLowerCase();
  let minLevel: number | null = null;
  const explicit = /\blevel\s*(?:>=|≥|>|=|of|at least|or higher|or above)?\s*([1-5])\b/.exec(q) ?? /\b(?:lvl|l)\s?([1-5])\s*\+/.exec(q) ?? /\bat least\s+(?:a\s+)?level\s*([1-5])\b/.exec(q);
  if (explicit) minLevel = Number(explicit[1]);
  else for (const [re, lvl] of WORD_LEVELS) if (re.test(q)) { minLevel = lvl; break; }

  let activeWithinDays: number | null = null;
  const win = /\b(?:last|past|previous|within|in the last)\s+(\d+)\s*(day|week|month|year)s?\b/.exec(q);
  if (win) activeWithinDays = Number(win[1]) * { day: 1, week: 7, month: 30, year: 365 }[win[2] as "day" | "week" | "month" | "year"];
  else if (/\b(last|past)\s+year\b/.test(q)) activeWithinDays = 365;
  else if (/\b(last|past)\s+(six|6)\s+months\b/.test(q)) activeWithinDays = 180;
  else if (/\b(recent|recently|currently|current|active|lately)\b/.test(q)) activeWithinDays = 180;

  return { skillIds, matchedPhrases: phrases, minLevel, activeWithinDays };
}

/** Looks like a staffing / expertise question (routes the project assistant to skill retrieval). */
export function isSkillIntent(question: string): boolean {
  return /\b(who|whom)\b.*\b(could|can|should|would|knows?|is good|has|have|experienced|expert|take over|handle|work on|help with|lead|own)\b|\bexpert(s|ise)?\b|\bskilled\b|\bwho.s (best|strongest)\b|\bstaff(ing)?\b|\bgood at\b|\bskills?\b/i.test(question);
}

// ── Vectors ──────────────────────────────────────────────────

/** Vectors are stored unit-length, so cosine similarity is a dot product. Mismatched sizes score 0. */
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function topBySimilarity<T extends { embedding: ArrayLike<number> }>(query: ArrayLike<number>, items: T[], k: number, minSimilarity = 0.35): (T & { similarity: number })[] {
  const scored: (T & { similarity: number })[] = [];
  for (const it of items) {
    const similarity = dot(query, it.embedding);
    if (similarity >= minSimilarity) scored.push({ ...it, similarity });
  }
  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, k);
}

/** Reciprocal rank fusion over ranked id lists (k=60). Stable: ties keep first-list order. */
export function fuseRanks(lists: string[][], k = 60): string[] {
  const score = new Map<string, number>(), first = new Map<string, number>();
  let order = 0;
  for (const list of lists) {
    list.forEach((id, rank) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1));
      if (!first.has(id)) first.set(id, order++);
    });
  }
  return [...score.keys()].sort((a, b) => score.get(b)! - score.get(a)! || first.get(a)! - first.get(b)!);
}

// ── Prompt + answer ──────────────────────────────────────────

export interface AskEvidence { key: string; summary: string; source: string; date: string; project: string | null; contribution: string; complexity: number }
export interface AskSkillRow { name: string; provenance: string; level: number; confidence: string; lastDemonstrated: string | null; trend: string }
export interface AskPerson {
  key: string;
  displayName: string;
  title: string | null;
  skills: AskSkillRow[];
  evidence: AskEvidence[];
}

export const ASK_JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    people: {
      type: "array", maxItems: 5,
      items: {
        type: "object",
        properties: { person: { type: "string" }, why: { type: "string" }, evidence: { type: "array", items: { type: "string" }, maxItems: 4 } },
        required: ["person", "why", "evidence"],
      },
    },
  },
  required: ["answer", "people"],
} as const;

export function buildAskPrompt(question: string, today: string, people: AskPerson[], scope: string): string {
  const blocks = people.map((p) => {
    const skills = p.skills.map((s) => `  - ${s.name} [${s.provenance.toLowerCase().replace(/_/g, " ")}] level ${s.level}, ${s.confidence.toLowerCase()} confidence, last ${s.lastDemonstrated ?? "n/a"}, ${s.trend.toLowerCase()}`).join("\n");
    const ev = p.evidence.map((e) => `  - [${e.key}] ${e.date} ${e.source}${e.project ? ` (${e.project})` : ""}, ${e.contribution.toLowerCase()}, complexity ${e.complexity}/5: ${e.summary}`).join("\n");
    return `${p.key}: ${p.displayName}${p.title ? `, ${p.title}` : ""}\n${skills || "  (no matching skill rows)"}\nEvidence:\n${ev || "  (none shown)"}`;
  }).join("\n\n");
  return `${today}

You help a student engineering team lead decide who could take on work. ${scope}
Answer ONLY from the people and evidence below. Do not use outside knowledge about these people.

Rules:
- Skill levels are advisory estimates from project work, 1 (aware) to 5 (expert), with a separate confidence. Say when confidence is low or evidence is old, and when a self-claim or endorsement is not backed by analysed work.
- Never rank people by overall worth or performance. Compare only on the skill asked about.
- Name at most 3 people. For each, give a short reason and cite 1-4 evidence ids exactly as shown, like e3.
- If nobody has good evidence, say so plainly and name no one.
- Refer to people by the keys p1, p2... in the "person" field.

Question: "${question.replace(/"/g, "'")}"

People:
${blocks || "(no one matched)"}`;
}

export interface CleanAnswer {
  answer: string;
  people: { person: string; why: string; evidenceKeys: string[] }[];
  usedFallback: boolean;
}

const CITE = /\[?\be(\d{1,3})\b\]?/g;

export function validateAskAnswer(raw: unknown, people: AskPerson[]): CleanAnswer {
  const byKey = new Map(people.map((p) => [p.key, p]));
  const allEvidence = new Set(people.flatMap((p) => p.evidence.map((e) => e.key)));
  const fallback = (): CleanAnswer => {
    const top = people.filter((p) => p.evidence.length).slice(0, 3);
    return {
      usedFallback: true,
      answer: top.length
        ? "These people have the strongest recorded evidence for this. Check the cited work before deciding; levels are advisory."
        : "No one has clear recorded evidence for this yet.",
      people: top.map((p) => ({ person: p.key, why: p.skills[0] ? `${p.skills[0].name}: level ${p.skills[0].level}, ${p.skills[0].confidence.toLowerCase()} confidence.` : "Matching evidence found.", evidenceKeys: p.evidence.slice(0, 3).map((e) => e.key) })),
    };
  };
  if (typeof raw !== "object" || raw === null) return fallback();
  const r = raw as { answer?: unknown; people?: unknown };
  if (typeof r.answer !== "string" || !Array.isArray(r.people)) return fallback();

  const out: CleanAnswer["people"] = [];
  for (const item of r.people.slice(0, 5)) {
    if (typeof item !== "object" || item === null) continue;
    const it = item as { person?: unknown; why?: unknown; evidence?: unknown };
    const p = typeof it.person === "string" ? byKey.get(it.person) : undefined;
    if (!p || out.some((o) => o.person === p.key)) continue;
    const own = new Set(p.evidence.map((e) => e.key));
    const keys = (Array.isArray(it.evidence) ? it.evidence : []).filter((k): k is string => typeof k === "string" && own.has(k)).slice(0, 4);
    if (!keys.length) continue; // a person with no valid citation is not an answer
    out.push({ person: p.key, why: typeof it.why === "string" ? it.why.replace(/\s+/g, " ").trim().slice(0, 300) : "", evidenceKeys: keys });
  }
  // Strip citations to evidence we never supplied from the prose.
  const answer = r.answer.replace(CITE, (m, n) => (allEvidence.has(`e${n}`) ? m : "")).replace(/\s{2,}/g, " ").trim().slice(0, 1200);
  if (!out.length && people.length && !/\bno one\b|\bnobody\b|\bnone\b/i.test(answer)) return fallback();
  return { answer: answer || fallback().answer, people: out, usedFallback: false };
}

// ── Project assistant block ──────────────────────────────────

export interface ProjectSkillMatch {
  displayName: string;
  onProject: boolean;
  skills: { name: string; provenance: string; level: number; confidenceBand: string; lastDemonstrated: string | null; trend: string }[];
  evidence: { date: string; source: string; project: string | null; summary: string; contribution: string; complexity: number }[];
}

/**
 * Retrieved candidates as plain text for the project assistant. Evidence is
 * described in words (no ids): the assistant's answer is read by people, who
 * can open the cited work from the result cards.
 */
export function renderSkillMatches(matches: ProjectSkillMatch[], filters: { skills: string[]; minLevel: number | null; activeWithinDays: number | null }): string {
  if (!matches.length) return "Skill search: no one has recorded evidence matching this question.";
  const applied = [
    filters.skills.length ? `skills: ${filters.skills.join(", ")}` : "meaning-based match on recorded work",
    filters.minLevel ? `level >= ${filters.minLevel}` : null,
    filters.activeWithinDays ? `active in last ${filters.activeWithinDays} days` : null,
  ].filter(Boolean).join("; ");
  const blocks = matches.map((m) => {
    const skills = m.skills.map((s) => `${s.name} L${s.level} [${s.provenance.toLowerCase().replace(/_/g, " ")}, ${s.confidenceBand.toLowerCase()} confidence${s.lastDemonstrated ? `, last ${s.lastDemonstrated.slice(0, 7)}` : ""}, ${s.trend.toLowerCase()}]`).join("; ");
    const ev = m.evidence.map((e) => `    - ${e.date} ${e.source}${e.project ? ` on ${e.project}` : ""}, ${e.contribution.toLowerCase()}, complexity ${e.complexity}/5: ${e.summary}`).join("\n");
    return `- ${m.displayName} (${m.onProject ? "on this project" : "not on this project"}): ${skills || "no matching skill rows"}\n${ev || "    (no evidence shown)"}`;
  }).join("\n");
  return `Skill search results (advisory; filters: ${applied}):\n${blocks}`;
}
