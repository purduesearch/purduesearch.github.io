// The built-in provider. A thin wrapper over the existing geminiService exports —
// geminiService.ts itself is deliberately untouched, so its three rate-limit lanes,
// its 25/day complex-quota fallback, and its isModelUnusable degradation all keep
// working exactly as before for every member who links nothing.

import type { AiAdapter, AiCall, AiTier } from "./types.js";
import {
  generateJson,
  generateText,
  generateJsonComplex,
  generateTextComplex,
  generateTextFast,
  generateJsonFromImage,
} from "../geminiService.js";

/** Matches the existing MAX_CHARS in geminiService.generateJsonFromDocument. */
const GEMINI_MAX_PROMPT_CHARS = 3_600_000;

export const geminiAdapter: AiAdapter = {
  maxPromptChars: GEMINI_MAX_PROMPT_CHARS,

  async run(call: AiCall, tier: AiTier): Promise<string> {
    // Image calls only exist on the standard lane today (create-from-image).
    if (call.image) {
      const parsed = await generateJsonFromImage<unknown>(
        call.image.base64, call.image.mimeType, call.prompt
      );
      return parsed === null ? "" : JSON.stringify(parsed);
    }

    if (tier === "low") return generateTextFast(call.prompt);

    if (tier === "high") {
      if (call.json) {
        const parsed = await generateJsonComplex<unknown>(
          call.prompt, undefined, { maxOutputTokens: call.maxOutputTokens }
        );
        return parsed === null ? "" : JSON.stringify(parsed);
      }
      return generateTextComplex(call.prompt);
    }

    if (call.json) {
      const parsed = await generateJson<unknown>(call.prompt);
      return parsed === null ? "" : JSON.stringify(parsed);
    }
    return generateText(call.prompt);
  },
};
