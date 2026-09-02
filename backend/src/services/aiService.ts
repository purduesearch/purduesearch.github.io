import { runJson, todayContext } from "./ai/aiRouter.js";
import { validateSectionPlan, type SectionPlan } from "./sectionPlan.js";

export interface ParsedTask {
  title: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDate?: string;
  parentTaskId?: string; // set when the message clearly describes a subtask of an existing task
}

export interface TaskContext {
  projectName?: string;
  projectDescription?: string;
  projectType?: string;
  // Open (non-done) tasks for the project — used for subtask parent detection
  existingTasks: { id: string; title: string; description?: string | null }[];
}

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function buildPrompt(today: string, context: TaskContext | undefined, messageText: string): string {
  const lines: string[] = [];

  lines.push(`Today's date is ${today} (use this to resolve relative dates like "by Friday", "end of day", "next week").`);
  lines.push("");

  if (context?.projectName) {
    lines.push(`Project: ${context.projectName}${context.projectType ? ` (${context.projectType})` : ""}${context.projectDescription ? ` — ${context.projectDescription}` : ""}`);
    lines.push("");
  }

  if (context && context.existingTasks.length > 0) {
    lines.push("Open tasks in this project (reference these IDs for subtask detection):");
    for (const t of context.existingTasks) {
      const desc = t.description ? ` — ${t.description.slice(0, 80)}` : "";
      lines.push(`  [${t.id}] ${t.title}${desc}`);
    }
    lines.push("");
  }

  lines.push(`You are a task extraction assistant for a project management Slack bot.
Given a Slack message, extract task information and respond with ONLY a JSON object.

Output fields:
- title (required): concise task title, max 100 chars
- description (optional): 1-2 sentences capturing supporting context; always include if the message has relevant detail beyond the title
- priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" (optional; infer from urgency words — ASAP/urgent/critical → HIGH/CRITICAL, "low priority"/"when you get a chance" → LOW)
- dueDate: ISO 8601 date "YYYY-MM-DD" (optional; resolve all relative dates using today's date above; omit if no date is mentioned)
- parentTaskId: string (optional; set to the exact ID from the open task list above ONLY when the message clearly describes work that is a sub-step of an existing task, e.g. "for the CI pipeline task, add a linting step" → parentTaskId of the CI pipeline task)

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no code blocks.
- Only set parentTaskId when the relationship is explicit and unambiguous.
- If the message mentions multiple tasks, create the most prominent one.
- Preserve technical terms, names, and acronyms exactly as written.`);

  lines.push("");
  lines.push(`Examples (today = ${today}):`);
  lines.push(`Message: "Can someone fix the login bug ASAP?"`);
  lines.push(`{"title":"Fix login bug","priority":"HIGH","description":"Login bug needs urgent attention."}`);
  lines.push("");
  lines.push(`Message: "Low priority - clean up old test files when you get a chance"`);
  lines.push(`{"title":"Clean up old test files","priority":"LOW"}`);
  lines.push("");
  lines.push(`Message: "Need to add unit tests for the auth middleware by end of this week"`);
  lines.push(`{"title":"Add unit tests for auth middleware","dueDate":"${nextFriday(today)}","priority":"MEDIUM","description":"Write unit tests covering auth middleware edge cases."}`);
  lines.push("");

  if (context && context.existingTasks.length > 0) {
    const exampleTask = context.existingTasks[0];
    lines.push(`Message: "For the '${exampleTask.title}' task, we also need to update the README"`);
    lines.push(`{"title":"Update README for ${exampleTask.title.slice(0, 40)}","parentTaskId":"${exampleTask.id}","description":"Update README documentation as part of this task."}`);
    lines.push("");
  }

  lines.push(`Message: "${messageText}"`);

  return lines.join("\n");
}

// Compute the ISO date of the coming Friday given a YYYY-MM-DD string
function nextFriday(today: string): string {
  const d = new Date(today);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d.toISOString().split("T")[0];
}

// ── Press Kit section plan (audience-aware) ──────────────────
// Produces a SectionPlan that pressKitService turns into a designed, section-based
// document. Uses the complex model (quality matters for published material) and is
// fed the full live-project snapshot so every statement is grounded in real data.
// Tabular data (numbers, timeline, roster, links) is filled in deterministically
// downstream — the model only chooses placement and writes prose.

