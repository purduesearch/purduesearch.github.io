// OpenAI provider adapter, via chat completions.

import OpenAI from "openai";
import type { AiAdapter, AiCall, AiTier, AiModelInfo } from "./types.js";
import { AiAuthError } from "./types.js";

/** Well below Anthropic's ceiling — OpenAI context windows are the tightest of the
 *  three providers, so a long document truncates earliest here. */
const OPENAI_MAX_PROMPT_CHARS = 400_000;

/** OpenAI's json_object mode errors unless the word "JSON" appears in the messages. */
const JSON_SYSTEM_PROMPT =
  "Respond with a single valid JSON value and nothing else. No prose, no code fences.";

/** /v1/models returns embeddings, audio, image, and moderation models alongside the
 *  chat ones. Only chat models are selectable for a tier. */
export function isTextGenerationModel(id: string): boolean {
  const excluded = /embedding|tts|whisper|dall-e|moderation|audio|image|realtime|transcribe/i;
  return !excluded.test(id);
}

/** Exported for testing: the exact request body, with no network involved. */
export function buildRequest(call: AiCall, model: string) {
  const content: any[] = [];
  if (call.image) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${call.image.mimeType};base64,${call.image.base64}` },
    });
  }
  content.push({ type: "text", text: call.prompt });

  const messages: any[] = [];
  if (call.json) messages.push({ role: "system", content: JSON_SYSTEM_PROMPT });
  messages.push({
    role: "user",
    content: call.image ? content : call.prompt,
  });

  const body: Record<string, unknown> = { model, messages };
  if (call.maxOutputTokens) body.max_completion_tokens = call.maxOutputTokens;
  if (call.json) body.response_format = { type: "json_object" };
  return body;
}

function isAuthFailure(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 401 || status === 403;
}

export function createOpenAiAdapter(apiKey: string): AiAdapter {
  const client = new OpenAI({ apiKey });

  return {
    provider: "OPENAI",
    maxPromptChars: OPENAI_MAX_PROMPT_CHARS,

    async run(call: AiCall, _tier: AiTier, model: string | null): Promise<string> {
      if (!model) throw new Error("OpenAI adapter requires an explicit model id");
      try {
        const res: any = await client.chat.completions.create(buildRequest(call, model) as any);
        return (res.choices?.[0]?.message?.content ?? "").trim();
      } catch (err) {
        if (isAuthFailure(err)) {
          throw new AiAuthError((err as Error)?.message ?? "OpenAI rejected the API key");
        }
        throw err;
      }
    },

    async listModels(): Promise<AiModelInfo[]> {
      try {
        const res = await client.models.list();
        return res.data
          .filter((m) => isTextGenerationModel(m.id))
          .map((m) => ({ id: m.id, displayName: m.id }))
          .sort((a, b) => a.id.localeCompare(b.id));
      } catch (err) {
        if (isAuthFailure(err)) {
          throw new AiAuthError((err as Error)?.message ?? "OpenAI rejected the API key");
        }
        throw err;
      }
    },
  };
}
