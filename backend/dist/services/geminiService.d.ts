/** Text-only generation with JSON mode. Always returns parsed object or null. */
export declare function generateJson<T>(prompt: string, cacheKey?: string): Promise<T | null>;
/** Text-only generation. Returns raw string. */
export declare function generateText(prompt: string, cacheKey?: string): Promise<string>;
/** Multimodal: send one image (base64) + text prompt. Returns parsed JSON or null. */
export declare function generateJsonFromImage<T>(imageBase64: string, mimeType: "image/png" | "image/jpeg" | "image/webp", prompt: string): Promise<T | null>;
/** Send raw document text + prompt. Handles truncation for context limits. */
export declare function generateJsonFromDocument<T>(documentText: string, prompt: string, cacheKey?: string): Promise<T | null>;
//# sourceMappingURL=geminiService.d.ts.map