// The skills pipeline's own Gemini lane.
//
// Deliberately NOT routed through aiRouter/geminiService: those share a 28 RPM
// budget and a 25/day complex quota with every interactive feature, and the old
// SDK has no structured output, embeddings or batch. This lane uses
// @google/genai with its own rate limiter, retry policy and token/cost counters,
// so a weekly run can never starve (or be starved by) the rest of the app.
//
// The API key is read from GEMINI_API_KEY on the server only.

import { GoogleGenAI } from "@google/genai";

export interface LlmUsage { tokensIn: number; tokensOut: number }
export interface GenerateRequest { prompt: string; schema: object; maxOutputTokens?: number }
export interface GenerateResult { text: string; usage: LlmUsage }
export interface BatchItem extends GenerateRequest { key: string }
export interface BatchOutcome { key: string; text?: string; error?: string; usage: LlmUsage }

export interface SkillsLlm {
  /** Recorded on every evidence row so scoring can be traced to a model. */
  modelVersion: string;
  embedModel: string;
  generateJson(req: GenerateRequest): Promise<GenerateResult>;
  /** Present when Gemini batch mode is enabled; absent means callers use paced sync calls. */
  batchGenerateJson?(items: BatchItem[]): Promise<BatchOutcome[]>;
  embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }>;
}

export class LlmError extends Error {
  constructor(message: string, public readonly status?: number, public readonly retryable = false) {
    super(message);
  }
}
export class SkillBudgetExceeded extends LlmError {
  constructor() { super("Skills run budget reservation exhausted; remaining work is deferred"); }
}
export function createSkillsBudget(limit: number) {
  let reserved = 0;
  return (amount: number) => {
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(amount) || amount < 0 || reserved + amount > limit) throw new SkillBudgetExceeded();
    reserved += amount;
  };
}

// ── Retry ────────────────────────────────────────────────────

export function isRetryable(err: unknown): boolean {
  if (err instanceof LlmError) return err.retryable;
  const e = err as { status?: number; code?: number | string; message?: string };
  const status = typeof e?.status === "number" ? e.status : typeof e?.code === "number" ? e.code : undefined;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(e?.message ?? "");
}

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff with jitter. Non-retryable errors throw immediately. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 4, baseMs = 1000, maxMs = 30_000, sleep = realSleep, random = Math.random, isRetryable: retryable = isRetryable } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !retryable(err)) throw err;
      const delay = Math.round(Math.min(maxMs, baseMs * 2 ** attempt) * (0.5 + random() / 2));
      opts.onRetry?.(attempt + 1, delay, err);
      await sleep(delay);
    }
  }
}

// ── Rate limit (sliding window) ──────────────────────────────

export function createRateLimiter(opts: { rpm: number; now?: () => number; sleep?: (ms: number) => Promise<void> }): () => Promise<void> {
  const { rpm, now = Date.now, sleep = realSleep } = opts;
  const stamps: number[] = [];
  return async function acquire(): Promise<void> {
    for (;;) {
      const t = now();
      while (stamps.length && stamps[0] <= t - 60_000) stamps.shift();
      if (stamps.length < rpm) { stamps.push(t); return; }
      await sleep(Math.max(1, stamps[0] + 60_000 - t));
    }
  };
}

// ── Cost ─────────────────────────────────────────────────────

export interface Prices { inPerM: number; outPerM: number; embedPerM: number; batchDiscount: number }

/** Planning numbers only. Check current Gemini pricing and set SKILLS_PRICE_* for the model you run. */
export const DEFAULT_PRICES: Prices = { inPerM: 0.3, outPerM: 2.5, embedPerM: 0.15, batchDiscount: 0.5 };

export function pricesFromEnv(env: NodeJS.ProcessEnv = process.env): Prices {
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    inPerM: num(env.SKILLS_PRICE_IN_PER_M, DEFAULT_PRICES.inPerM),
    outPerM: num(env.SKILLS_PRICE_OUT_PER_M, DEFAULT_PRICES.outPerM),
    embedPerM: num(env.SKILLS_PRICE_EMBED_PER_M, DEFAULT_PRICES.embedPerM),
    batchDiscount: num(env.SKILLS_BATCH_DISCOUNT, DEFAULT_PRICES.batchDiscount),
  };
}