export type PressKitAudience = "SPONSORS" | "PRESS" | "RECRUITING" | "GENERAL";

export interface PressKitPlanInput {
  name: string;
  type: string;
  status: string;
  description?: string | null;
  programTag?: string | null;
  githubRepo?: string | null;
  startDate?: string | null;   // human-formatted date or null
  targetDate?: string | null;
  stats: {
    teamSize: number; tasksDone: number; tasksTotal: number;
    milestonesHit: number; hoursLogged: number; durationDays: number | null; commentCount: number;
  };
  milestones: { title: string; date: string | null; description?: string | null }[];
  contributors: { displayName: string; tasksDone: number; hours: number }[];
  team: { displayName: string; title: string | null; role: string | null; isLead: boolean }[];
  tags: string[];
  taskTitles: string[];
  links: { label: string; url: string }[];
  enabledSections: string[];   // config.includedSections (gates which blocks the AI plans)
  showContact: boolean;
  contactEmail: string;
}

const AUDIENCE_TONE: Record<PressKitAudience, string> = {
  SPONSORS:   "Emphasize impact, progress, and why the work matters to a funder. Confident, concrete.",
  PRESS:      "Neutral, factual, quotable. Lead with what it is and why it is notable.",
  RECRUITING: "Inviting and energetic; convey what members do and learn.",
  GENERAL:    "Clear, professional overview for a general audience.",
};

// One plan instruction per config section id — maps the user's section toggles to
// concrete SectionPlan entries so the model's freedom is over ordering + copy, not
// structure. Data placeholders (stats/timeline/team/links) never carry their data.
const SECTION_INSTRUCTIONS: Record<string, string> = {
  masthead:    '"masthead" → one `hero` section: heading = the project name, subheading = a short factual tagline from the type/description.',
  about:       '"about" → a `richText` section, heading "About This Project": 2–4 sentences on what this project is and its current state.',
  aboutSearch: '"aboutSearch" → a `richText` section, heading "About Purdue SEARCH": 2–3 sentences of boilerplate about the SEARCH club (a space research & engineering student org at Purdue).',
  stats:       '"stats" → a `stats` placeholder section. Do NOT write any numbers; set only a heading like "By the Numbers".',
  building:    '"building" → a `richText` section, heading "What We\'re Building": 3–5 sentences naming the specific subsystems / areas of work, inferred from the task titles and tags.',
  timeline:    '"timeline" → a `timeline` placeholder section. Do NOT list milestones or dates; set only a heading.',
  tech:        '"tech" → a `richText` section, heading "Tech & Tools": one or two sentences highlighting the technologies, drawn from the tags list.',
  team:        '"team" → a `team` placeholder section. Do NOT list members; set only a heading.',
  highlights:  '"highlights" → a `richText` section, heading "Highlights": a short markdown bullet list of the most notable achievements, drawn from the completed milestones.',
  links:       '"links" → a `links` placeholder section. Do NOT list URLs; set only a heading.',
  contact:     '"contact" → a `richText` section, heading "Contact": one line inviting press / partnership inquiries at the contact email in the facts.',
  sponsorship: '"sponsorship" → a short `richText` section (2–3 sentences on the impact of support) followed by a `cta` section (label e.g. "Become a sponsor", href = a mailto: to the contact email).',
};

/**
 * Ask the complex model for a full section plan for a press kit. Returns null on
 * missing key / model failure / empty output so callers can fall back to a
 * deterministic plan.
 */
