// The weekly skills run: collect new artifacts -> analyse with Gemini -> validate
// -> write append-only evidence -> queue proposals -> recompute assessments.
//
// Incremental and idempotent: collectors read (watermark - overlap, run start],
// artifacts already analysed under the current prompt version are skipped by
// content hash, and a watermark only advances past work that finished. Re-running
// is always safe. All side effects go through the injected PipelineStore, so the
// whole flow is testable with in-memory fakes.

import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createGeminiSkillsLlm, createSkillsBudget, estimateCostUsd, pricesFromEnv, type SkillsLlm } from "./ai/skillsGemini.js";
import { analyzeArtifact, analyzeArtifactsBatch, prepareAnalysis, type AnalysisOutcome, type Taxonomy } from "./skillAnalysisService.js";
import { maxArtifactChars } from "./skillArtifactCore.js";
import { collectGithub } from "./skillCollectors/github.js";
import { collectTasks } from "./skillCollectors/task.js";
import { collectVault } from "./skillCollectors/vault.js";
import type { CollectResult, CollectWindow } from "./skillCollectors/types.js";
import { existingEvidenceKeys, writeEvidence } from "./skillEvidenceService.js";
import { recomputeMembers } from "./skillAssessmentService.js";
import {
  COLLECTORS, computeWindow, dedupeArtifacts, evidenceKey, mapPool, nextWatermark, runStatus,
  type CollectorName, type Origin, type RunStatus,
} from "./skillPipelineCore.js";
import { PROMPT_VERSION, RUBRIC_VERSION, type SkillArtifact } from "./skillPrompts.js";
import { buildAliasIndex } from "./skillMatchCore.js";
import {
  loadSkillLites, loadSuppressed, seedTaxonomy, type ProposalOutcome, type ProposedSkillInput,
} from "./skillTaxonomyService.js";
import { SEED_SKILLS } from "./skillSeedData.js";
import { catalogPolicy, processCatalogProposal, reconcileCatalog } from "./skillCatalogService.js";

// ── Store (all I/O) ──────────────────────────────────────────

export type RunTrigger = "CRON" | "MANUAL" | "BACKFILL";

export interface RunPatch {
  status: RunStatus;
  finishedAt: Date;
  watermarks: Partial<Record<CollectorName, string>>;
  counts: Record<string, number>;
  tokensIn: number;
  tokensOut: number;
  embedTokens: number;
  estCostUsd: number;
  errors: { stage: string; message: string }[];
  modelVersion: string | null;
}

export interface PipelineStore {
  startRun(a: { trigger: RunTrigger; scope: unknown | null; leaseMinutes: number; startedById?: string | null; now: Date }): Promise<string | null>;
  previousWatermarks(): Promise<Partial<Record<CollectorName, Date>>>;
  loadTaxonomy(): Promise<Taxonomy>;
  loadSuppressed(): Promise<Set<string>>;
  existingKeys(artifacts: SkillArtifact[]): Promise<Set<string>>;
  proposal(input: ProposedSkillInput & { artifact?: SkillArtifact }, ctx: { index: Taxonomy["index"]; suppressed: ReadonlySet<string> }): Promise<ProposalOutcome>;
  reconcile?(): Promise<void>;
  write(a: SkillArtifact, analysis: Parameters<typeof writeEvidence>[1], embedding: number[], meta: Parameters<typeof writeEvidence>[3]): Promise<string | null>;
  recompute(memberIds: string[], modelVersion: string | null): Promise<{ members: number; upserted: number; removed: number }>;
  finishRun(id: string, patch: RunPatch): Promise<void>;
  /** Extend the lease, publish progress, and report whether an admin asked to stop. Optional in tests. */
  heartbeat?(id: string, a: { leaseMinutes: number; progress: RunProgress; now: Date }): Promise<{ cancel: boolean }>;
  /** Install the starter taxonomy when there are no active skills at all. Returns how many were created. */
  ensureTaxonomy?(): Promise<number>;
}

export interface RunProgress { stage: string; done: number; total: number }

export class RunCancelled extends Error { constructor() { super("cancelled by an admin"); } }

