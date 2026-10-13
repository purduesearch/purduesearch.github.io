// Weekly pipeline end to end with an in-memory store, fake collectors and fake LLM.
// No DB, no network. Run: cd backend && npx tsx src/services/skillPipeline.test.ts

import { runSkillPipeline, type PipelineDeps, type PipelineStore, type RunPatch } from "./skillPipelineService.js";
import { chunkWindows, computeWindow, dedupeArtifacts, evidenceKey, GIVE_UP_DAYS, mapPool, nextWatermark, runStatus, storedHash } from "./skillPipelineCore.js";
import { PROMPT_VERSION, type SkillArtifact } from "./skillPrompts.js";
import { buildAliasIndex } from "./skillMatchCore.js";
import type { SkillsLlm, BatchItem } from "./ai/skillsGemini.js";
import type { CollectResult } from "./skillCollectors/types.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}
const DAY = 86_400_000;
const NOW = new Date("2026-10-18T02:30:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

// ── core helpers ──
{
  const w = computeWindow({ now: NOW, lastWatermark: ago(7) });
  check("window overlaps previous watermark by a day", w.since.getTime() === ago(8).getTime() && w.until.getTime() === NOW.getTime());
  check("first run looks back initial days", computeWindow({ now: NOW, initialLookbackDays: 30 }).since.getTime() === ago(30).getTime());
  check("explicit since wins", computeWindow({ now: NOW, lastWatermark: ago(7), sinceOverride: ago(100) }).since.getTime() === ago(100).getTime());
  check("chunkWindows covers range", chunkWindows(ago(30), NOW, 14).length === 3 && chunkWindows(ago(30), NOW, 14)[2].until.getTime() === NOW.getTime());
  check("watermark advances to until", nextWatermark({ now: NOW, until: NOW, previous: ago(7), collectorOk: true, resumeFrom: null, holdBack: [] })!.getTime() === NOW.getTime());
  check("failed collector keeps watermark", nextWatermark({ now: NOW, until: NOW, previous: ago(7), collectorOk: false, resumeFrom: null, holdBack: [] }) === null);
  check("truncation stops at resume point", nextWatermark({ now: NOW, until: NOW, previous: ago(7), collectorOk: true, resumeFrom: ago(3), holdBack: [] })!.getTime() === ago(3).getTime());
  check("retryable failure holds just before it", nextWatermark({ now: NOW, until: NOW, previous: ago(7), collectorOk: true, resumeFrom: null, holdBack: [ago(2)] })!.getTime() === ago(2).getTime() - 1);
  check("stale failure stops blocking", nextWatermark({ now: NOW, until: NOW, previous: ago(40), collectorOk: true, resumeFrom: null, holdBack: [ago(GIVE_UP_DAYS + 1)] })!.getTime() === NOW.getTime());
  check("never moves backwards", nextWatermark({ now: NOW, until: NOW, previous: ago(1), collectorOk: true, resumeFrom: null, holdBack: [ago(5)] }) === null);
  check("status rules", runStatus({ collectorsTotal: 3, collectorsFailed: 3, analyzed: 0, failed: 0 }) === "FAILED"
    && runStatus({ collectorsTotal: 3, collectorsFailed: 1, analyzed: 5, failed: 0 }) === "PARTIAL"
    && runStatus({ collectorsTotal: 3, collectorsFailed: 0, analyzed: 5, failed: 1 }) === "PARTIAL"
    && runStatus({ collectorsTotal: 3, collectorsFailed: 0, analyzed: 0, failed: 4 }) === "FAILED"
    && runStatus({ collectorsTotal: 3, collectorsFailed: 0, analyzed: 5, failed: 0 }) === "SUCCEEDED");
  check("storedHash embeds prompt version", storedHash("abc", "v1") !== storedHash("abc", "v2"));
  let maxRunning = 0, running = 0;
  const out = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => { running++; maxRunning = Math.max(maxRunning, running); await new Promise((r) => setTimeout(r, 2)); running--; return n * 2; });
  check("mapPool keeps order and bound", JSON.stringify(out) === "[2,4,6,8,10,12]" && maxRunning <= 2);
}