export function estimateCostUsd(u: { tokensIn: number; tokensOut: number; embedTokens?: number; batch?: boolean }, p: Prices = DEFAULT_PRICES): number {
  const gen = (u.tokensIn * p.inPerM + u.tokensOut * p.outPerM) / 1e6 * (u.batch ? p.batchDiscount : 1);
  const emb = ((u.embedTokens ?? 0) * p.embedPerM) / 1e6;
  return Math.round((gen + emb) * 1e6) / 1e6;
}

/** Rough token estimate for text the API does not meter back (embeddings). */
export const approxTokens = (text: string) => Math.ceil(text.length / 4);

// ── Config ───────────────────────────────────────────────────

export interface SkillsLlmConfig {
  model: string | null;
  embedModel: string;
  keySet: boolean;
  /** Human-readable reasons the lane cannot run; empty when it can. */
  problems: string[];
  /** Schema field the model accepts: Gemini 1.x/2.0 only take the OpenAPI `responseSchema`. */
  schemaMode: "json" | "openapi";
  thinkingBudget: number | null;
  maxOutputTokens: number;
  batch: boolean;
  rpm: number;
}

/** Older models reject `responseJsonSchema` (400 INVALID_ARGUMENT) and have no thinking. */
export const isLegacyModel = (model: string) => /gemini-(1(\.\d)?|2\.0)(-|$)/i.test(model);
/** 2.5-series models think by default, and thinking tokens count against maxOutputTokens. */
const isThinking25 = (model: string) => /gemini-2\.5/i.test(model);

const intOr = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d);

/** Everything the lane needs from the environment, checked without throwing so the admin panel can show it. */
export function skillsLlmConfig(env: NodeJS.ProcessEnv = process.env): SkillsLlmConfig {
  const model = env.SKILLS_MODEL || env.GEMINI_MODEL || null;
  const problems: string[] = [];
  if (!env.GEMINI_API_KEY) problems.push("GEMINI_API_KEY is not set on the server");
  if (!model) problems.push("Set SKILLS_MODEL (or GEMINI_MODEL) for the skills pipeline");
  const legacy = !!model && isLegacyModel(model);
  // An explicit SKILLS_THINKING_BUDGET always wins. Otherwise a 2.5 model gets a small
  // budget: labelling one artifact needs little reasoning, and unbounded thinking used
  // to exhaust the output limit and come back as an empty or cut-off response.
  const explicit = env.SKILLS_THINKING_BUDGET;
  const thinkingBudget = legacy ? null : explicit !== undefined && explicit !== "" ? intOr(explicit, 0) : model && isThinking25(model) ? 512 : null;
  return {
    model, embedModel: env.SKILLS_EMBED_MODEL || "gemini-embedding-001", keySet: !!env.GEMINI_API_KEY, problems,
    schemaMode: legacy || env.SKILLS_SCHEMA_MODE === "openapi" ? "openapi" : "json",
    thinkingBudget, maxOutputTokens: Math.max(512, intOr(env.SKILLS_MAX_OUTPUT_TOKENS, 4096)),
    batch: env.SKILLS_USE_BATCH === "1", rpm: Math.max(1, intOr(env.SKILLS_RPM, 20)),
  };
}

/**
 * JSON Schema -> the OpenAPI subset `responseSchema` takes (upper-case types, no
 * `additionalProperties`). Used for legacy models and as the fallback when a model
 * rejects `responseJsonSchema`.
 */
export function toOpenApiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toOpenApiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "additionalProperties" || k === "$schema") continue;
    if (k === "type" && typeof v === "string") out.type = v.toUpperCase();
    else if (k === "properties" && v && typeof v === "object") out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toOpenApiSchema(pv)]));
    else if (k === "items") out.items = toOpenApiSchema(v);
    else out[k] = v;
  }
  return out;
}