export async function generatePressKitPlan(
  input: PressKitPlanInput,
  audience: PressKitAudience,
  memberId?: string | null
): Promise<SectionPlan | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const enabled = input.enabledSections.filter((s) =>
    SECTION_INSTRUCTIONS[s]
    && (s !== "sponsorship" || audience === "SPONSORS")
    && (s !== "contact" || (input.showContact && !!input.contactEmail)));
  if (!enabled.length) return null;

  const checklist = enabled.map((s) => `- ${SECTION_INSTRUCTIONS[s]}`).join("\n");

  const facts = {
    project: {
      name: input.name, type: input.type, status: input.status,
      description: input.description ?? null,
      programTag: input.programTag ?? null, githubRepo: input.githubRepo ?? null,
      startDate: input.startDate ?? null, targetDate: input.targetDate ?? null,
    },
    stats: input.stats,
    completedMilestones: input.milestones.slice(0, 12).map((m) => ({
      title: m.title, date: m.date ?? null, description: m.description ?? null,
    })),
    taskTitles: input.taskTitles.slice(0, 50),
    tags: input.tags,
    team: input.team.map((t) => ({ name: t.displayName, title: t.title ?? null, isLead: t.isLead })),
    topContributors: input.contributors.slice(0, 6),
    links: input.links,
    contactEmail: input.showContact ? input.contactEmail : "",
  };

  const prompt = `You design the press kit for Purdue SEARCH (Students for the Exploration and Research of Space), a university engineering club.
${todayContext()}
Audience: ${audience}. ${AUDIENCE_TONE[audience]}

Return ONLY a JSON object: { "sections": PlanSection[] }. Each PlanSection is exactly one of:
  { "type": "hero", "heading": string, "subheading": string, "align": "center"|"left", "overlay": boolean }
  { "type": "richText", "heading": string, "markdown": string }        // markdown may use ## sub-heads, bullet lists, **bold**, and [links](url)
  { "type": "columns", "heading": string, "columns": [{ "markdown": string }, ...] }   // 2–3 columns
  { "type": "quote", "text": string, "attribution": string }
  { "type": "cta", "label": string, "href": string, "style": "solid"|"outline" }
  { "type": "stats"|"timeline"|"team"|"links", "heading": string }     // data-only placeholders (system fills the data)

Include EACH of these content blocks exactly once, ordered for maximum impact for this audience:
${checklist}

Rules:
- Ground every statement ONLY in the facts below. Do NOT invent numbers, names, dates, partnerships, or claims.
- For placeholder types (stats/timeline/team/links) provide only a heading — never the underlying data.
- Avoid filler adjectives ("cutting-edge", "revolutionary", "exciting"); be concrete and factual.
- Keep prose tight and skimmable.

FACTS (JSON):
${JSON.stringify(facts, null, 2)}`;

  try {
    const raw = await runJson<unknown>({ memberId }, "high", { prompt, json: true, maxOutputTokens: 8192 });
    if (!raw) return null;
    const plan = validateSectionPlan(raw);
    return plan.sections.length ? plan : null;
  } catch (err) {
    console.warn("[aiService] generatePressKitPlan failed:", err);
    return null;
  }
}

export async function parseTaskFromMessage(
  text: string,
  todayDate?: string,
  context?: TaskContext
): Promise<ParsedTask | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[aiService] GEMINI_API_KEY is not set — skipping AI parse");
    return null;
  }

  const inputText = text.slice(0, 2000); // 3.1-flash-lite has 1M input tokens
  const today = todayDate ?? new Date().toISOString().split("T")[0];
  console.log(`[aiService] Calling ${GEMINI_MODEL} (today=${today}, ${context?.existingTasks.length ?? 0} ctx tasks): "${inputText.slice(0, 120)}"`);

  const prompt = buildPrompt(today, context, inputText);

  let response: Response;
  try {
    response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch (fetchErr) {
    console.error("[aiService] Network error calling Gemini:", fetchErr);
    return null;
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(unreadable)");
    console.error(`[aiService] Gemini API error ${response.status} ${response.statusText}: ${errorBody}`);
    return null;
  }

  let data: { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  try {
    data = (await response.json()) as typeof data;
  } catch (jsonErr) {
    console.error("[aiService] Failed to parse Gemini response as JSON:", jsonErr);
    return null;
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const responsePart = parts.find((p) => !p.thought) ?? parts[parts.length - 1];
  const raw = responsePart?.text ?? "";
  console.log(`[aiService] Raw Gemini response: ${raw}`);

  const jsonStr = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(jsonStr) as ParsedTask;
    // Validate parentTaskId is actually in the provided task list
    if (parsed.parentTaskId && context) {
      const valid = context.existingTasks.some(t => t.id === parsed.parentTaskId);
      if (!valid) {
        console.warn(`[aiService] Gemini returned unknown parentTaskId "${parsed.parentTaskId}" — ignoring`);
        delete parsed.parentTaskId;
      }
    }
    console.log(`[aiService] Parsed task:`, parsed);
    return parsed;
  } catch (parseErr) {
    console.error(`[aiService] JSON.parse failed on: "${jsonStr}"`, parseErr);
    return null;
  }
}