// ── fixtures ──
const art = (over: Partial<SkillArtifact> & { sourceRef: string }): SkillArtifact => ({
  memberId: "m1", source: "TASK", projectId: "p1", projectName: "Rover", occurredAt: ago(2), title: `Work ${over.sourceRef}`, memberRole: "assignee",
  body: "built a React panel", facts: {}, contentHash: `h-${over.sourceRef}`, ...over,
});
check("dedupe keeps first", dedupeArtifacts([{ artifact: art({ sourceRef: "a" }) }, { artifact: art({ sourceRef: "a" }) }, { artifact: art({ sourceRef: "b" }) }]).length === 2);

const skills = [
  { id: "id-react", name: "React", type: "TOOL", aliases: ["ReactJS"], parentIds: [] },
  { id: "id-cad", name: "CAD", type: "TECHNIQUE", aliases: [], parentIds: [] },
];
const taxonomy = { skills, index: buildAliasIndex(skills) };

function memoryStore(over: { startRun?: () => Promise<string | null>; watermarks?: Partial<Record<"github" | "cad" | "task", Date>> } = {}) {
  const s = {
    written: [] as { memberId: string; ref: string; skills: string[]; embedLen: number; runId: string | null }[],
    keys: new Set<string>(),
    proposals: new Map<string, number>(),
    recomputed: [] as string[][],
    finished: null as RunPatch | null,
    started: 0,
    store: null as unknown as PipelineStore,
  };
  s.store = {
    async startRun() { s.started++; return over.startRun ? over.startRun() : "run-1"; },
    async previousWatermarks() { return over.watermarks ?? {}; },
    async loadTaxonomy() { return taxonomy; },
    async loadSuppressed() { return new Set<string>(); },
    async existingKeys() { return s.keys; },
    async proposal(input) {
      const k = input.name.toLowerCase();
      const isNew = !s.proposals.has(k);
      s.proposals.set(k, (s.proposals.get(k) ?? 0) + 1);
      return { kind: "queued", proposalId: k, isNew };
    },
    async write(a, analysis, embedding, meta) {
      const key = evidenceKey(a, meta.promptVersion);
      if (s.keys.has(key)) return null;
      s.keys.add(key);
      s.written.push({ memberId: a.memberId, ref: a.sourceRef, skills: analysis.skills.map((x) => x.skillId), embedLen: embedding.length, runId: meta.runId });
      return `ev-${s.written.length}`;
    },
    async recompute(ids) { s.recomputed.push(ids); return { members: ids.length, upserted: ids.length * 2, removed: 0 }; },
    async finishRun(_id, patch) { s.finished = patch; },
  };
  return s;
}

function fakeLlm(opts: { batch?: boolean; failRefs?: Set<string>; failStatus?: number; invalidRefs?: Set<string>; proposal?: string } = {}) {
  const llm: SkillsLlm & { calls: number; batchCalls: number; embedCalls: number; embedFail: boolean } = {
    calls: 0, batchCalls: 0, embedCalls: 0, embedFail: false, modelVersion: "fake-model-1", embedModel: "fake-embed",
    async generateJson(req) { llm.calls++; return respond(req.prompt); },
    async embed(texts) {
      llm.embedCalls++;
      if (llm.embedFail) throw new Error("embed down");
      return { vectors: texts.map(() => [0.6, 0.8]), tokens: texts.length * 10 };
    },
  };
  function respond(prompt: string): { text: string; usage: { tokensIn: number; tokensOut: number } } {
    const ref = /Title: <<<Work (\S+?)>>>/.exec(prompt)?.[1] ?? "";
    if (opts.failRefs?.has(ref)) throw Object.assign(new Error("quota"), { status: opts.failStatus ?? 429 });
    if (opts.invalidRefs?.has(ref)) return { text: "garbage", usage: { tokensIn: 50, tokensOut: 5 } };
    const reactKey = /(s\d+): React\b/.exec(prompt)![1];
    return {
      text: JSON.stringify({
        skills: [{ key: reactKey, fit: 0.9 }], proposedSkills: opts.proposal ? [{ name: opts.proposal, type: "TOOL", rationale: "seen" }] : [],
        contribution: "AUTHORED", complexity: 3, outcome: "MERGED", summary: `Built something for ${ref}.`,
      }),
      usage: { tokensIn: 1000, tokensOut: 100 },
    };
  }
  if (opts.batch) {
    llm.batchGenerateJson = async (items: BatchItem[]) => {
      llm.batchCalls++;
      return items.map((i) => {
        try { const r = respond(i.prompt); return { key: i.key, text: r.text, usage: r.usage }; }
        catch (e) { return { key: i.key, error: (e as Error).message, usage: { tokensIn: 0, tokensOut: 0 } }; }
      });
    };
  }
  return llm;
}

