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

async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  while (requestLog.length && requestLog[0] < windowStart) requestLog.shift();
  if (requestLog.length >= MAX_REQUESTS) {
    const wait = RATE_WINDOW_MS - (now - requestLog[0]);
    await new Promise(r => setTimeout(r, wait));
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

// ── Response cache ─────────────────────────────────────────────

const cache = new Map<string, { value: string; expires: number }>();
const TTL   = (parseInt(process.env.AI_CACHE_TTL_SECONDS ?? "300")) * 1000;

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) { cache.delete(key); return null; }
  return entry.value;
}
function setCached(key: string, value: string): void {
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
export async function generateJsonComplex<T>(prompt: string, cacheKey?: string): Promise<T | null> {
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit) return JSON.parse(hit) as T;
  }
  try {
    const result = await complexRateLimitedCall(() =>
      complexModel().generateContent({
        contents:         [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
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
