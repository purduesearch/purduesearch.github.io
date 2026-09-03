// The only place adapters are constructed. Keeps aiRouter and api/ai.ts free of
// per-provider branching, so adding a provider means adding one case here.

import type { AiProvider } from "@prisma/client";
import type { AiAdapter } from "./types.js";
import { geminiAdapter } from "./geminiAdapter.js";
import { createAnthropicAdapter } from "./anthropicAdapter.js";
import { createOpenAiAdapter } from "./openaiAdapter.js";

/** `apiKey` is required for every provider except GEMINI, which is keyless. */
export function getAdapter(provider: AiProvider, apiKey: string | null): AiAdapter {
  switch (provider) {
    case "GEMINI":    return geminiAdapter;
    case "ANTHROPIC":
      if (!apiKey) throw new Error("Anthropic adapter requires an API key");
      return createAnthropicAdapter(apiKey);
    case "OPENAI":
      if (!apiKey) throw new Error("OpenAI adapter requires an API key");
      return createOpenAiAdapter(apiKey);
    default:
      return geminiAdapter;
  }
}