const result = (artifacts: SkillArtifact[], extra: Partial<CollectResult> = {}): CollectResult => ({ artifacts, unmapped: 0, errors: [], truncated: false, resumeFrom: null, ...extra });
const collectors = (map: Partial<Record<"github" | "cad" | "task", CollectResult | Error>>): NonNullable<PipelineDeps["collectors"]> => {
  const one = (k: "github" | "cad" | "task") => async () => { const v = map[k] ?? result([]); if (v instanceof Error) throw v; return v; };
  return { github: one("github"), cad: one("cad"), task: one("task") };
};
const env = { SKILLS_BATCH_MIN_ITEMS: "1000" } as NodeJS.ProcessEnv;

// ── happy path ──
{
  const st = memoryStore(); const llm = fakeLlm({ proposal: "Kubernetes" });
  const arts = [art({ sourceRef: "t1", source: "TASK" }), art({ sourceRef: "pr1", source: "GITHUB", memberId: "m2" }), art({ sourceRef: "v1", source: "CAD", memberId: "m1" })];
  const r = await runSkillPipeline({ trigger: "CRON" }, {
    store: st.store, llm, now: () => NOW, env,
    collectors: collectors({ task: result([arts[0]]), github: result([arts[1]]), cad: result([arts[2]]) }),
  });
  check("status SUCCEEDED", r.status === "SUCCEEDED", r);
  check("all three analysed + written", r.counts.analyzed === 3 && r.counts.evidenceWritten === 3 && st.written.length === 3, r.counts);
  check("evidence tagged with run id + embedding", st.written.every((w) => w.runId === "run-1" && w.embedLen === 2));
  check("skills map back to real ids", st.written.every((w) => w.skills.join() === "id-react"));
  check("embeddings batched into one call", llm.embedCalls === 1);
  check("proposal queued once even if proposed 3x", st.proposals.get("kubernetes") === 3 && r.counts.proposalsQueued === 1);
  check("members recomputed once each", st.recomputed.length === 1 && st.recomputed[0].sort().join() === "m1,m2");
  check("tokens + cost logged", r.tokensIn === 3000 && r.tokensOut === 300 && r.embedTokens === 30 && r.estCostUsd > 0);
  check("all three watermarks advance to run start", (["github", "cad", "task"] as const).every((k) => r.watermarks[k] === NOW.toISOString()), r.watermarks);
  check("run result recorded", st.finished?.status === "SUCCEEDED" && st.finished.modelVersion === "fake-model-1" && st.finished.counts.evidenceWritten === 3);

  // ── idempotent re-run ──
  const llm2 = fakeLlm();
  const r2 = await runSkillPipeline({ trigger: "CRON" }, {
    store: st.store, llm: llm2, now: () => NOW, env,
    collectors: collectors({ task: result([arts[0]]), github: result([arts[1]]), cad: result([arts[2]]) }),
  });
  check("re-run makes zero model calls", llm2.calls === 0 && llm2.embedCalls === 0);
  check("re-run writes nothing", st.written.length === 3 && r2.counts.alreadyAnalyzed === 3 && !r2.counts.evidenceWritten);
  check("re-run still SUCCEEDED and advances", r2.status === "SUCCEEDED" && !!r2.watermarks.task);

  // ── prompt version bump re-analyses ──
  const stale = new Set([...st.keys].map((k) => k.replace(`@${PROMPT_VERSION}`, "@skills-v0")));
  const st3 = memoryStore(); st3.keys = stale;
  const llm3 = fakeLlm();
  await runSkillPipeline({ trigger: "CRON" }, { store: st3.store, llm: llm3, now: () => NOW, env, collectors: collectors({ task: result([arts[0]]) }) });
  check("older prompt version is analysed again", llm3.calls === 1 && st3.written.length === 1);
}

