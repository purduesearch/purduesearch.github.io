// Pure-logic unit tests for openaiAdapter. No network, no SDK.
// Run: cd backend && npx tsx src/services/ai/openaiAdapter.test.ts

import { buildRequest, isTextGenerationModel } from "./openaiAdapter.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("buildRequest — JSON mode uses response_format, plain mode omits it");
{
  const plain = buildRequest({ prompt: "hi", json: false }, "gpt-x") as any;
  const json  = buildRequest({ prompt: "hi", json: true },  "gpt-x") as any;
  check("plain has no response_format", !plain.response_format);
  check("json requests json_object", json.response_format?.type === "json_object");
  // OpenAI rejects json_object mode unless the word JSON appears in the messages.
  check("json mode mentions JSON somewhere", /json/i.test(JSON.stringify(json.messages)));
  check("model carried through", plain.model === "gpt-x");
}

console.log("buildRequest — images become an image_url content part");
{
  const withImage = buildRequest(
    { prompt: "what is this", json: false, image: { base64: "AAAA", mimeType: "image/png" } },
    "gpt-x"
  ) as any;
  const parts = withImage.messages[0].content;
  check("content is an array of parts", Array.isArray(parts));
  check("has an image_url part", parts.some((p: any) => p.type === "image_url"));
  check("uses a data: URI", parts.some((p: any) => p.image_url?.url?.startsWith("data:image/png;base64,")));
  check("keeps the text part", parts.some((p: any) => p.type === "text" && p.text === "what is this"));
}

console.log("isTextGenerationModel — the raw /v1/models list is mostly irrelevant here");
{
  check("keeps a chat model", isTextGenerationModel("gpt-4.1"));
  check("drops embeddings", !isTextGenerationModel("text-embedding-3-large"));
  check("drops tts", !isTextGenerationModel("tts-1-hd"));
  check("drops whisper", !isTextGenerationModel("whisper-1"));
  check("drops image models", !isTextGenerationModel("dall-e-3"));
  check("drops moderation", !isTextGenerationModel("omni-moderation-latest"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
