// The contract the built-in provider implements. Adapters return a raw string;
// JSON parsing happens once, in aiRouter, so every caller sees one behaviour.
//
// This was a multi-provider abstraction. The bring-your-own-key providers were
// removed in favour of the clipboard planning lane (a member pastes a prompt
// into their own Claude/ChatGPT subscription — see aiActionService.buildPlanPrompt),
// so only the built-in Gemini lane remains. The AiAdapter shape is kept because
// the tier → rate-limit-lane mapping it documents is real and load-bearing.

/** Complexity tiers, mapping 1:1 onto geminiService's three rate-limit lanes:
 *    high   = the 25-req/day complex lane   (Ask, action plans, blog expansion, course gen)
 *    medium = the 30 RPM standard lane      (task enrich, NL→task, grading, outreach)
 *    low    = the 15 RPM fast lane          (blog editor inline autocomplete) */
export type AiTier = "high" | "medium" | "low";

export const AI_TIERS: readonly AiTier[] = ["high", "medium", "low"] as const;

export interface AiCall {
  prompt: string;
  /** true → caller wants parsed JSON back from aiRouter.runJson */
  json: boolean;
  cacheKey?: string;
  maxOutputTokens?: number;
  image?: {
    base64: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
  };
}

/** Who the call is for. Retained across the provider removal because it is the
 *  seam a future per-member Gemini key would use — each member would then get
 *  their own free daily complex quota instead of sharing one club-wide lane. */
export interface AiCtx {
  memberId?: string | null;
}

export interface AiAdapter {
  run(call: AiCall, tier: AiTier): Promise<string>;
  /** Max prompt characters this provider accepts, enforced by aiRouter. */
  maxPromptChars: number;
}