export const prismaStore: PipelineStore = {
  async startRun(a) {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('skills-run')) AS locked`;
      if (!rows[0]?.locked) return null;
      await tx.skillRun.updateMany({
        where: { status: "RUNNING", leaseUntil: { lt: a.now } },
        data: { status: "FAILED", finishedAt: a.now, errors: [{ stage: "lease", message: "lease expired; run presumed dead" }] },
      });
      if (await tx.skillRun.count({ where: { status: "RUNNING" } })) return null;
      const run = await tx.skillRun.create({
        data: {
          trigger: a.trigger, scope: a.scope === null ? undefined : (a.scope as Prisma.InputJsonValue), startedAt: a.now,
          leaseUntil: new Date(a.now.getTime() + a.leaseMinutes * 60_000), startedById: a.startedById ?? null, promptVersion: PROMPT_VERSION,
        },
        select: { id: true },
      });
      return run.id;
    });
  },
  async previousWatermarks() {
    const runs = await prisma.skillRun.findMany({
      where: { status: { in: ["SUCCEEDED", "PARTIAL"] }, scope: { equals: Prisma.DbNull } },
      orderBy: { startedAt: "desc" }, take: 20, select: { watermarks: true },
    });
    const out: Partial<Record<CollectorName, Date>> = {};
    for (const r of runs) {
      const w = (r.watermarks ?? {}) as Record<string, string>;
      for (const c of COLLECTORS) if (!out[c] && w[c]) out[c] = new Date(w[c]);
    }
    return out;
  },
  async loadTaxonomy() {
    const rows = await prisma.skill.findMany({
      where: { status: "ACTIVE", canonicalId: null },
      select: { id: true, name: true, type: true, aliases: { select: { alias: true } }, parents: { where: { kind: "PARENT" }, select: { toId: true } } },
      orderBy: { slug: "asc" },
    });
    const skills = rows.map((r) => ({ id: r.id, name: r.name, type: r.type, aliases: r.aliases.map((a) => a.alias), parentIds: r.parents.map((p) => p.toId) }));
    // Deprecated skills stay resolvable so their old names map instead of re-proposing.
    const index = buildAliasIndex(await loadSkillLites(prisma, { activeOnly: false }));
    return { skills, index };
  },
  loadSuppressed: () => loadSuppressed(),
  existingKeys: (artifacts) => existingEvidenceKeys(artifacts),
  proposal: input => processCatalogProposal(input),
  reconcile: () => reconcileCatalog(),
  write: (a, analysis, embedding, meta) => writeEvidence(a, analysis, embedding, meta),
  async recompute(memberIds, modelVersion) { return recomputeMembers(memberIds, { modelVersion }); },
  async heartbeat(id, a) {
    const row = await prisma.skillRun.update({
      where: { id },
      data: { leaseUntil: new Date(a.now.getTime() + a.leaseMinutes * 60_000), progress: { ...a.progress, updatedAt: a.now.toISOString() } },
      select: { cancelRequested: true },
    });
    return { cancel: row.cancelRequested };
  },
  async ensureTaxonomy() {
    if (await prisma.skill.count({ where: { status: "ACTIVE" } })) return 0;
    return (await seedTaxonomy(SEED_SKILLS)).created;
  },
  async finishRun(id, p) {
    await prisma.skillRun.update({
      where: { id },
      data: {
        progress: Prisma.DbNull, leaseUntil: null,
        status: p.status, finishedAt: p.finishedAt, watermarks: p.watermarks, counts: p.counts, tokensIn: p.tokensIn, tokensOut: p.tokensOut,
        embedTokens: p.embedTokens, estCostUsd: p.estCostUsd, errors: p.errors.slice(0, 50), modelVersion: p.modelVersion,
      },
    });
  },
};

// ── Run ──────────────────────────────────────────────────────

export interface PipelineOptions {
  trigger: RunTrigger;
  /** Restrict to these members. A scoped run never moves the global watermarks. */
  memberIds?: string[];
  /** Explicit window. Any explicit window (backfill, manual check) never moves the watermarks. */
  since?: Date;
  until?: Date;
  /** Collect and estimate only: no model calls, no writes, no run row. */
  dryRun?: boolean;
  startedById?: string | null;
}

export interface PipelineDeps {
  store: PipelineStore;
  /** Required unless dryRun. */
  llm?: SkillsLlm | null;
  collectors?: Record<CollectorName, (win: CollectWindow) => Promise<CollectResult>>;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  log?: (msg: string) => void;
}

export interface PipelineSummary {
  runId: string | null;
  status: RunStatus | "SKIPPED" | "DRY_RUN";
  reason?: string;
  counts: Record<string, number>;
  tokensIn: number;
  tokensOut: number;
  embedTokens: number;
  estCostUsd: number;
  errors: { stage: string; message: string }[];
  watermarks: Partial<Record<CollectorName, string>>;
}

const DEFAULT_COLLECTORS: NonNullable<PipelineDeps["collectors"]> = { github: collectGithub, cad: collectVault, task: collectTasks };

const intEnv = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

export async function runSkillPipeline(opts: PipelineOptions, deps: PipelineDeps): Promise<PipelineSummary> {
  const env = deps.env ?? process.env;
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => {});
  const { store } = deps;
  const collectors = deps.collectors ?? DEFAULT_COLLECTORS;
  const llm = deps.llm ?? null;
  if (!opts.dryRun && !llm) throw new Error("runSkillPipeline needs an llm unless dryRun is set");

  const maxPerRun = intEnv(env.SKILLS_MAX_ARTIFACTS_PER_RUN, 500);
  const collectCap = intEnv(env.SKILLS_COLLECT_CAP, 2000);
  const batchThreshold = intEnv(env.SKILLS_BATCH_MIN_ITEMS, 50);
  const concurrency = intEnv(env.SKILLS_CONCURRENCY, 4);
  const initialLookbackDays = intEnv(env.SKILLS_INITIAL_LOOKBACK_DAYS, 90);
  const explicitWindow = !!(opts.since || opts.until || opts.memberIds?.length);
  const prices = pricesFromEnv(env);

  const summary: PipelineSummary = {
    runId: null, status: "SUCCEEDED", counts: {}, tokensIn: 0, tokensOut: 0, embedTokens: 0, estCostUsd: 0, errors: [], watermarks: {},
  };
  const c = summary.counts;
  const bump = (k: string, n = 1) => { c[k] = (c[k] ?? 0) + n; };
  const err = (stage: string, message: string) => { if (summary.errors.length < 50) summary.errors.push({ stage, message: message.slice(0, 300) }); };

  // Short lease, renewed by heartbeats: a run killed by a deploy or crash frees the slot in minutes, not hours.
  const leaseMinutes = intEnv(env.SKILLS_RUN_LEASE_MINUTES, 20);
  if (!opts.dryRun) {
    const runId = await store.startRun({
      trigger: opts.trigger, scope: opts.memberIds?.length ? { memberIds: opts.memberIds } : explicitWindow ? { since: opts.since, until: opts.until } : null,
      leaseMinutes, startedById: opts.startedById, now,
    });
    if (!runId) return { ...summary, status: "SKIPPED", reason: "another skills run is in progress" };
    summary.runId = runId;
  }

  let lastBeat = 0;
  const beatEveryMs = Number.isFinite(Number(env.SKILLS_HEARTBEAT_MS)) && env.SKILLS_HEARTBEAT_MS !== "" && env.SKILLS_HEARTBEAT_MS !== undefined ? Number(env.SKILLS_HEARTBEAT_MS) : 5_000;
  /** Throttled to one write per 5 s unless forced (stage changes). Throws RunCancelled when asked to stop. */
  const beat = async (progress: RunProgress, force = false, leaseFor = leaseMinutes) => {
    if (!summary.runId || !store.heartbeat) return;
    const t = Date.now();
    if (!force && t - lastBeat < beatEveryMs) return;
    lastBeat = t;
    const r = await store.heartbeat(summary.runId, { leaseMinutes: leaseFor, progress, now: new Date() }).catch(() => ({ cancel: false }));
    if (r.cancel) throw new RunCancelled();
  };

  try {
    // 0. A fresh install has no skills; every analysis would come back empty.
    if (!opts.dryRun && store.ensureTaxonomy) {
      const seeded = await store.ensureTaxonomy();
      if (seeded) { bump("starterSkillsInstalled", seeded); log(`[skills] installed ${seeded} starter skills`); }
    }

    // 1. Collect
    const previous = explicitWindow ? {} : await store.previousWatermarks();
    const origins: Origin[] = [];
    const collected = new Map<CollectorName, { ok: boolean; result: CollectResult | null }>();
    for (const [ci, name] of COLLECTORS.entries()) {
      await beat({ stage: `collect:${name}`, done: ci, total: COLLECTORS.length }, true);
      const win: CollectWindow = {
        ...computeWindow({ now, lastWatermark: previous[name] ?? null, initialLookbackDays, sinceOverride: opts.since, untilOverride: opts.until }),
        memberIds: opts.memberIds, maxArtifacts: collectCap, maxChars: maxArtifactChars(env),
      };
      try {
        const result = await collectors[name](win);
        collected.set(name, { ok: true, result });
        for (const a of result.artifacts) origins.push({ collector: name, artifact: a });
        bump("unmapped", result.unmapped);
        for (const e of result.errors) { err(`collect:${name}`, e); bump("collectorWarnings"); }
        log(`[skills] ${name}: ${result.artifacts.length} artifacts${result.truncated ? " (truncated)" : ""}`);
      } catch (e) {
        collected.set(name, { ok: false, result: null });
        err(`collect:${name}`, String((e as Error)?.message ?? e));
        bump("collectorsFailed");
      }
    }
    const unique = dedupeArtifacts(origins);
    bump("seen", unique.length);

    // 2. Skip what is already analysed
    const existing = await store.existingKeys(unique.map((o) => o.artifact));
    const fresh = unique.filter((o) => !existing.has(evidenceKey(o.artifact, PROMPT_VERSION)));
    bump("alreadyAnalyzed", unique.length - fresh.length);
    fresh.sort((a, b) => a.artifact.occurredAt.getTime() - b.artifact.occurredAt.getTime());

    // 3. Per-run cap: leftovers hold the watermark so next week picks them up
    const work = fresh.slice(0, maxPerRun);
    const holdBack = new Map<CollectorName, Date[]>();
    const hold = (o: Origin) => holdBack.set(o.collector, [...(holdBack.get(o.collector) ?? []), o.artifact.occurredAt]);
    for (const o of fresh.slice(maxPerRun)) { hold(o); bump("deferredOverCap"); }
    bump("toAnalyze", work.length);

    const taxonomy = await store.loadTaxonomy();
    const suppressed = await store.loadSuppressed();

    if (opts.dryRun) {
      let promptChars = 0;
      for (const o of work) promptChars += prepareAnalysis(o.artifact, taxonomy).prompt.length;
      summary.tokensIn = Math.ceil(promptChars / 4);
      summary.tokensOut = work.length * 250;
      summary.embedTokens = work.length * 60;
      summary.estCostUsd = estimateCostUsd({ tokensIn: summary.tokensIn, tokensOut: summary.tokensOut, embedTokens: summary.embedTokens }, prices);
      return { ...summary, status: "DRY_RUN" };
    }

    // 4. Analyse
    const useBatch = !!llm!.batchGenerateJson && work.length >= batchThreshold;
    const outcomes = new Map<number, AnalysisOutcome>();
    // A batch job is one long wait with no checkpoints: hold the lease for its whole timeout.
    await beat({ stage: useBatch ? "analyze:batch" : "analyze", done: 0, total: work.length }, true,
      useBatch ? Math.max(leaseMinutes, intEnv(env.SKILLS_BATCH_TIMEOUT_MINUTES, 180) + 15) : leaseMinutes);
    if (useBatch) {
      const batched = await analyzeArtifactsBatch(work.map((o, i) => ({ id: String(i), artifact: o.artifact })), taxonomy, llm!);
      for (const [k, v] of batched) outcomes.set(Number(k), v);
    } else {
      let done = 0;
      let cancelled = false;
      await mapPool(work, concurrency, async (o, i) => {
        if (cancelled) return;
        outcomes.set(i, await analyzeArtifact(o.artifact, taxonomy, llm!));
        done++;
        try { await beat({ stage: "analyze", done, total: work.length }); } catch (e) { if (e instanceof RunCancelled) cancelled = true; else throw e; }
      });
      if (cancelled) throw new RunCancelled();
    }

    type Ready = { o: Origin; analysis: Extract<AnalysisOutcome, { status: "ok" }>["analysis"] };
    const ready: Ready[] = [];
    work.forEach((o, i) => {
      const r = outcomes.get(i)!;
      if (r.status === "error") {
        bump("failed");
        err(`analyze:${o.artifact.source}`, `${o.artifact.sourceRef}: ${r.error}`);
        if (r.retryable) hold(o);
        return;
      }
      summary.tokensIn += r.usage.tokensIn; summary.tokensOut += r.usage.tokensOut;
      if (r.status === "invalid") {
        bump("invalid");
        err(`validate:${o.artifact.source}`, `${o.artifact.sourceRef}: ${r.reason}`);
        return;
      }
      bump("analyzed");
      ready.push({ o, analysis: r.analysis });
    });

    // 5. Embed, write evidence, queue proposals
    await beat({ stage: "write", done: 0, total: ready.length }, true);
    const withSkills = ready.filter((r) => r.analysis.skills.length > 0);
    let vectors: number[][] = [];
    if (withSkills.length) {
      try {
        const emb = await llm!.embed(withSkills.map((r) => r.analysis.summary));
        vectors = emb.vectors; summary.embedTokens += emb.tokens;
      } catch (e) {
        err("embed", String((e as Error)?.message ?? e));
        bump("embedFailed", withSkills.length);
      }
    }
    const meta = { modelVersion: llm!.modelVersion, promptVersion: PROMPT_VERSION, rubricVersion: RUBRIC_VERSION, runId: summary.runId };
    const touched = new Set<string>();
    for (const [ri, r] of ready.entries()) {
      await beat({ stage: "write", done: ri, total: ready.length });
      let evidenceId: string | null = null;
      if (r.analysis.skills.length > 0) {
        const vec = vectors[withSkills.indexOf(r)] ?? [];
        evidenceId = await store.write(r.o.artifact, r.analysis, vec, meta);
        if (evidenceId) { bump("evidenceWritten"); touched.add(r.o.artifact.memberId); } else bump("duplicateSkipped");
      } else if (r.analysis.proposed.length > 0) {
        // Work that only shows a not-yet-listed skill is still recorded (with no tags), so approving
        // the proposal can credit it straight away instead of waiting for a backfill.
        evidenceId = await store.write(r.o.artifact, r.analysis, [], meta);
        bump("noSkillSignal");
      } else bump("noSkillSignal");
      for (const p of r.analysis.proposed) {
        const res = await store.proposal({ name: p.name, type: p.type, rationale: p.rationale, description: p.description, supportingQuote: p.supportingQuote, parentIds: p.parentId ? [p.parentId] : [], artifact: r.o.artifact, evidenceId, runId: summary.runId }, { index: taxonomy.index, suppressed });
        if (res.kind === "queued" && res.isNew) bump("proposalsQueued");
        else if (res.kind === "mapped") { bump("proposalsMapped"); touched.add(r.o.artifact.memberId); }
        else if (res.kind === "created") { bump("skillsCreated"); touched.add(r.o.artifact.memberId); }
      }
    }

    // 6. Assessments for everyone whose evidence changed
    if (touched.size) {
      await beat({ stage: "recompute", done: 0, total: touched.size }, true);
      const rec = await store.recompute([...touched], llm!.modelVersion);
      bump("membersRecomputed", rec.members); bump("assessmentsWritten", rec.upserted);
    }

    if (store.reconcile) await store.reconcile();

    // 7. Watermarks (only for unscoped, default-window runs)
    if (!explicitWindow) {
      for (const name of COLLECTORS) {
        const col = collected.get(name)!;
        const until = computeWindow({ now, lastWatermark: previous[name] ?? null, initialLookbackDays }).until;
        const wm = nextWatermark({ now, until, previous: previous[name] ?? null, collectorOk: col.ok, resumeFrom: col.result?.resumeFrom ?? null, holdBack: holdBack.get(name) ?? [] });
        if (wm) summary.watermarks[name] = wm.toISOString();
      }
    }

    summary.estCostUsd = estimateCostUsd({ tokensIn: summary.tokensIn, tokensOut: summary.tokensOut, embedTokens: summary.embedTokens, batch: useBatch }, prices);
    summary.status = runStatus({ collectorsTotal: COLLECTORS.length, collectorsFailed: c.collectorsFailed ?? 0, analyzed: c.analyzed ?? 0, failed: (c.failed ?? 0) + (c.invalid ?? 0) });
    if (summary.errors.some(e => /budget reservation exhausted/.test(e.message))) { summary.watermarks = {}; summary.reason = "budget"; }
  } catch (e) {
    summary.status = "FAILED";
    if (e instanceof RunCancelled) { summary.reason = "cancelled"; err("cancelled", "An admin stopped this run. Evidence already written is kept; watermarks did not move."); }
    else err("pipeline", String((e as Error)?.stack ?? e));
  }

  if (summary.runId) {
    await store.finishRun(summary.runId, {
      status: summary.status as RunStatus, finishedAt: (deps.now ?? (() => new Date()))(), watermarks: summary.watermarks, counts: summary.counts,
      tokensIn: summary.tokensIn, tokensOut: summary.tokensOut, embedTokens: summary.embedTokens, estCostUsd: summary.estCostUsd, errors: summary.errors,
      modelVersion: llm?.modelVersion ?? null,
    }).catch((e) => console.error("[skills] could not record run result:", e));
  }
  return summary;
}

/** Production wiring: real DB, real Gemini lane. */
export async function runWeeklySkillRun(opts: Partial<PipelineOptions> = {}): Promise<PipelineSummary> {
  const policy = opts.dryRun ? null : await catalogPolicy();
  if (policy?.paused) return { runId: null, status: "SKIPPED", reason: "Skills automation is paused", counts: {}, tokensIn: 0, tokensOut: 0, embedTokens: 0, estCostUsd: 0, errors: [], watermarks: {} };
  return runSkillPipeline({ trigger: "CRON", ...opts }, { store: prismaStore, llm: opts.dryRun ? null : createGeminiSkillsLlm(process.env, { reserve: createSkillsBudget(policy!.maxRunCostUsd) }) });
}