// ── retryable failure holds watermark, invalid does not ──
{
  const st = memoryStore(); const llm = fakeLlm({ failRefs: new Set(["bad"]), invalidRefs: new Set(["junk"]) });
  const r = await runSkillPipeline({ trigger: "CRON" }, {
    store: st.store, llm, now: () => NOW, env,
    collectors: collectors({ task: result([art({ sourceRef: "ok1", occurredAt: ago(5) }), art({ sourceRef: "bad", occurredAt: ago(3) }), art({ sourceRef: "junk", occurredAt: ago(2) })]) }),
  });
  check("good artifacts still written", st.written.length === 1 && st.written[0].ref === "ok1");
  check("failure + invalid counted", r.counts.failed === 1 && r.counts.invalid === 1);
  check("status PARTIAL", r.status === "PARTIAL", r.status);
  check("watermark held just before the retryable failure", r.watermarks.task === new Date(ago(3).getTime() - 1).toISOString(), r.watermarks.task);
  check("other collectors unaffected", r.watermarks.github === NOW.toISOString());
  check("errors name the artifacts", r.errors.some((e) => e.message.includes("bad")) && r.errors.some((e) => e.message.includes("junk")));
}

// ── permanent (400) failure is not retried forever? it is retryable=false so it does not hold ──
{
  const st = memoryStore(); const llm = fakeLlm({ failRefs: new Set(["rej"]), failStatus: 400 });
  const r = await runSkillPipeline({ trigger: "CRON" }, { store: st.store, llm, now: () => NOW, env, collectors: collectors({ task: result([art({ sourceRef: "rej", occurredAt: ago(3) })]) }) });
  check("non-retryable failure does not hold the watermark", r.watermarks.task === NOW.toISOString());
}

// ── collector crash ──
{
  const st = memoryStore();
  const r = await runSkillPipeline({ trigger: "CRON" }, {
    store: st.store, llm: fakeLlm(), now: () => NOW, env,
    collectors: collectors({ github: new Error("GitHub down"), task: result([art({ sourceRef: "t1" })]) }),
  });
  check("other collectors still run", st.written.length === 1);
  check("crashed collector keeps its watermark", r.watermarks.github === undefined && r.watermarks.task !== undefined);
  check("status PARTIAL", r.status === "PARTIAL" && r.errors.some((e) => e.stage === "collect:github"));
  const all = await runSkillPipeline({ trigger: "CRON" }, { store: memoryStore().store, llm: fakeLlm(), now: () => NOW, env, collectors: collectors({ github: new Error("x"), cad: new Error("y"), task: new Error("z") }) });
  check("everything down -> FAILED", all.status === "FAILED");
}

