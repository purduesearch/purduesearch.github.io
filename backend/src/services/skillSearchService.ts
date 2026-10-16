// "Who could take this on?" Structured filters + embedding search over evidence,
// answered with cited evidence. Used by the admin tool and by the project assistant.
//
// Embeddings live in a Float[] column and are ranked in Node (unit vectors, dot
// product): fine for a club's few thousand evidence rows. Past roughly 50k rows,
// move SkillEvidence.embedding to pgvector and replace the embedding query in askSkills() with a
// SQL ORDER BY.

import { prisma } from "../db/prisma.js";
import { createGeminiSkillsLlm, type SkillsLlm } from "./ai/skillsGemini.js";
import { todayContext } from "./geminiService.js";
import { expandSkillIds, ADVISORY } from "./skillAdminService.js";
import { loadAliasIndex, TaxonomyError } from "./skillTaxonomyService.js";
import { visibleSkillPairs, visibleProjectAssessments } from "./skillAccessService.js";
import {
  ASK_JSON_SCHEMA, buildAskPrompt, fuseRanks, parseStructuredQuery, topBySimilarity, validateAskAnswer,
  type AskPerson, type ParsedQuery,
} from "./skillQueryCore.js";

const BAND_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
const MAX_CANDIDATES = 8;
const SEMANTIC_WINDOW_DAYS = 548; // ~18 months
const SEMANTIC_ROW_CAP = 20_000;
type RetrievedSkill = { memberId: string; skillId: string; level: number; confidenceBand: "LOW" | "MEDIUM" | "HIGH"; provenance: string; lastDemonstrated: Date | null; trend: string; skill: { name: string } };

export interface AskInput {
  question: string;
  asker: { id: string; isAdmin: boolean };
  projectId?: string | null;
  /** Injected in tests. Undefined = Gemini when configured; null = structured-only. */
  llm?: SkillsLlm | null;
  /** false = retrieval only (the project assistant writes its own answer from the candidates). Default true. */
  writeAnswer?: boolean;
}

export interface AskResult {
  advisory: string;
  question: string;
  mode: "structured" | "semantic" | "mixed" | "none";
  filters: { skills: { id: string; name: string }[]; minLevel: number | null; activeWithinDays: number | null };
  answer: string;
  modelAnswered: boolean;
  people: {
    /** Only set when a project is given: is this person on it? */
    onProject: boolean | null;
    member: { id: string; displayName: string; avatarUrl: string | null; title: string | null };
    why: string;
    skills: { skillId: string; name: string; provenance: string; level: number; confidenceBand: string; lastDemonstrated: string | null; trend: string }[];
    evidence: { id: string; summary: string; source: string; date: string; url: string | null; project: string | null; contribution: string; complexity: number; cited: boolean }[];
  }[];
}

function defaultLlm(): SkillsLlm | null {
  if (!process.env.GEMINI_API_KEY) return null;
  try { return createGeminiSkillsLlm(); } catch { return null; }
}

async function scopeMembers(input: AskInput): Promise<{ memberIds: string[] | null; projectOnly: boolean }> {
  const { asker, projectId } = input;
  if (asker.isAdmin) return { memberIds: null, projectOnly: false };
  if (!projectId) throw new TaxonomyError("FORBIDDEN", "Ask from inside a project you belong to");
  const mine = await prisma.projectMember.findFirst({ where: { projectId, memberId: asker.id }, select: { memberId: true } });
  if (!mine) throw new TaxonomyError("FORBIDDEN", "You are not a member of that project");
  const members = await prisma.projectMember.findMany({ where: { projectId }, select: { memberId: true } });
  return { memberIds: members.map((m) => m.memberId), projectOnly: true };
}

