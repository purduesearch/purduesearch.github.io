/**
 * imageGenService — Pollinations.ai free image generation.
 *
 * Three quality tiers, each with a 25 req/day soft quota (shared across all users):
 *   fast     → flux-schnell (fastest, lower detail)
 *   standard → flux (balanced)
 *   ultra    → flux-pro (highest quality)
 *
 * Pollinations.ai is a free public API — no key required.
 * If you later gain access to Google Imagen 4, swap the generateImage()
 * implementation back to @google/genai while keeping this file's exports
 * and quota/rate-limit logic unchanged.
 */

export type ImageAspect  = "square" | "portrait" | "landscape";
export type ImageQuality = "fast" | "standard" | "ultra";

const POLLINATIONS_MODELS: Record<ImageQuality, string> = {
  fast:     "flux-schnell",
  standard: "flux",
  ultra:    "flux-pro",
};

const DIMENSIONS: Record<ImageAspect, { width: number; height: number }> = {
  square:    { width: 1024, height: 1024 },
  portrait:  { width: 768,  height: 1024 },
  landscape: { width: 1024, height: 768  },
};

// ── Daily quota tracking (per tier, shared across all members) ───

const DAILY_LIMIT = 25;
const DAY_MS      = 24 * 60 * 60 * 1000;
const quotaLogs: Record<ImageQuality, number[]> = { fast: [], standard: [], ultra: [] };

function consumeQuota(quality: ImageQuality): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const log = quotaLogs[quality];
  while (log.length && log[0] < now - DAY_MS) log.shift();
  if (log.length >= DAILY_LIMIT) {
    return { allowed: false, retryAfterSec: Math.ceil((DAY_MS - (now - log[0])) / 1000) };
  }
  log.push(now);
  return { allowed: true, retryAfterSec: 0 };
}

export function quotaStatus(): Record<ImageQuality, { used: number; remaining: number }> {
  const now = Date.now();
  const out = {} as Record<ImageQuality, { used: number; remaining: number }>;
  for (const q of ["fast", "standard", "ultra"] as ImageQuality[]) {
    const log = quotaLogs[q];
    while (log.length && log[0] < now - DAY_MS) log.shift();
    out[q] = { used: log.length, remaining: DAILY_LIMIT - log.length };
  }
  return out;
}

// ── Per-member rate limit (3 per minute) ─────────────────────

const memberLog     = new Map<string, number[]>();
const MEMBER_WIN_MS = 60_000;
const MAX_PER_MIN   = 3;

export function checkMemberRateLimit(memberId: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const log = (memberLog.get(memberId) ?? []).filter(t => now - t < MEMBER_WIN_MS);
  if (log.length >= MAX_PER_MIN) {
    memberLog.set(memberId, log);
    return { allowed: false, retryAfterSec: Math.ceil((MEMBER_WIN_MS - (now - log[0])) / 1000) };
  }
  log.push(now);
  memberLog.set(memberId, log);
  return { allowed: true, retryAfterSec: 0 };
}

// ── Core generation ──────────────────────────────────────────

export interface GenerateImageResult {
  base64:   string;
  mimeType: string;
  model:    string;
  quality:  ImageQuality;
  width:    number;
  height:   number;
}

export async function generateImage({
  prompt,
  aspectRatio = "square",
  quality     = "standard",
}: {
  prompt:       string;
  aspectRatio?: ImageAspect;
  quality?:     ImageQuality;
}): Promise<GenerateImageResult> {
  const quota = consumeQuota(quality);
  if (!quota.allowed) {
    const hours = Math.ceil(quota.retryAfterSec / 3600);
    throw new Error(
      `Image generation ${quality} daily quota exhausted — resets in ~${hours}h. ` +
      `Try a different quality tier (fast / standard / ultra).`
    );
  }

  const { width, height } = DIMENSIONS[aspectRatio];
  const model = POLLINATIONS_MODELS[quality];
  const encodedPrompt = encodeURIComponent(prompt.trim().slice(0, 480));
  const seed = Math.floor(Math.random() * 1_000_000);

  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`Pollinations.ai error ${response.status}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();

  return { base64, mimeType, model, quality, width, height };
}
