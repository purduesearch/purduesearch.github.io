import { GoogleGenerativeAI, type Part } from "@google/generative-ai";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Standard model (high RPM, used for simple tasks) ─────────
// Rate limit: 30 RPM sliding window

function model() {
  return genai.getGenerativeModel({ model: process.env.GEMINI_MODEL! });
}

const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS   = 28;
const requestLog: number[] = [];

export class GeminiRateLimitError extends Error {
  constructor() { super("Gemini global rate limit exceeded"); }
}

async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  while (requestLog.length && requestLog[0] < windowStart) requestLog.shift();
  if (requestLog.length >= MAX_REQUESTS) {
    throw new GeminiRateLimitError();
  }
  requestLog.push(Date.now());
  return fn();
}

// ── Complex model (25 req/day, used for heavy tasks) ─────────
// Reasoning-class model for safety checks, blog expansion, video scripts, etc.

function complexModel() {
  return genai.getGenerativeModel({ model: process.env.GEMINI_COMPLEX_MODEL ?? "gemini-3.5-flash" });
}

const COMPLEX_WINDOW_MS   = 24 * 60 * 60 * 1000; // 24-hour window
const COMPLEX_MAX_REQUESTS = 25;
const complexRequestLog: number[] = [];

async function complexRateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const windowStart = now - COMPLEX_WINDOW_MS;
  while (complexRequestLog.length && complexRequestLog[0] < windowStart) complexRequestLog.shift();
  if (complexRequestLog.length >= COMPLEX_MAX_REQUESTS) {
    // Quota exhausted — fall back to standard model rather than blocking for hours
    console.warn("[gemini] complex model daily quota exhausted — falling back to standard model");
    return rateLimitedCall(fn);
  }
  complexRequestLog.push(Date.now());
  return fn();
}

// ── Fast model (inline autocomplete) ─────────────────────────
// Its own lane so autocomplete can never eat the standard model's 30 RPM
// budget, which every other AI feature and cron shares. Defaults to
// GEMINI_MODEL when GEMINI_FAST_MODEL is unset, so nothing breaks unconfigured.

function fastModel() {
  return genai.getGenerativeModel({
    model: process.env.GEMINI_FAST_MODEL ?? process.env.GEMINI_MODEL!,
  });
}

const FAST_WINDOW_MS   = 60_000;
const FAST_MAX_REQUESTS = 15;
const fastRequestLog: number[] = [];

async function fastRateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const windowStart = now - FAST_WINDOW_MS;
  while (fastRequestLog.length && fastRequestLog[0] < windowStart) fastRequestLog.shift();
  if (fastRequestLog.length >= FAST_MAX_REQUESTS) {
    throw new GeminiRateLimitError();
  }
  fastRequestLog.push(Date.now());
  return fn();
}

// ── Response cache ─────────────────────────────────────────────

const cache = new Map<string, { value: string; expires: number }>();
const TTL        = (parseInt(process.env.AI_CACHE_TTL_SECONDS ?? "300")) * 1000;
const MAX_CACHED = parseInt(process.env.AI_CACHE_MAX_ENTRIES ?? "500", 10);

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) { cache.delete(key); return null; }
  return entry.value;
}
function setCached(key: string, value: string): void {
  if (cache.size >= MAX_CACHED) {
    // Evict the oldest entry (Map insertion order is preserved)
    cache.delete(cache.keys().next().value!);
  }
  cache.set(key, { value, expires: Date.now() + TTL });
}

// ── Date context helper ────────────────────────────────────────
// Inject into prompts so the model uses the real current date rather than
// reasoning from training-data heuristics (which can mis-assign day-of-week
// for dates beyond the training cutoff).

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export function todayContext(): string {
  const now  = new Date();
  const day  = DAY_NAMES[now.getDay()];
  const date = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `The current date is ${day}, ${date}. Do NOT derive or verify day-of-week from training data — use only what is stated here.`;
}

// ── Standard model helpers ─────────────────────────────────────