export async function askSkills(input: AskInput): Promise<AskResult> {
  const question = input.question.replace(/\s+/g, " ").trim();
  if (question.length < 5 || question.length > 500) throw new TaxonomyError("INVALID", "Ask a question of 5-500 characters");
  const scope = await scopeMembers(input);
  const llm = input.llm === undefined ? defaultLlm() : input.llm;

  const index = await loadAliasIndex();
  const parsed: ParsedQuery = parseStructuredQuery(question, index);
  const skillIds = await expandSkillIds(parsed.skillIds, true);
  const names = parsed.skillIds.length ? await prisma.skill.findMany({ where: { id: { in: parsed.skillIds } }, select: { id: true, name: true } }) : [];
  const since = parsed.activeWithinDays ? new Date(Date.now() - parsed.activeWithinDays * 86_400_000) : null;
  const memberFilter = { isBot: false, ...(scope.memberIds ? { id: { in: scope.memberIds } } : {}) };
  const visiblePairs = scope.projectOnly ? await visibleSkillPairs(scope.memberIds ?? []) : null;
  const assessmentAccess = visiblePairs ? { OR: visiblePairs } : {};
  const evidenceAccess = visiblePairs ? { AND: [{ OR: visiblePairs.map(p => ({ memberId: p.memberId, skills: { some: { skillId: p.skillId } } })) }] } : {};
  const projectRows = scope.projectOnly ? await visibleProjectAssessments(scope.memberIds ?? [], input.projectId!) : null;

  // ── structured candidates ──
  const rows: RetrievedSkill[] = projectRows ? projectRows.filter(r => skillIds.includes(r.skillId) && r.level >= (parsed.minLevel ?? 1) && (!since || r.lastDemonstrated >= since)) : skillIds.length
    ? await prisma.skillAssessment.findMany({
        where: { skillId: { in: skillIds }, level: { gte: parsed.minLevel ?? 1 }, member: memberFilter, ...assessmentAccess, ...(since ? { lastDemonstrated: { gte: since } } : {}) },
        include: { skill: { select: { name: true } } }, take: 1500,
      })
    : [];
  const structuredByMember = new Map<string, typeof rows>();
  for (const r of rows) structuredByMember.set(r.memberId, [...(structuredByMember.get(r.memberId) ?? []), r]);
  const best = (list: typeof rows) => [...list].sort((a, b) => b.level - a.level || BAND_RANK[b.confidenceBand] - BAND_RANK[a.confidenceBand])[0];
  const structuredOrder = [...structuredByMember.entries()]
    .map(([id, list]) => ({ id, b: best(list) }))
    .sort((x, y) => y.b.level - x.b.level || BAND_RANK[y.b.confidenceBand] - BAND_RANK[x.b.confidenceBand] || (y.b.lastDemonstrated?.getTime() ?? 0) - (x.b.lastDemonstrated?.getTime() ?? 0) || x.id.localeCompare(y.id))
    .map((x) => x.id);

  // ── semantic candidates ──
  let semantic: { id: string; memberId: string; similarity: number }[] = [];
  if (llm) {
    try {
      const { vectors } = await llm.embed([question]);
      const q = vectors[0];
      if (q?.length) {
        const pool = await prisma.skillEvidence.findMany({
          where: {
            supersededAt: null, embedding: { isEmpty: false }, occurredAt: { gte: new Date(Date.now() - SEMANTIC_WINDOW_DAYS * 86_400_000) },
            member: memberFilter, ...(scope.projectOnly ? { projectId: input.projectId } : {}),
            ...evidenceAccess,
          },
          select: { id: true, memberId: true, embedding: true }, orderBy: { occurredAt: "desc" }, take: SEMANTIC_ROW_CAP,
        });
        semantic = topBySimilarity(q, pool, 30).map((s) => ({ id: s.id, memberId: s.memberId, similarity: s.similarity }));
      }
    } catch (e) {
      console.error("[skills] semantic search unavailable:", (e as Error)?.message ?? e);
    }
  }
  const semanticOrder = [...new Set(semantic.map((s) => s.memberId))];
  const candidates = fuseRanks([structuredOrder, semanticOrder]).slice(0, MAX_CANDIDATES);
  const mode: AskResult["mode"] = structuredOrder.length && semanticOrder.length ? "mixed" : structuredOrder.length ? "structured" : semanticOrder.length ? "semantic" : "none";

  const filters = { skills: names, minLevel: parsed.minLevel, activeWithinDays: parsed.activeWithinDays };
  if (!candidates.length) {
    return { advisory: ADVISORY, question, mode, filters, answer: "No one has recorded evidence matching that yet.", modelAnswered: false, people: [] };
  }

  // ── assemble per-person context ──
  const members = await prisma.member.findMany({ where: { id: { in: candidates } }, select: { id: true, displayName: true, avatarUrl: true, title: true } });
  const memberById = new Map(members.map((m) => [m.id, m]));
  const semanticIds = new Set(semantic.map((s) => s.id));
  const simById = new Map(semantic.map((s) => [s.id, s.similarity]));
  const evidenceRows = await prisma.skillEvidence.findMany({
    where: {
      memberId: { in: candidates }, supersededAt: null, ...(scope.projectOnly ? { projectId: input.projectId } : {}),
      ...evidenceAccess,
      OR: [...(skillIds.length ? [{ skills: { some: { skillId: { in: skillIds } } } }] : []), ...(semanticIds.size ? [{ id: { in: [...semanticIds] } }] : [])],
    },
    select: { id: true, memberId: true, summary: true, source: true, sourceUrl: true, occurredAt: true, projectId: true, contribution: true, complexity: true },
    orderBy: { occurredAt: "desc" }, take: 400,
  });
  const projectIds = [...new Set(evidenceRows.map((e) => e.projectId).filter((p): p is string => !!p))];
  const projects = projectIds.length ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [];
  const pname = new Map(projects.map((p) => [p.id, p.name]));

  // Skills to show when the question named none: the member's strongest rows among the semantic hits' skills.
  const semanticSkillIds = !skillIds.length && semanticIds.size
    ? [...new Set((await prisma.skillEvidenceSkill.findMany({ where: { evidenceId: { in: [...semanticIds] } }, select: { skillId: true } })).map((j) => j.skillId))]
    : [];
  const semanticSkillRows: RetrievedSkill[] = projectRows ? projectRows.filter(r => semanticSkillIds.includes(r.skillId) && candidates.includes(r.memberId)) : semanticSkillIds.length
    ? await prisma.skillAssessment.findMany({
        where: { memberId: { in: candidates }, skillId: { in: semanticSkillIds }, ...assessmentAccess },
        include: { skill: { select: { name: true } } }, take: 200,
      })
    : [];

  let evN = 0;
  const people: AskPerson[] = [];
  const raw: { person: string; memberId: string; evidence: Map<string, (typeof evidenceRows)[number]> }[] = [];
  candidates.forEach((memberId, i) => {
    const m = memberById.get(memberId);
    if (!m) return;
    const own = evidenceRows
      .filter((e) => e.memberId === memberId)
      .sort((a, b) => (simById.get(b.id) ?? -1) - (simById.get(a.id) ?? -1) || b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 4);
    const skillRows = (skillIds.length ? structuredByMember.get(memberId) ?? [] : semanticSkillRows.filter((r) => r.memberId === memberId))
      .sort((a, b) => b.level - a.level).slice(0, 4);
    const key = `p${i + 1}`;
    const keyed = new Map<string, (typeof evidenceRows)[number]>();
    const evidence = own.map((e) => {
      const ek = `e${++evN}`;
      keyed.set(ek, e);
      return { key: ek, summary: e.summary, source: e.source.toLowerCase(), date: e.occurredAt.toISOString().slice(0, 10), project: e.projectId ? pname.get(e.projectId) ?? null : null, contribution: e.contribution, complexity: e.complexity };
    });
    people.push({
      key, displayName: m.displayName, title: m.title, evidence,
      skills: skillRows.map((r) => ({ name: r.skill.name, provenance: r.provenance, level: r.level, confidence: r.confidenceBand, lastDemonstrated: r.lastDemonstrated?.toISOString().slice(0, 10) ?? null, trend: r.trend })),
    });
    raw.push({ person: key, memberId, evidence: keyed });
  });

  // ── answer ──
  let modelRaw: unknown = null;
  let modelAnswered = false;
  if (llm && input.writeAnswer !== false) {
    try {
      const res = await llm.generateJson({ prompt: buildAskPrompt(question, todayContext(), people, input.projectId ? "The team lead is asking about a specific project." : "The question may concern any project."), schema: ASK_JSON_SCHEMA, maxOutputTokens: 1024 });
      modelRaw = JSON.parse(res.text);
      modelAnswered = true;
    } catch (e) {
      console.error("[skills] answer generation failed, using plain results:", (e as Error)?.message ?? e);
    }
  }
  const clean = validateAskAnswer(modelAnswered ? modelRaw : null, people);
  if (clean.usedFallback) modelAnswered = false;

  const shown = new Set(clean.people.map((p) => p.person));
  const order = [...clean.people.map((p) => p.person), ...people.filter((p) => !shown.has(p.key)).map((p) => p.key)];
  const onProject = input.projectId
    ? new Set((await prisma.projectMember.findMany({ where: { projectId: input.projectId, memberId: { in: candidates } }, select: { memberId: true } })).map((m) => m.memberId))
    : null;
  const out: AskResult["people"] = order.map((pk) => {
    const p = people.find((x) => x.key === pk)!, r = raw.find((x) => x.person === pk)!;
    const verdict = clean.people.find((c) => c.person === pk);
    const cited = new Set(verdict?.evidenceKeys ?? []);
    const rowsForSkills = skillIds.length ? structuredByMember.get(r.memberId) ?? [] : semanticSkillRows.filter((x) => x.memberId === r.memberId);
    return {
      onProject: onProject ? onProject.has(r.memberId) : null,
      member: memberById.get(r.memberId)!, why: verdict?.why ?? "",
      skills: rowsForSkills.sort((a, b) => b.level - a.level).slice(0, 4).map((s) => ({ skillId: s.skillId, name: s.skill.name, provenance: s.provenance, level: s.level, confidenceBand: s.confidenceBand, lastDemonstrated: s.lastDemonstrated?.toISOString() ?? null, trend: s.trend })),
      evidence: p.evidence.map((e) => {
        const row = r.evidence.get(e.key)!;
        return { id: row.id, summary: e.summary, source: e.source, date: e.date, url: row.sourceUrl, project: e.project, contribution: e.contribution, complexity: e.complexity, cited: cited.has(e.key) };
      }),
    };
  });
  return { advisory: ADVISORY, question, mode, filters, answer: clean.answer, modelAnswered, people: out };
}

