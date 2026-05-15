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