/** Text-only generation with JSON mode. Returns parsed object or null. */
export async function generateJson<T>(prompt: string, cacheKey?: string): Promise<T | null> {
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit) return JSON.parse(hit) as T;
  }
  try {
    const result = await rateLimitedCall(() =>
      model().generateContent({
        contents:         [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      })
    );
    const text = result.response.text().trim();
    if (cacheKey) setCached(cacheKey, text);
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof GeminiRateLimitError) throw err;
    console.error("[gemini] generateJson error:", err);
    return null;
  }
}

/** Text-only generation. Returns raw string. */
export async function generateText(prompt: string, cacheKey?: string): Promise<string> {
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit) return hit;
  }
  try {
    const result = await rateLimitedCall(() => model().generateContent(prompt));
    const text   = result.response.text().trim();
    if (cacheKey) setCached(cacheKey, text);
    return text;
  } catch (err) {
    if (err instanceof GeminiRateLimitError) throw err;
    console.error("[gemini] generateText error:", err);
    return "";
  }
}

/** Multimodal: send one image (base64) + text prompt. Returns parsed JSON or null. */
export async function generateJsonFromImage<T>(
  imageBase64: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
  prompt: string
): Promise<T | null> {
  try {
    const imagePart: Part = { inlineData: { data: imageBase64, mimeType } };
    const result = await rateLimitedCall(() =>
      model().generateContent({
        contents:         [{ role: "user", parts: [imagePart, { text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      })
    );
    return JSON.parse(result.response.text().trim()) as T;
  } catch (err) {
    if (err instanceof GeminiRateLimitError) throw err;
    console.error("[gemini] generateJsonFromImage error:", err);
    return null;
  }
}

/** Send raw document text + prompt. Handles truncation for context limits. */
export async function generateJsonFromDocument<T>(
  documentText: string,
  prompt: string,
  cacheKey?: string
): Promise<T | null> {
  const MAX_CHARS = 3_600_000;
  const truncated = documentText.length > MAX_CHARS
    ? documentText.slice(0, MAX_CHARS) + "\n\n[Document truncated for length]"
    : documentText;
  return generateJson<T>(`${prompt}\n\n---DOCUMENT---\n${truncated}`, cacheKey);
}

// ── Complex model helpers ──────────────────────────────────────
// Use these for tasks where accuracy matters more than throughput:
// safety checks, blog expansion, video scripts, calendar autofill.

/** Complex-model JSON generation. Falls back to standard model if daily quota is exhausted. */
export async function generateJsonComplex<T>(
  prompt: string,
  cacheKey?: string,
  opts?: { maxOutputTokens?: number }
): Promise<T | null> {
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit) return JSON.parse(hit) as T;
  }
  try {
    const result = await complexRateLimitedCall(() =>
      complexModel().generateContent({
        contents:         [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens:  opts?.maxOutputTokens ?? 8192,
        },
      })
    );
    const text = result.response.text().trim();
    if (cacheKey) setCached(cacheKey, text);
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("[gemini] generateJsonComplex error:", err);
    return null;
  }
}

/** Complex-model text generation. Falls back to standard model if daily quota is exhausted. */
export async function generateTextComplex(prompt: string, cacheKey?: string): Promise<string> {
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit) return hit;
  }
  try {
    const result = await complexRateLimitedCall(() =>
      complexModel().generateContent(prompt)
    );
    const text = result.response.text().trim();
    if (cacheKey) setCached(cacheKey, text);
    return text;
  } catch (err) {
    console.error("[gemini] generateTextComplex error:", err);
    return "";
  }
}

/**
 * Short, low-latency completion for inline autocomplete. Deliberately
 * uncached — a completion is specific to one caret position.
 * Returns "" on any failure so the editor simply shows no ghost text.
 */
export async function generateTextFast(prompt: string): Promise<string> {
  try {
    const result = await fastRateLimitedCall(() =>
      fastModel().generateContent({
        contents:         [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 64, temperature: 0.4 },
      })
    );
    return result.response.text().trim();
  } catch (err) {
    if (err instanceof GeminiRateLimitError) throw err;
    console.error("[gemini] generateTextFast error:", err);
    return "";
  }
}
