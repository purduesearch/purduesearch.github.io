// Bring-your-own AI provider: key linking and per-tier model preferences.
//
// CONVENTION: every handler reads req.memberId, never req.session. Bearer-authed
// clients (Brave, Safari) have no session, and reading the session silently breaks
// them — this bug class has appeared 13 times in this codebase.

import { Router, type Request, type Response } from "express";
import type { AiProvider } from "@prisma/client";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { getAdapter } from "../services/ai/registry.js";
import { AiAuthError, type AiModelInfo } from "../services/ai/types.js";
import {
  storeCredential, listCredentials, deleteCredential, getUsableKey,
} from "../services/ai/credentialService.js";
import {
  sanitizePrefs, defaultPrefs, readTierPref, mergePrefs, type TierPref,
} from "../services/ai/preferences.js";
import { AI_TIERS, type AiTier } from "../services/ai/types.js";

export const aiRouter = Router();

const KEYED_PROVIDERS = ["ANTHROPIC", "OPENAI"] as const;

function parseProvider(raw: unknown): AiProvider | null {
  const upper = String(raw ?? "").toUpperCase();
  return (KEYED_PROVIDERS as readonly string[]).includes(upper) ? (upper as AiProvider) : null;
}

// ── Model list cache ─────────────────────────────────────────
// Per member+provider, 1 hour. Keeps the Profile page from hitting the provider on
// every render, and keeps PUT /preferences validation cheap.

const modelCache = new Map<string, { models: AiModelInfo[]; expires: number }>();
const MODEL_TTL_MS = 60 * 60 * 1000;

async function fetchModels(memberId: string, provider: AiProvider): Promise<AiModelInfo[]> {
  const key = `${memberId}:${provider}`;
  const hit = modelCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.models;

  const apiKey = await getUsableKey(memberId, provider);
  if (!apiKey) return [];

  const models = await getAdapter(provider, apiKey).listModels();
  modelCache.set(key, { models, expires: Date.now() + MODEL_TTL_MS });
  return models;
}

function invalidateModelCache(memberId: string, provider: AiProvider): void {
  modelCache.delete(`${memberId}:${provider}`);
}

// GET /api/ai/providers — linked providers + current tier preferences.
// Deliberately never returns apiKey; only keyHint (last 4 chars).
aiRouter.get("/providers", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const [credentials, member] = await Promise.all([
      listCredentials(memberId),
      prisma.member.findUnique({ where: { id: memberId }, select: { aiModelPrefs: true } }),
    ]);

    const preferences = defaultPrefs();
    for (const tier of AI_TIERS) {
      preferences[tier] = readTierPref(member?.aiModelPrefs ?? null, tier);
    }

    res.json({ credentials, preferences });
  } catch (err) {
    console.error("[ai] list providers error:", err);
    res.status(500).json({ error: "Failed to load AI providers" });
  }
});

// POST /api/ai/providers — link or replace a key.
// Verifies the key against the provider BEFORE storing anything, so a typo is
// rejected at link time instead of silently degrading every later AI call.
aiRouter.post("/providers", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const provider = parseProvider(req.body?.provider);
    const apiKey   = String(req.body?.apiKey ?? "").trim();

    if (!provider) return res.status(400).json({ error: "Unknown provider" });
    if (!apiKey)   return res.status(400).json({ error: "API key is required" });

    try {
      await getAdapter(provider, apiKey).listModels();
    } catch (err) {
      if (err instanceof AiAuthError) {
        return res.status(400).json({ error: "That key was rejected by the provider" });
      }
      console.error("[ai] key verification error:", err);
      return res.status(502).json({ error: "Could not reach the provider to verify that key" });
    }

    const credential = await storeCredential(memberId, provider, apiKey);
    invalidateModelCache(memberId, provider);
    res.status(201).json({ credential });
  } catch (err) {
    console.error("[ai] link provider error:", err);
    res.status(500).json({ error: "Failed to link provider" });
  }
});

// DELETE /api/ai/providers/:provider — unlink, and reset any tier that used it back
// to the built-in lane so the member is never left pointing at a provider they no
// longer have a key for.
aiRouter.delete("/providers/:provider", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const provider = parseProvider(req.params.provider);
    if (!provider) return res.status(400).json({ error: "Unknown provider" });

    await deleteCredential(memberId, provider);
    invalidateModelCache(memberId, provider);

    const member = await prisma.member.findUnique({
      where: { id: memberId }, select: { aiModelPrefs: true },
    });
    // Reset only the tiers that pointed at the unlinked provider, then write the
    // column whole via mergePrefs — never key-by-key.
    const patch: Partial<Record<AiTier, TierPref>> = {};
    for (const tier of AI_TIERS) {
      if (readTierPref(member?.aiModelPrefs ?? null, tier).provider === provider) {
        patch[tier] = { provider: "GEMINI", model: null };
      }
    }
    const prefs = mergePrefs(member?.aiModelPrefs ?? null, patch);
    await prisma.member.update({ where: { id: memberId }, data: { aiModelPrefs: prefs as any } });

    res.json({ ok: true, preferences: prefs });
  } catch (err) {
    console.error("[ai] unlink provider error:", err);
    res.status(500).json({ error: "Failed to unlink provider" });
  }
});

// GET /api/ai/providers/:provider/models
aiRouter.get("/providers/:provider/models", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const provider = parseProvider(req.params.provider);
    if (!provider) return res.status(400).json({ error: "Unknown provider" });

    res.json({ models: await fetchModels(memberId, provider) });
  } catch (err) {
    if (err instanceof AiAuthError) {
      return res.status(400).json({ error: "That key was rejected by the provider" });
    }
    console.error("[ai] list models error:", err);
    res.status(502).json({ error: "Could not reach the provider" });
  }
});

// PUT /api/ai/preferences — { high, medium, low }, each { provider, model }.
// Validates against what is actually linked, and writes the column WHOLE.
aiRouter.put("/preferences", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const credentials = await listCredentials(memberId);
    const linked = new Set(credentials.filter((c) => c.status === "ACTIVE").map((c) => c.provider));

    const modelsByProvider = new Map<string, Set<string>>();
    for (const provider of linked) {
      const models = await fetchModels(memberId, provider as AiProvider);
      modelsByProvider.set(provider, new Set(models.map((m) => m.id)));
    }

    const result = sanitizePrefs(req.body, linked, modelsByProvider);
    if (!result.ok) return res.status(400).json({ error: result.error });

    await prisma.member.update({
      where: { id: memberId },
      data:  { aiModelPrefs: result.value as any },
    });
    res.json({ preferences: result.value });
  } catch (err) {
    console.error("[ai] update preferences error:", err);
    res.status(500).json({ error: "Failed to save AI preferences" });
  }
});