// ── truncation + cap ──
{
  const st = memoryStore();
  const r = await runSkillPipeline({ trigger: "CRON" }, {
    store: st.store, llm: fakeLlm(), now: () => NOW, env,
    collectors: collectors({ task: result([art({ sourceRef: "t1", occurredAt: ago(4) })], { truncated: true, resumeFrom: ago(4) }) }),
  });
  check("collector truncation limits watermark", r.watermarks.task === ago(4).toISOString());
}
{
  const st = memoryStore();
  const arts = [4, 3, 2, 1].map((d) => art({ sourceRef: `c${d}`, occurredAt: ago(d) }));
  const r = await runSkillPipeline({ trigger: "CRON" }, {
    store: st.store, llm: fakeLlm(), now: () => NOW, env: { ...env, SKILLS_MAX_ARTIFACTS_PER_RUN: "2" } as NodeJS.ProcessEnv,
    collectors: collectors({ task: result(arts) }),
  });
  check("per-run cap analyses oldest first", st.written.map((w) => w.ref).join() === "c4,c3", st.written);
  check("leftovers counted and hold watermark", r.counts.deferredOverCap === 2 && r.watermarks.task === new Date(ago(2).getTime() - 1).toISOString());
}

// ── scoped + explicit window runs never move watermarks ──
{
  const st = memoryStore(); const seen: { memberIds?: string[] }[] = [];
  const r = await runSkillPipeline({ trigger: "MANUAL", memberIds: ["m1"] }, {
    store: st.store, llm: fakeLlm(), now: () => NOW, env,
    collectors: { github: async (w) => { seen.push(w); return result([]); }, cad: async () => result([]), task: async () => result([art({ sourceRef: "t1" })]) },
  });
  check("member scope passed to collectors", seen[0]?.memberIds?.join() === "m1");
  check("scoped run writes evidence", st.written.length === 1);
  check("scoped run leaves watermarks alone", Object.keys(r.watermarks).length === 0);
  const r2 = await runSkillPipeline({ trigger: "BACKFILL", since: ago(100), until: ago(50) }, { store: memoryStore().store, llm: fakeLlm(), now: () => NOW, env, collectors: collectors({}) });
  check("backfill window leaves watermarks alone", Object.keys(r2.watermarks).length === 0);
}

// ── previous watermark drives the window ──
{
  const wins: Date[] = [];
  const st = memoryStore({ watermarks: { task: ago(7) } });
  await runSkillPipeline({ trigger: "CRON" }, { store: st.store, llm: fakeLlm(), now: () => NOW, env, collectors: { github: async () => result([]), cad: async () => result([]), task: async (w) => { wins.push(w.since); return result([]); } } });
  check("collector window starts at watermark minus overlap", wins[0].getTime() === ago(8).getTime());
}

// ── dry run ──
{
  const st = memoryStore(); const llm = fakeLlm();
  const r = await runSkillPipeline({ trigger: "MANUAL", dryRun: true }, { store: st.store, llm, now: () => NOW, env, collectors: collectors({ task: result([art({ sourceRef: "t1" }), art({ sourceRef: "t2" })]) }) });
  check("dry run: no run row, no model calls, no writes", r.status === "DRY_RUN" && st.started === 0 && llm.calls === 0 && st.written.length === 0 && st.finished === null);
  check("dry run: estimates tokens and cost", r.tokensIn > 0 && r.estCostUsd > 0 && r.counts.toAnalyze === 2);
  let threw = false;
  try { await runSkillPipeline({ trigger: "CRON" }, { store: st.store, llm: null, now: () => NOW, env, collectors: collectors({}) }); } catch { threw = true; }
  check("real run without an llm is a programming error", threw);
}

// ── overlap guard ──
{
  const st = memoryStore({ startRun: async () => null }); const llm = fakeLlm();
  const r = await runSkillPipeline({ trigger: "CRON" }, { store: st.store, llm, now: () => NOW, env, collectors: collectors({ task: result([art({ sourceRef: "t1" })]) }) });
  check("second concurrent run is skipped without doing work", r.status === "SKIPPED" && llm.calls === 0 && st.written.length === 0);
}

