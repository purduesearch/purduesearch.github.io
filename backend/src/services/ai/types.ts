// The contract every AI provider implements. Adapters return a raw string; JSON
// parsing happens once, in aiRouter, so every provider behaves identically to
// today's geminiService.generateJson from a caller's point of view.

import type { AiProvider } from "@prisma/client";

/** Complexity tiers. These map 1:1 onto geminiService's three existing rate-limit
 *  lanes, so classifying a call site is a relabelling, not a judgement call:
 *    high   = the 25-req/day complex lane   (Ask, action plans, blog expansion, course gen)
 *    medium = the 30 RPM standard lane      (task enrich, NL→task, grading, outreach)
 *    low    = the 15 RPM fast lane          (blog editor inline autocomplete) */
export type AiTier = "high" | "medium" | "low";

export const AI_TIERS: readonly AiTier[] = ["high", "medium", "low"] as const;

export interface AiCall {
  prompt: string;
  /** true → caller wants parsed JSON back from aiRouter.runJson */
  json: boolean;
  /** Namespaced with provider+model by the router before use. */
  cacheKey?: string;
  maxOutputTokens?: number;
  image?: {
    base64: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
  };
}

export interface AiModelInfo {
  id: string;
  displayName: string;
}

/** Who is this call for. A missing memberId (crons, public endpoints) routes
 *  straight to Gemini — there is no key to spend and no consent to rely on. */
export interface AiCtx {
  memberId?: string | null;
}

export interface AiAdapter {
  provider: AiProvider;
  /** `model` is null for Gemini, where the model comes from env per lane. */
  run(call: AiCall, tier: AiTier, model: string | null): Promise<string>;
  listModels(): Promise<AiModelInfo[]>;
  /** Max prompt characters this provider accepts. Gemini's ceiling is far higher
   *  than Anthropic's or OpenAI's, so document truncation must be per-adapter —
   *  see the spec's "Known constraints". */
  maxPromptChars: number;
}

/** Thrown by an adapter when the provider rejected the KEY (401/403), as opposed to
 *  rejecting the request. The router treats this as permanent and parks the
 *  credential; every other error is transient and only affects the one call. */
export class AiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiAuthError";
  }
}
