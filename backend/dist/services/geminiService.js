import { GoogleGenerativeAI } from "@google/generative-ai";
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
function model() {
    return genai.getGenerativeModel({ model: process.env.GEMINI_MODEL });
}
// Rate limiting: Flash Lite 30 RPM — sliding-window token bucket
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS = 28;
const requestLog = [];
async function rateLimitedCall(fn) {
    const now = Date.now();
    const windowStart = now - RATE_WINDOW_MS;
    while (requestLog.length && requestLog[0] < windowStart)
        requestLog.shift();
    if (requestLog.length >= MAX_REQUESTS) {
        const wait = RATE_WINDOW_MS - (now - requestLog[0]);
        await new Promise(r => setTimeout(r, wait));
    }
    requestLog.push(Date.now());
    return fn();
}
// Response cache
const cache = new Map();
const TTL = (parseInt(process.env.AI_CACHE_TTL_SECONDS ?? "300")) * 1000;
function getCached(key) {
    const entry = cache.get(key);
    if (!entry || entry.expires < Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}
function setCached(key, value) {
    cache.set(key, { value, expires: Date.now() + TTL });
}
/** Text-only generation with JSON mode. Always returns parsed object or null. */
export async function generateJson(prompt, cacheKey) {
    if (cacheKey) {
        const hit = getCached(cacheKey);
        if (hit)
            return JSON.parse(hit);
    }
    try {
        const result = await rateLimitedCall(() => model().generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
        }));
        const text = result.response.text().trim();
        if (cacheKey)
            setCached(cacheKey, text);
        return JSON.parse(text);
    }
    catch (err) {
        console.error("[gemini] generateJson error:", err);
        return null;
    }
}
/** Text-only generation. Returns raw string. */
export async function generateText(prompt, cacheKey) {
    if (cacheKey) {
        const hit = getCached(cacheKey);
        if (hit)
            return hit;
    }
    try {
        const result = await rateLimitedCall(() => model().generateContent(prompt));
        const text = result.response.text().trim();
        if (cacheKey)
            setCached(cacheKey, text);
        return text;
    }
    catch (err) {
        console.error("[gemini] generateText error:", err);
        return "";
    }
}
/** Multimodal: send one image (base64) + text prompt. Returns parsed JSON or null. */
export async function generateJsonFromImage(imageBase64, mimeType, prompt) {
    try {
        const imagePart = { inlineData: { data: imageBase64, mimeType } };
        const result = await rateLimitedCall(() => model().generateContent({
            contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
        }));
        return JSON.parse(result.response.text().trim());
    }
    catch (err) {
        console.error("[gemini] generateJsonFromImage error:", err);
        return null;
    }
}
/** Send raw document text + prompt. Handles truncation for context limits. */
export async function generateJsonFromDocument(documentText, prompt, cacheKey) {
    const MAX_CHARS = 3_600_000;
    const truncated = documentText.length > MAX_CHARS
        ? documentText.slice(0, MAX_CHARS) + "\n\n[Document truncated for length]"
        : documentText;
    return generateJson(`${prompt}\n\n---DOCUMENT---\n${truncated}`, cacheKey);
}
//# sourceMappingURL=geminiService.js.map