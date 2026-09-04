// The only module AI call sites import.
//
// Dispatches to the built-in Gemini lane by tier. The bring-your-own-key
// providers this router used to route between were removed — members who want a
// stronger model use the clipboard planning lane instead (aiActionService
// .buildPlanPrompt), which needs no key and spends no quota. What survives is
// the call-site boundary: ~20 modules import runJson/runText from here, and
// geminiService stays an implementation detail behind it.

import { geminiAdapter } from "./geminiAdapter.js";
import type { AiCall, AiCtx, AiTier } from "./types.js";

// Prompt-building helper, not a generation call: it stamps the real current date
// into a prompt so the model stops guessing from its training cutoff.
export { todayContext } from "../geminiService.js";

// ── Response cache ───────────────────────────────────────────

const cache = new Map<string, { value: string; expires: number }>();
const TTL        = (parseInt(process.env.AI_CACHE_TTL_SECONDS ?? "300", 10)) * 1000;
const MAX_CACHED = parseInt(process.env.AI_CACHE_MAX_ENTRIES ?? "500", 10);

function getCached(key: string): string | null {
  const hit = cache.get(key);
  if (!hit || hit.expires < Date.now()) { cache.delete(key); return null; }
  return hit.value;
}

function setCached(key: string, value: string): void {
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, expires: Date.now() + TTL });
}

export function truncateForAdapter(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) return prompt;
  return prompt.slice(0, maxChars) + "\n\n[Content truncated for length]";
}

/** Never throws: a provider that returns prose instead of JSON yields null. */
export function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// ── Dispatch ─────────────────────────────────────────────────

async function runRaw(_ctx: AiCtx, tier: AiTier, call: AiCall): Promise<string> {
  const cacheKey = call.cacheKey ?? null;
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit !== null) return hit;
  }

  const prompt = truncateForAdapter(call.prompt, geminiAdapter.maxPromptChars);
  const out = await geminiAdapter.run({ ...call, prompt }, tier);
  if (cacheKey && out) setCached(cacheKey, out);
  return out;
}

/** JSON generation. Returns null when nothing usable came back — same contract as
 *  geminiService.generateJson, so migrated call sites need no new null handling. */
export async function runJson<T>(ctx: AiCtx, tier: AiTier, call: AiCall): Promise<T | null> {
  try {
    return parseJsonLoose<T>(await runRaw(ctx, tier, { ...call, json: true }));
  } catch (err) {
    console.error("[aiRouter] runJson error:", err);
    return null;
  }
}

/** Text generation. Returns "" on failure — same contract as generateText. */
export async function runText(ctx: AiCtx, tier: AiTier, call: AiCall): Promise<string> {
  try {
    return await runRaw(ctx, tier, { ...call, json: false });
  } catch (err) {
    console.error("[aiRouter] runText error:", err);
    return "";
  }
}
