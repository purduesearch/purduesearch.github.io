// The only module AI call sites import.
//
// Resolves a member's per-tier provider preference, dispatches to that adapter, and
// falls back to the built-in Gemini lane on any failure — so a dead key degrades the
// model quality, never the feature. Matches the fail-open habit already established
// by geminiService's complex-quota fallback and rubricGrading's COMPLETE_UNGRADED.

import type { AiProvider } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { createNotification } from "../notificationCrud.js";
import { getAdapter } from "./registry.js";
import { readTierPref } from "./preferences.js";
import {
  getUsableKey, getCredentialRow, markInvalid, markNotified, shouldNotify,
} from "./credentialService.js";
import { AiAuthError, type AiCall, type AiCtx, type AiTier } from "./types.js";

// Prompt-building helper, not a generation call: it only stamps the real current
// date into a prompt so the model stops guessing from its training cutoff. It is
// re-exported here so a migrated call site imports from this module alone — the
// `ai/` package is the boundary, and geminiService stays an implementation detail
// behind it rather than something every prompt builder reaches past the router for.
export { todayContext } from "../geminiService.js";

// ── Response cache ───────────────────────────────────────────
// Separate from geminiService's cache, and namespaced by provider+model. Without
// the namespace a member who picked Claude would read another member's
// Gemini-generated answer for the same prompt and never see the model they chose.

const cache = new Map<string, { value: string; expires: number }>();
const TTL        = (parseInt(process.env.AI_CACHE_TTL_SECONDS ?? "300", 10)) * 1000;
const MAX_CACHED = parseInt(process.env.AI_CACHE_MAX_ENTRIES ?? "500", 10);

export function cacheKeyFor(provider: AiProvider, model: string | null, callerKey: string): string {
  return `${provider}:${model ?? "default"}:${callerKey}`;
}

function getCached(key: string): string | null {
  const hit = cache.get(key);
  if (!hit || hit.expires < Date.now()) { cache.delete(key); return null; }
  return hit.value;
}

function setCached(key: string, value: string): void {
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, expires: Date.now() + TTL });
}

// ── Failure handling ─────────────────────────────────────────

export type FailureKind = "auth" | "transient";

/** An auth failure means the KEY is dead — park it so no later call retries against
 *  it. Anything else affects this one call only. */
export function classifyFailure(err: unknown): FailureKind {
  if (err instanceof AiAuthError) return "auth";
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403) return "auth";
  return "transient";
}

export function truncateForAdapter(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) return prompt;
  return prompt.slice(0, maxChars) + "\n\n[Content truncated for length]";
}

/** Never throws: a provider that returns prose instead of JSON yields null, exactly
 *  like geminiService.generateJson does today. */
export function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

async function notifyFailure(
  memberId: string, provider: AiProvider, kind: FailureKind, message: string
): Promise<void> {
  try {
    const row = await getCredentialRow(memberId, provider);
    if (!row) return;
    // Auth failures always notify — the member must act. Transient ones are
    // throttled so a provider outage cannot spam the feed on every AI click.
    if (kind === "transient" && !shouldNotify(row.lastNotifiedAt)) return;

    const label = provider === "ANTHROPIC" ? "Anthropic" : "OpenAI";
    await createNotification({
      type: "SYSTEM",
      recipientId: memberId,
      message: kind === "auth"
        ? `Your ${label} key was rejected and has been disabled. AI features fell back to the built-in model — re-link your key in Profile → AI Models.`
        : `Your ${label} account could not be reached (${message.slice(0, 80)}). AI features fell back to the built-in model.`,
      metadata: { provider, kind },
    });
    await markNotified(memberId, provider);
  } catch (err) {
    // Notification failure must never turn into AI failure.
    console.warn("[aiRouter] could not notify about provider failure:", err);
  }
}

// ── Dispatch ─────────────────────────────────────────────────

async function resolveProvider(
  ctx: AiCtx, tier: AiTier
): Promise<{ provider: AiProvider; model: string | null; apiKey: string | null }> {
  if (!ctx.memberId) return { provider: "GEMINI", model: null, apiKey: null };

  const member = await prisma.member.findUnique({
    where: { id: ctx.memberId },
    select: { aiModelPrefs: true },
  });
  const pref = readTierPref(member?.aiModelPrefs ?? null, tier);
  if (pref.provider === "GEMINI") return { provider: "GEMINI", model: null, apiKey: null };

  const apiKey = await getUsableKey(ctx.memberId, pref.provider);
  // No key, or a credential already parked as INVALID → built-in lane.
  if (!apiKey) return { provider: "GEMINI", model: null, apiKey: null };

  return { provider: pref.provider, model: pref.model, apiKey };
}

async function runRaw(ctx: AiCtx, tier: AiTier, call: AiCall): Promise<string> {
  const { provider, model, apiKey } = await resolveProvider(ctx, tier);

  const cacheKey = call.cacheKey ? cacheKeyFor(provider, model, call.cacheKey) : null;
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit !== null) return hit;
  }

  const adapter = getAdapter(provider, apiKey);
  const prompt  = truncateForAdapter(call.prompt, adapter.maxPromptChars);

  try {
    const out = await adapter.run({ ...call, prompt }, tier, model);
    if (cacheKey && out) setCached(cacheKey, out);
    return out;
  } catch (err) {
    if (provider === "GEMINI") throw err;  // nothing left to fall back to

    const kind = classifyFailure(err);
    const message = (err as Error)?.message ?? String(err);
    console.warn(`[aiRouter] ${provider} failed (${kind}) — falling back to Gemini:`, message);

    if (kind === "auth" && ctx.memberId) await markInvalid(ctx.memberId, provider, message);
    if (ctx.memberId) await notifyFailure(ctx.memberId, provider, kind, message);

    // Retry on the built-in lane. Gemini's own cache namespace differs, so this
    // writes its own entry rather than poisoning the provider's.
    const fallback = getAdapter("GEMINI", null);
    const fbPrompt = truncateForAdapter(call.prompt, fallback.maxPromptChars);
    const out = await fallback.run({ ...call, prompt: fbPrompt }, tier, null);
    if (call.cacheKey && out) setCached(cacheKeyFor("GEMINI", null, call.cacheKey), out);
    return out;
  }
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
