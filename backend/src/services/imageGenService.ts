/**
 * imageGenService — wraps Pollinations.ai for free, no-key text-to-image.
 * Returns a stable URL that can be used as <img src> directly; no upload step.
 *
 * Pollinations API: https://image.pollinations.ai/prompt/{prompt}?width=&height=&model=
 * Free, no signup, no rate limit documented. Reasonably reliable for low volume.
 */

export type ImageAspect = "square" | "portrait" | "landscape";

const ASPECTS: Record<ImageAspect, { width: number; height: number }> = {
  square:    { width: 1024, height: 1024 },
  portrait:  { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
};

export interface GenerateImageOptions {
  prompt:        string;
  aspectRatio?:  ImageAspect;
  model?:        string;   // "flux" | "turbo" | ...
  seed?:         number;
}

export interface GenerateImageResult {
  url:    string;
  prompt: string;
  width:  number;
  height: number;
  model:  string;
}

export function generateImageUrl({
  prompt,
  aspectRatio = "square",
  model = "flux",
  seed,
}: GenerateImageOptions): GenerateImageResult {
  const cleanPrompt = prompt.trim().slice(0, 600);
  const { width, height } = ASPECTS[aspectRatio] ?? ASPECTS.square;
  const params = new URLSearchParams({
    width:  String(width),
    height: String(height),
    model,
    nologo: "true",
  });
  if (typeof seed === "number") params.set("seed", String(seed));
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?${params.toString()}`;
  return { url, prompt: cleanPrompt, width, height, model };
}

// ── Per-member rate limit (3/min) ────────────────────────────

const memberLog = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;

export function checkRateLimit(memberId: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const log = memberLog.get(memberId) ?? [];
  const recent = log.filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    memberLog.set(memberId, recent);
    const oldest = recent[0];
    return { allowed: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - oldest)) / 1000) };
  }
  recent.push(now);
  memberLog.set(memberId, recent);
  return { allowed: true, retryAfterSec: 0 };
}
