// Anthropic provider adapter.
//
// Two rules here are load-bearing and easy to get wrong when porting from the
// Gemini path:
//   1. NEVER send temperature / top_p / top_k. Claude Opus 5 and Sonnet 5 reject
//      them with a 400. The Gemini path has no such restriction, so this is the
//      most likely porting mistake.
//   2. Leave thinking adaptive. Disabling it on Opus 5 can leak <thinking> tags
//      into the visible response; lowering `effort` is the correct cost lever.

import Anthropic from "@anthropic-ai/sdk";
import type { AiAdapter, AiCall, AiTier, AiModelInfo } from "./types.js";
import { AiAuthError } from "./types.js";

/** Anthropic's 1M-token context is roughly 4M characters, but leaving headroom for
 *  thinking and the response keeps long documents from truncating mid-answer. */
const ANTHROPIC_MAX_PROMPT_CHARS = 1_500_000;

const JSON_SYSTEM_PROMPT =
  "Respond with a single valid JSON value and nothing else. " +
  "No prose, no explanation, no markdown code fences.";

export function effortForTier(tier: AiTier): "high" | "medium" | "low" {
  return tier;
}

/** Exported for testing: the exact request body, with no network involved. */
export function buildRequest(call: AiCall, tier: AiTier, model: string) {
  const content: any[] = [];
  if (call.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: call.image.mimeType, data: call.image.base64 },
    });
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: call.maxOutputTokens ?? 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: effortForTier(tier) },
    messages: [
      {
        role: "user",
        content: content.length ? [...content, { type: "text", text: call.prompt }] : call.prompt,
      },
    ],
  };

  if (call.json) body.system = JSON_SYSTEM_PROMPT;
  return body;
}

/** Models wrap JSON in fences even when instructed not to. Strip them before parse. */
export function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
  return (fenced ? fenced[1]! : trimmed).trim();
}

function isAuthFailure(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 401 || status === 403;
}

export function createAnthropicAdapter(apiKey: string): AiAdapter {
  const client = new Anthropic({ apiKey });

  return {
    provider: "ANTHROPIC",
    maxPromptChars: ANTHROPIC_MAX_PROMPT_CHARS,

    async run(call: AiCall, tier: AiTier, model: string | null): Promise<string> {
      if (!model) throw new Error("Anthropic adapter requires an explicit model id");
      try {
        const res: any = await client.messages.create(buildRequest(call, tier, model) as any);
        const text = (res.content ?? [])
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
        return call.json ? stripFences(text) : text.trim();
      } catch (err) {
        if (isAuthFailure(err)) {
          throw new AiAuthError((err as Error)?.message ?? "Anthropic rejected the API key");
        }
        throw err;
      }
    },

    async listModels(): Promise<AiModelInfo[]> {
      try {
        const out: AiModelInfo[] = [];
        for await (const m of client.models.list()) {
          out.push({ id: m.id, displayName: (m as any).display_name ?? m.id });
        }
        return out;
      } catch (err) {
        if (isAuthFailure(err)) {
          throw new AiAuthError((err as Error)?.message ?? "Anthropic rejected the API key");
        }
        throw err;
      }
    },
  };
}