// ── batch mode ──
{
  const st = memoryStore(); const llm = fakeLlm({ batch: true });
  const r = await runSkillPipeline({ trigger: "CRON" }, {
    store: st.store, llm, now: () => NOW, env: { ...env, SKILLS_BATCH_MIN_ITEMS: "2" } as NodeJS.ProcessEnv,
    collectors: collectors({ task: result([art({ sourceRef: "b1" }), art({ sourceRef: "b2" })]) }),
  });
  check("batch used above threshold", llm.batchCalls === 1 && llm.calls === 0 && st.written.length === 2 && r.status === "SUCCEEDED");
  check("batch cost discounted", r.estCostUsd > 0);
  const st2 = memoryStore(); const llm2 = fakeLlm({ batch: true });
  await runSkillPipeline({ trigger: "CRON" }, { store: st2.store, llm: llm2, now: () => NOW, env, collectors: collectors({ task: result([art({ sourceRef: "b1" })]) }) });
  check("small run stays synchronous", llm2.batchCalls === 0 && llm2.calls === 1);
}

// ── embedding outage does not lose evidence ──
{
  const st = memoryStore(); const llm = fakeLlm(); llm.embedFail = true;
  const r = await runSkillPipeline({ trigger: "CRON" }, { store: st.store, llm, now: () => NOW, env, collectors: collectors({ task: result([art({ sourceRef: "e1" })]) }) });
  check("evidence written with empty embedding when embed fails", st.written.length === 1 && st.written[0].embedLen === 0 && r.counts.embedFailed === 1);
}

// ── heartbeat, cancel, taxonomy bootstrap ──
{
  const st = memoryStore(); const llm = fakeLlm();
  const beats: string[] = [];
  let seeded = 0;
  st.store.heartbeat = async (_id, a) => { beats.push(a.progress.stage); return { cancel: a.progress.stage === "analyze" && a.progress.done >= 1 }; };
  st.store.ensureTaxonomy = async () => { seeded++; return 5; };
  const arts = [art({ sourceRef: "c1" }), art({ sourceRef: "c2" }), art({ sourceRef: "c3" })];
  const r = await runSkillPipeline({ trigger: "CRON" }, { store: st.store, llm, now: () => NOW, env: { ...env, SKILLS_CONCURRENCY: "1", SKILLS_HEARTBEAT_MS: "0" } as NodeJS.ProcessEnv, collectors: collectors({ task: result(arts) }) });
  check("empty taxonomy bootstrapped once and counted", seeded === 1 && r.counts.starterSkillsInstalled === 5);
  check("progress reported per stage", beats.includes("collect:github") && beats.includes("analyze"));
  check("cancel stops the run as FAILED without moving watermarks", r.status === "FAILED" && r.reason === "cancelled" && Object.keys(r.watermarks).length === 0 && st.written.length === 0);
  check("cancelled run stops calling the model", llm.calls < arts.length);
}

// ── proposal-only work is recorded so approving the proposal can credit it ──
{
  const st = memoryStore();
  const llm = fakeLlm({ proposal: "Kubernetes" });
  llm.generateJson = async () => ({ text: JSON.stringify({ skills: [], proposedSkills: [{ name: "Kubernetes", type: "TOOL", rationale: "deploys" }], contribution: "AUTHORED", complexity: 3, outcome: "MERGED", summary: "Deployed the API to a cluster." }), usage: { tokensIn: 10, tokensOut: 5 } });
  const seen: (string | null | undefined)[] = [];
  const orig = st.store.proposal;
  st.store.proposal = async (input, ctx) => { seen.push(input.evidenceId); return orig(input, ctx); };
  await runSkillPipeline({ trigger: "CRON" }, { store: st.store, llm, now: () => NOW, env, collectors: collectors({ task: result([art({ sourceRef: "k1" })]) }) });
  check("untagged evidence written and linked to the proposal", st.written.length === 1 && st.written[0].skills.length === 0 && seen[0] === "ev-1");
  check("untagged evidence does not trigger recompute", st.recomputed.length === 0);
}

console.log(`skillPipeline: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
