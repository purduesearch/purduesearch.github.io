import { generateJson, generateText } from "./geminiService.js";

// ── Caption variants ─────────────────────────────────────────

/**
 * Generate 3 caption variants from a brief in a given brand voice.
 * Returns an array of 3 variant strings.
 */
export async function generateCaptionVariants(
  brief: string,
  platform: string = "general",
  voiceName?: string,
  existingContent?: string
): Promise<string[]> {
  const voiceInstruction = voiceName
    ? `Write in a "${voiceName}" brand voice.`
    : "Write in a neutral, professional brand voice.";

  const existingNote = existingContent
    ? `\nExisting content to rewrite/expand:\n${existingContent}\n`
    : "";

  const prompt = `You are a social media copywriter for a university engineering club (Purdue SEARCH).
${voiceInstruction}
Platform: ${platform}
${existingNote}
Brief: ${brief}

Generate exactly 3 distinct caption variants for this content.
Each variant should be suitable for ${platform} and feel fresh and engaging.
Respond with ONLY a valid JSON array of 3 strings, no markdown, no explanation:
["variant 1", "variant 2", "variant 3"]`;

  const result = await generateJson<string[]>(prompt);
  if (!result || !Array.isArray(result) || result.length === 0) {
    throw new Error("[aiOutreachService] generateCaptionVariants: Gemini returned null or invalid response");
  }
  // Ensure we return exactly 3; pad or trim as needed
  const variants = result.slice(0, 3).map(String);
  while (variants.length < 3) variants.push(variants[0] ?? "");
  return variants;
}

// ── Hashtag suggestions ──────────────────────────────────────

/**
 * Suggest up to 10 relevant hashtags given content text and existing top hashtags.
 * Returns an array of tag strings (without #).
 */
export async function suggestHashtags(
  content: string,
  topExisting: string[]
): Promise<string[]> {
  const existingList = topExisting.length > 0
    ? `\nFrequently used hashtags in our community (prefer these when relevant): ${topExisting.join(", ")}`
    : "";

  const prompt = `You are a social media strategist for a university engineering club (Purdue SEARCH).
Given the following content, suggest up to 10 relevant hashtags.
Mix popular hashtags with niche ones that fit the content.
${existingList}

Content:
${content}

Respond with ONLY a valid JSON array of up to 10 hashtag strings (without the # symbol), no markdown, no explanation:
["tag1", "tag2", "tag3"]`;

  const result = await generateJson<string[]>(prompt);
  if (!result || !Array.isArray(result)) {
    throw new Error("[aiOutreachService] suggestHashtags: Gemini returned null or invalid response");
  }
  return result.slice(0, 10).map(t => t.replace(/^#/, "").trim()).filter(Boolean);
}

// ── Alt text ─────────────────────────────────────────────────

/**
 * Generate alt-text for an image given its URL.
 * Note: geminiService does not support URL-based image input directly —
 * it requires base64 inline data. We fall back to a placeholder and log a warning.
 * If the image can be fetched and converted to base64, callers should do that
 * and use generateJsonFromImage directly.
 */
export async function generateAltText(imageUrl: string): Promise<string> {
  // geminiService's generateJsonFromImage requires base64 inline data.
  // Image URLs cannot be passed directly without fetching + converting.
  // Log a warning and return a reasonable placeholder.
  console.warn(
    "[aiOutreachService] generateAltText: vision via URL not supported — " +
    "geminiService requires base64 inline data. Returning placeholder. " +
    `imageUrl=${imageUrl}`
  );
  return "Image content";
}

// ── Email template ────────────────────────────────────────────

/**
 * Generate a personalized outreach email body for a contact.
 */
export async function generateEmailTemplate(
  contactName: string,
  organization: string | undefined,
  contactType: string,
  intent: string,
  campaignName?: string
): Promise<string> {
  const orgLine = organization ? ` at ${organization}` : "";
  const campLine = campaignName ? ` as part of our "${campaignName}" initiative` : "";

  const prompt = `You are writing on behalf of Purdue SEARCH, a university engineering club.
Write a professional, concise email to ${contactName}${orgLine} (contact type: ${contactType}).
Intent: ${intent}${campLine}.

Keep the email to 3-4 short paragraphs. Include a clear call-to-action.
Sign off as "The Purdue SEARCH Team".
Return ONLY the plain-text email body — no subject line, no markdown.`;

  const result = await generateText(prompt);
  if (!result) {
    throw new Error("[aiOutreachService] generateEmailTemplate: Gemini returned empty response");
  }
  return result;
}

// ── Calendar auto-fill ────────────────────────────────────────

interface AutoFillDraft {
  title: string;
  content: string;
  type: string;
  scheduledAt: string;
  platform: string[];
}

/**
 * Given upcoming events and recent milestones without existing outreach,
 * suggest DRAFT submissions to fill gaps in the given date range.
 */
export async function generateCalendarAutofill(
  from: Date,
  to: Date,
  events: { title: string; startTime: string | null; type: string }[],
  milestones: { title: string; projectName: string | null; completedAt: string | null }[]
): Promise<AutoFillDraft[]> {
  if (events.length === 0 && milestones.length === 0) {
    return [];
  }

  const eventsList = events
    .map(e => `- ${e.title} (${e.type}, ${e.startTime ? new Date(e.startTime).toDateString() : "TBD"})`)
    .join("\n") || "None";

  const milestonesList = milestones
    .map(m => `- ${m.title}${m.projectName ? ` (${m.projectName})` : ""}`)
    .join("\n") || "None";

  const prompt = `You are a social media strategist for Purdue SEARCH, a university engineering club.
Date range to fill: ${from.toDateString()} to ${to.toDateString()}

Upcoming club events that need promotion:
${eventsList}

Recent milestones worth celebrating:
${milestonesList}

Generate 2-5 social media draft posts to cover these content opportunities.
For each post, choose a scheduledAt date within the range (ISO 8601), a type from [SOCIAL_POST, ANNOUNCEMENT, EVENT_PROMO, NEWSLETTER], and platforms from [instagram, linkedin, twitter].

Respond with ONLY a valid JSON array, no markdown:
[
  {
    "title": "short title",
    "content": "draft caption text (under 300 chars)",
    "type": "EVENT_PROMO",
    "scheduledAt": "2026-05-25T12:00:00.000Z",
    "platform": ["instagram", "linkedin"]
  }
]`;

  const result = await generateJson<AutoFillDraft[]>(prompt);
  if (!result || !Array.isArray(result)) {
    return [];
  }
  return result.filter(d => d.title && d.content && d.scheduledAt);
}

// ── Voice rewrite ─────────────────────────────────────────────

/**
 * Rewrite content in a given brand voice using example sentences.
 */
export async function rewriteInVoice(
  content: string,
  voiceName: string,
  voiceExamples: string[]
): Promise<string> {
  const examplesBlock = voiceExamples.length > 0
    ? `\nExamples of the "${voiceName}" voice:\n${voiceExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
    : "";

  const prompt = `You are a brand copywriter for a university engineering club (Purdue SEARCH).
Rewrite the following content in the "${voiceName}" brand voice.${examplesBlock}

Maintain the original meaning and key information. Return only the rewritten text — no explanation, no preamble.

Content to rewrite:
${content}`;

  const result = await generateText(prompt);
  if (!result) {
    throw new Error("[aiOutreachService] rewriteInVoice: Gemini returned empty response");
  }
  return result;
}
