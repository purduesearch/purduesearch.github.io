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

// ── Gemini implementation ────────────────────────────────────

const TERMINAL_OK = new Set(["JOB_STATE_SUCCEEDED", "JOB_STATE_PARTIALLY_SUCCEEDED"]);
const TERMINAL_BAD = new Set(["JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"]);

export function createGeminiSkillsLlm(env: NodeJS.ProcessEnv = process.env, deps: { sleep?: (ms: number) => Promise<void> } = {}): SkillsLlm {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmError("GEMINI_API_KEY is not set");
  const model = env.SKILLS_MODEL || env.GEMINI_MODEL;
  if (!model) throw new LlmError("Set SKILLS_MODEL (or GEMINI_MODEL) for the skills pipeline");
  const embedModel = env.SKILLS_EMBED_MODEL || "gemini-embedding-001";
  const dims = Number(env.SKILLS_EMBED_DIMS || 768);
  const rpm = Number(env.SKILLS_RPM || 20);
  const thinking = env.SKILLS_THINKING_BUDGET;
  const sleep = deps.sleep ?? realSleep;

  const ai = new GoogleGenAI({ apiKey });
  const acquire = createRateLimiter({ rpm, sleep });

  const config = (req: GenerateRequest) => ({
    responseMimeType: "application/json",
    responseJsonSchema: req.schema,
    maxOutputTokens: req.maxOutputTokens ?? 1024,
    temperature: 0,
    ...(thinking !== undefined && thinking !== "" ? { thinkingConfig: { thinkingBudget: Number(thinking) } } : {}),
  });

  const usageOf = (u: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined): LlmUsage => ({
    tokensIn: u?.promptTokenCount ?? 0,
    tokensOut: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
  });

  const llm: SkillsLlm = {
    modelVersion: model,
    embedModel,

    async generateJson(req) {
      return withRetry(async () => {
        await acquire();
        const res = await ai.models.generateContent({ model, contents: req.prompt, config: config(req) });
        const text = (res.text ?? "").trim();
        if (!text) throw new LlmError("empty response from Gemini", undefined, false);
        return { text, usage: usageOf(res.usageMetadata) };
      }, { sleep });
    },

    async embed(texts) {
      const vectors: number[][] = [];
      let tokens = 0;
      for (let i = 0; i < texts.length; i += 50) {
        const chunk = texts.slice(i, i + 50);
        const res = await withRetry(async () => {
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

  if (env.SKILLS_USE_BATCH === "1") {
    const pollMs = Number(env.SKILLS_BATCH_POLL_SECONDS || 30) * 1000;
    const timeoutMs = Number(env.SKILLS_BATCH_TIMEOUT_MINUTES || 180) * 60_000;
    llm.batchGenerateJson = async (items) => {
      if (!items.length) return [];
      const job = await withRetry(() => ai.batches.create({
        model,
        src: { inlinedRequests: items.map((i) => ({ contents: i.prompt, metadata: { key: i.key }, config: config(i) })) },
        config: { displayName: `skills-${new Date().toISOString().slice(0, 10)}-${items.length}` },
      }), { sleep });
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
      return items.map((item, i) => {
        const r = responses.find((x) => x.metadata?.key === item.key) ?? responses[i];
        if (!r || r.error || !r.response) return { key: item.key, error: r?.error?.message ?? "no response in batch", usage: { tokensIn: 0, tokensOut: 0 } };
        const text = (r.response.text ?? "").trim();
        return text
          ? { key: item.key, text, usage: usageOf(r.response.usageMetadata) }
          : { key: item.key, error: "empty response", usage: usageOf(r.response.usageMetadata) };
      });
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