/** Fill in embeddings that were missing when evidence was written (an embedding outage). Derived data; allowed by the append-only trigger. */
export async function embedMissingEvidence(opts: { limit?: number; llm?: SkillsLlm | null } = {}): Promise<{ embedded: number; remaining: number }> {
  const llm = opts.llm === undefined ? defaultLlm() : opts.llm;
  if (!llm) return { embedded: 0, remaining: await prisma.skillEvidence.count({ where: { supersededAt: null, embedding: { isEmpty: true } } }) };
  let embedded = 0;
  const limit = opts.limit ?? 500;
  while (embedded < limit) {
    const batch = await prisma.skillEvidence.findMany({ where: { supersededAt: null, embedding: { isEmpty: true } }, select: { id: true, summary: true }, take: Math.min(50, limit - embedded), orderBy: { occurredAt: "desc" } });
    if (!batch.length) break;
    const { vectors } = await llm.embed(batch.map((b) => b.summary));
    for (let i = 0; i < batch.length; i++) {
      if (vectors[i]?.length) { await prisma.skillEvidence.update({ where: { id: batch[i].id }, data: { embedding: vectors[i] } }); embedded++; }
    }
    if (!vectors.some((v) => v?.length)) break;
  }
  return { embedded, remaining: await prisma.skillEvidence.count({ where: { supersededAt: null, embedding: { isEmpty: true } } }) };
}
