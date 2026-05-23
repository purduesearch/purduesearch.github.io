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

// ── Gap analysis ─────────────────────────────────────────────

interface GapItem {
  title: string;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  suggestedType: string;
}

/**
 * AI-powered content gap analysis: given upcoming events and recent milestones
 * with no existing submissions, produce a prioritized list of missed opportunities.
 */
export async function generateGapAnalysis(
  events: { title: string; startTime: string | null; type: string }[],
  milestones: { title: string; projectName: string | null; completedAt: string | null }[]
): Promise<GapItem[]> {
  if (events.length === 0 && milestones.length === 0) return [];

  const eventsList = events.map(e =>
    `- ${e.title} (${e.type}, ${e.startTime ? new Date(e.startTime).toDateString() : "TBD"})`
  ).join("\n") || "None";

  const milestonesList = milestones.map(m =>
    `- ${m.title}${m.projectName ? ` (${m.projectName})` : ""}${m.completedAt ? `, completed ${new Date(m.completedAt).toDateString()}` : ""}`
  ).join("\n") || "None";

  const prompt = `You are a social media strategist for Purdue SEARCH, a university engineering club.
The following upcoming events and recent milestones have NO social media content planned for them.
Identify which represent the best outreach opportunities and explain why.

Upcoming events with no promo:
${eventsList}

Recent milestones with no celebration post:
${milestonesList}

Return ONLY a valid JSON array (no markdown) of up to 8 items, each with:
- "title": the event or milestone name
- "reason": one sentence on why this is worth posting about
- "priority": "HIGH", "MEDIUM", or "LOW"
- "suggestedType": one of "EVENT_PROMO", "ANNOUNCEMENT", "SOCIAL_POST", "NEWSLETTER"

[{"title":"...","reason":"...","priority":"HIGH","suggestedType":"EVENT_PROMO"}]`;

  const result = await generateJson<GapItem[]>(prompt);
  if (!result || !Array.isArray(result)) return [];
  return result.slice(0, 8).filter(g => g.title && g.reason);
}

// ── Weekly digest ─────────────────────────────────────────────

/**
 * Generate a narrative weekly digest summarising last week's outreach performance.
 */
export async function generateWeeklyDigest(
  published: { title: string; type: string; platforms: string[] }[],
  metrics: { platform: string; impressions: number; likes: number; comments: number; shares: number }[],
  crmFunnel: Record<string, number>
): Promise<string> {
  const pubList = published.length > 0
    ? published.map(p => `- "${p.title}" (${p.type}) on ${p.platforms.join(", ")}`).join("\n")
    : "No posts published last week.";

  const metricSummary = metrics.length > 0
    ? metrics.map(m =>
        `${m.platform}: ${m.impressions} impressions, ${m.likes} likes, ${m.comments} comments, ${m.shares} shares`
      ).join("\n")
    : "No engagement metrics recorded yet.";

  const funnelStr = Object.entries(crmFunnel)
    .map(([stage, count]) => `${stage}: ${count}`)
    .join(", ") || "No CRM data.";

  const prompt = `You are the outreach director for Purdue SEARCH, a university engineering club.
Write a concise (3-4 paragraph) weekly outreach digest in a professional, upbeat tone.
Cover: what was published, engagement highlights, CRM pipeline state, and 2-3 actionable recommendations for next week.

Last week's published posts:
${pubList}

Engagement metrics:
${metricSummary}

CRM pipeline:
${funnelStr}

Return only the digest narrative — no headers, no bullet points, plain paragraphs.`;

  const result = await generateText(prompt);
  if (!result) throw new Error("[aiOutreachService] generateWeeklyDigest: empty response");
  return result;
}

// ── Member spotlight ──────────────────────────────────────────

/**
 * Generate a "Member Spotlight" social post for a given member.
 */
export async function generateMemberSpotlight(
  displayName: string,
  title: string | undefined,
  team: string | undefined,
  bio: string | undefined,
  recentMilestones: string[]
): Promise<string> {
  const milestonesBlock = recentMilestones.length > 0
    ? `\nRecent contributions:\n${recentMilestones.map(m => `- ${m}`).join("\n")}`
    : "";

  const prompt = `You are a social media writer for Purdue SEARCH, a university engineering club.
Write an engaging "Member Spotlight" post for ${displayName}${title ? `, ${title}` : ""}${team ? ` on the ${team} team` : ""}.
${bio ? `About them: ${bio}` : ""}${milestonesBlock}

The post should:
- Feel personal and celebratory, not like a resume
- Be 150–220 characters (Instagram-friendly)
- End with relevant hashtags (3–5)
- NOT include their Slack handle or personal contact info

Return only the post text — no extra commentary.`;

  const result = await generateText(prompt);
  if (!result) throw new Error("[aiOutreachService] generateMemberSpotlight: empty response");
  return result;
}

// ── Milestone syndication ─────────────────────────────────────

interface SyndicationPost {
  audience: string;    // e.g., "Sponsors", "Prospective Members", "General Public"
  platform: string[];
  caption: string;
}

/**
 * Given a completed milestone, suggest cross-program syndication posts
 * tailored to different audiences.
 */
export async function generateSyndicationPosts(
  milestoneTitle: string,
  projectName: string | undefined,
  milestoneDescription: string | undefined
): Promise<SyndicationPost[]> {
  const context = [
    projectName    ? `Project: ${projectName}` : "",
    milestoneDescription ? `Description: ${milestoneDescription}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are a social media strategist for Purdue SEARCH, a university engineering club.
A milestone was just completed: "${milestoneTitle}"
${context}

Generate 3 distinct social posts for 3 different audiences:
1. Sponsors / Industry Partners — emphasize technical achievement and ROI
2. Prospective Members / Recruits — emphasize excitement, growth, and team culture
3. General Public / Alumni — emphasize the impact and story

For each, choose appropriate platforms from [instagram, linkedin, twitter].
Keep captions under 280 characters.

Respond with ONLY a valid JSON array (no markdown):
[
  {
    "audience": "Sponsors / Industry Partners",
    "platform": ["linkedin"],
    "caption": "..."
  }
]`;

  const result = await generateJson<SyndicationPost[]>(prompt);
  if (!result || !Array.isArray(result)) return [];
  return result.slice(0, 3).filter(p => p.audience && p.caption);
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