/** A 400 that names the schema or thinking field: the model does not support it, so downgrade instead of failing every artifact. */
export function isShapeUnsupported(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  const msg = e?.message ?? "";
  return (e?.status === 400 || /INVALID_ARGUMENT|\b400\b/.test(msg)) && /response_?json_?schema|json schema|thinking/i.test(msg);
}

// ── Gemini implementation ────────────────────────────────────

const TERMINAL_OK = new Set(["JOB_STATE_SUCCEEDED", "JOB_STATE_PARTIALLY_SUCCEEDED"]);
const TERMINAL_BAD = new Set(["JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"]);

export function createGeminiSkillsLlm(env: NodeJS.ProcessEnv = process.env, deps: { sleep?: (ms: number) => Promise<void>; reserve?: (usd: number) => void } = {}): SkillsLlm {
  const cfg = skillsLlmConfig(env);
  if (cfg.problems.length) throw new LlmError(cfg.problems.join("; "));
  const apiKey = env.GEMINI_API_KEY!;
  const model = cfg.model!;
  const embedModel = cfg.embedModel;
  const dims = Number(env.SKILLS_EMBED_DIMS || 768);
  const sleep = deps.sleep ?? realSleep;

  const ai = new GoogleGenAI({ apiKey });
  const acquire = createRateLimiter({ rpm: cfg.rpm, sleep });
  const prices = pricesFromEnv(env);
  const reserveGeneration = (req: GenerateRequest, maxOut: number) => deps.reserve?.(estimateCostUsd({ tokensIn: Buffer.byteLength(req.prompt + JSON.stringify(req.schema), "utf8") + 2048, tokensOut: maxOut }, prices));
  // Mutable: the first schema/thinking rejection downgrades the lane for the rest of the run.
  let schemaMode = cfg.schemaMode;
  let thinkingBudget = cfg.thinkingBudget;

  const config = (req: GenerateRequest, maxOut = req.maxOutputTokens ?? cfg.maxOutputTokens) => ({
    responseMimeType: "application/json",
    ...(schemaMode === "json" ? { responseJsonSchema: req.schema } : { responseSchema: toOpenApiSchema(req.schema) as object }),
    maxOutputTokens: maxOut,
    temperature: 0,
    ...(thinkingBudget !== null ? { thinkingConfig: { thinkingBudget } } : {}),
  });

  const usageOf = (u: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined): LlmUsage => ({
    tokensIn: u?.promptTokenCount ?? 0,
    tokensOut: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
  });

  /** One call. A rejected request shape downgrades once; a cut-off answer (MAX_TOKENS) is retried once with double the room. */
  async function callOnce(req: GenerateRequest): Promise<GenerateResult> {
    let maxOut = req.maxOutputTokens ?? cfg.maxOutputTokens;
    for (let attempt = 0; attempt < 4; attempt++) {
      reserveGeneration(req, maxOut);
      await acquire();
      let res;
      try {
        res = await ai.models.generateContent({ model, contents: req.prompt, config: config(req, maxOut) });
      } catch (err) {
        if (!isShapeUnsupported(err)) throw err;
        if (/thinking/i.test((err as Error)?.message ?? "") && thinkingBudget !== null) thinkingBudget = null;
        else if (schemaMode === "json") schemaMode = "openapi";
        else throw err;
        console.warn(`[skills] ${model} rejected the request shape; retrying with schema=${schemaMode} thinking=${thinkingBudget ?? "model default"}`);
        continue;
      }
      const finish = String(res.candidates?.[0]?.finishReason ?? "");
      const text = (res.text ?? "").trim();
      if (finish === "MAX_TOKENS" && maxOut < 16_384) { maxOut *= 2; continue; }
      if (!text) {
        const why = res.promptFeedback?.blockReason ? `blocked: ${res.promptFeedback.blockReason}` : finish ? `finish reason ${finish}` : "no candidates";
        throw new LlmError(`empty response from Gemini (${why})`, undefined, finish === "OTHER" || finish === "");
      }
      if (finish === "MAX_TOKENS") throw new LlmError("Gemini response was cut off (MAX_TOKENS); raise SKILLS_MAX_OUTPUT_TOKENS or lower SKILLS_THINKING_BUDGET");
      return { text, usage: usageOf(res.usageMetadata) };
    }
    throw new LlmError("Gemini did not return a usable response after adjusting the request");
  }

  const llm: SkillsLlm = {
    modelVersion: model,
    embedModel,

    async generateJson(req) {
      return withRetry(() => callOnce(req), { sleep });
    },

    async embed(texts) {
      const vectors: number[][] = [];
      let tokens = 0;
      for (let i = 0; i < texts.length; i += 50) {
        const chunk = texts.slice(i, i + 50);
        const res = await withRetry(async () => {
          deps.reserve?.(estimateCostUsd({ tokensIn: 0, tokensOut: 0, embedTokens: chunk.reduce((n, t) => n + Buffer.byteLength(t, "utf8"), 0) }, prices));
          await acquire();
          return ai.models.embedContent({ model: embedModel, contents: chunk, config: { taskType: "SEMANTIC_SIMILARITY", outputDimensionality: dims } });
        }, { sleep });
        const got = res.embeddings ?? [];
        if (got.length !== chunk.length) throw new LlmError(`embedding count mismatch: sent ${chunk.length}, got ${got.length}`);
        for (const e of got) vectors.push(normalize(e.values ?? []));
        tokens += chunk.reduce((n, t) => n + approxTokens(t), 0);
      }
      return { vectors, tokens };
    },
  };

  if (cfg.batch) {
    const pollMs = Number(env.SKILLS_BATCH_POLL_SECONDS || 30) * 1000;
    const timeoutMs = Number(env.SKILLS_BATCH_TIMEOUT_MINUTES || 180) * 60_000;
    llm.batchGenerateJson = async (items) => {
      if (!items.length) return [];
      const accepted: BatchItem[] = [];
      const deferred: BatchOutcome[] = [];
      for (const item of items) {
        try { reserveGeneration(item, item.maxOutputTokens ?? cfg.maxOutputTokens); accepted.push(item); }
        catch (e) { if (!(e instanceof SkillBudgetExceeded)) throw e; deferred.push({ key: item.key, error: e.message, usage: { tokensIn: 0, tokensOut: 0 } }); }
      }
      if (!accepted.length) return deferred;
      let attempts = 0;
      const job = await withRetry(() => {
        if (attempts++ > 0) for (const item of accepted) reserveGeneration(item, item.maxOutputTokens ?? cfg.maxOutputTokens);
        return ai.batches.create({
        model,
        src: { inlinedRequests: accepted.map((i) => ({ contents: i.prompt, metadata: { key: i.key }, config: config(i) })) },
        config: { displayName: `skills-${new Date().toISOString().slice(0, 10)}-${accepted.length}` },
      }); }, { sleep });
      if (!job.name) throw new LlmError("batch job has no name");
      const deadline = Date.now() + timeoutMs;
      let cur = job;
      while (!TERMINAL_OK.has(String(cur.state)) && !TERMINAL_BAD.has(String(cur.state))) {
        if (Date.now() > deadline) throw new LlmError(`batch ${job.name} did not finish in time`, undefined, false);
        await sleep(pollMs);
        cur = await withRetry(() => ai.batches.get({ name: job.name! }), { sleep });
      }
      if (TERMINAL_BAD.has(String(cur.state))) throw new LlmError(`batch ${job.name} ended ${String(cur.state)}: ${cur.error?.message ?? ""}`);
      const responses = cur.dest?.inlinedResponses ?? [];
      return [...accepted.map((item, i) => {
        const r = responses.find((x) => x.metadata?.key === item.key) ?? responses[i];
        if (!r || r.error || !r.response) return { key: item.key, error: r?.error?.message ?? "no response in batch", usage: { tokensIn: 0, tokensOut: 0 } };
        const text = (r.response.text ?? "").trim();
        return text
          ? { key: item.key, text, usage: usageOf(r.response.usageMetadata) }
          : { key: item.key, error: "empty response", usage: usageOf(r.response.usageMetadata) };
      }), ...deferred];
    };
  }

  return llm;
}

/** Unit-length vectors make cosine similarity a plain dot product. */
export function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum);
  return n > 0 ? v.map((x) => x / n) : v;
}
