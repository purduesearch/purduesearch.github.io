// Read/validate/merge the Member.aiModelPrefs JSON column.
//
// No DB and no network here on purpose: every branch that decides which provider a
// member's call goes to is pure, so it can be tested exhaustively without mocks.

import type { AiProvider } from "@prisma/client";
import { AI_TIERS, type AiTier } from "./types.js";

export interface TierPref {
  provider: AiProvider;
  model:    string | null;
}

export type AiModelPrefs = Record<AiTier, TierPref>;

/** The built-in lane. Anything malformed, unset, or unusable resolves to this. */
export const DEFAULT_PREF: TierPref = { provider: "GEMINI", model: null };

const KNOWN_PROVIDERS: readonly string[] = ["GEMINI", "ANTHROPIC", "OPENAI"];

export function defaultPrefs(): AiModelPrefs {
  return { high: { ...DEFAULT_PREF }, medium: { ...DEFAULT_PREF }, low: { ...DEFAULT_PREF } };
}

/** Resolve one tier out of the raw column. Total function: never throws, always
 *  returns something usable, so a hand-edited or half-migrated row degrades to the
 *  built-in lane rather than breaking every AI feature for that member. */
export function readTierPref(raw: unknown, tier: AiTier): TierPref {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREF };
  const entry = (raw as Record<string, unknown>)[tier];
  if (!entry || typeof entry !== "object") return { ...DEFAULT_PREF };

  const { provider, model } = entry as { provider?: unknown; model?: unknown };
  if (typeof provider !== "string" || !KNOWN_PROVIDERS.includes(provider)) {
    return { ...DEFAULT_PREF };
  }
  if (provider === "GEMINI") return { provider: "GEMINI", model: null };

  // A keyed provider without a model id is unusable — both adapters require one.
  if (typeof model !== "string" || !model) return { ...DEFAULT_PREF };
  return { provider: provider as AiProvider, model };
}

export interface SanitizeResult {
  ok: boolean;
  value?: AiModelPrefs;
  error?: string;
}

/**
 * Validate a full preferences payload against what the member has actually linked.
 *
 * Rejects the WHOLE payload on any violation rather than dropping the offending
 * tier — a partial write would silently leave a member on a provider they thought
 * they had changed away from.
 */
export function sanitizePrefs(
  raw: unknown,
  linkedProviders: Set<string>,
  modelsByProvider: Map<string, Set<string>>
): SanitizeResult {
  const out = defaultPrefs();

  for (const tier of AI_TIERS) {
    const pref = readTierPref(raw, tier);
    if (pref.provider === "GEMINI") { out[tier] = { ...DEFAULT_PREF }; continue; }

    if (!linkedProviders.has(pref.provider)) {
      return { ok: false, error: `Provider ${pref.provider} is not linked to your account` };
    }
    const known = modelsByProvider.get(pref.provider);
    if (!known || !known.has(pref.model!)) {
      return { ok: false, error: `Model ${pref.model} is not available on ${pref.provider}` };
    }
    out[tier] = { provider: pref.provider, model: pref.model };
  }

  return { ok: true, value: out };
}

/** Spread the previous value and write the column whole — the convention every
 *  JSON config column in this schema follows. Never write key-by-key. */
export function mergePrefs(previous: unknown, patch: Partial<Record<AiTier, TierPref>>): AiModelPrefs {
  const base = defaultPrefs();
  for (const tier of AI_TIERS) base[tier] = readTierPref(previous, tier);
  for (const tier of AI_TIERS) {
    const next = patch[tier];
    if (next) base[tier] = { provider: next.provider, model: next.model ?? null };
  }
  return base;
}
