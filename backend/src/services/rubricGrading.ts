/**
 * Rubric grading, shared by every course section kind that takes written work.
 *
 * Lifted out of litReviewService when ASSIGNMENT sections arrived: the prompt,
 * the response parser, and the scoring were already generic over
 * subject / reference text / rubric / submission, so both kinds share one
 * grading path rather than growing a second near-identical copy.
 *
 * Everything here is a pure function or one isolated Gemini call. No DB access.
 */

export interface RubricPoint {
  /** Stable across rubric edits, so feedback rows survive rewording. */
  id: string;
  point: string;
  weight: number;
}

export interface RubricResult {
  id: string;
  verdict: "caught" | "partial" | "missed";
  comment: string;
}

export interface RubricFeedback {
  points: RubricResult[];
  overall: string;
  /**
   * Officer-facing, and learner-facing only when the section is gated — an
   * ungated section deliberately hides it, because a member who saw "48%" would
   * read it as a fail no matter what the copy said.
   */
  scorePct: number;
}

/** Whitespace-separated tokens. An empty or whitespace-only string is 0, not 1. */
export function countWords(text: string): number {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

/** Keep only well-formed points, and floor every weight at 1. */
export function normalizeRubric(raw: unknown): RubricPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is RubricPoint =>
      !!r && typeof (r as RubricPoint).id === "string" && typeof (r as RubricPoint).point === "string")
    .map((r) => ({ ...r, weight: Number.isFinite(r.weight) && r.weight > 0 ? r.weight : 1 }));
}

export function buildGradingPrompt(opts: {
  /** "a student's written summary of a research paper" / "a student's assignment submission" */
  workDescription: string;
  /** The paper's citation, or the assignment's prompt. */
  subject: string;
  /** Label for the ground truth: "REFERENCE SUMMARY" / "REFERENCE ANSWER". */
  referenceLabel: string;
  referenceText: string;
  rubric: RubricPoint[];
  submission: string;
}): string {
  const rubricLines = opts.rubric.map((r) => `- id "${r.id}": ${r.point}`).join("\n");
  return [
    `You are giving feedback on ${opts.workDescription},`,
    "for an undergraduate engineering club's training course.",
    "",
    opts.subject,
    "",
    `${opts.referenceLabel} (written by the course author — treat as ground truth):`,
    opts.referenceText,
    "",
    "RUBRIC POINTS — judge the student's work against each one:",
    rubricLines,
    "",
    "STUDENT SUBMISSION:",
    opts.submission,
    "",
    "For every rubric id listed above, decide whether the student caught it,",
    "partially caught it, or missed it. Be generous about wording and strict",
    "about substance: a different phrasing of the right idea is 'caught'; the",
    "right vocabulary around a wrong claim is 'missed'. Never invent a rubric id",
    "and never omit one.",
    "",
    "Write every comment TO the student, in the second person, in at most two",
    "sentences. The tone is a lab-mate reading a draft, not a grader assigning",
    "marks. When something is missed, name the section or figure to reread.",
    "",
    'Return JSON exactly in this shape:',
    '{"points":[{"id":"...","verdict":"caught|partial|missed","comment":"..."}],"overall":"..."}',
    "",
    "'overall' is at most three sentences: what the work does well, then the",
    "single most useful next step.",
  ].join("\n");
}

const VERDICTS = new Set<RubricResult["verdict"]>(["caught", "partial", "missed"]);

/**
 * Turn the model's JSON into feedback, clamped to the author's rubric.
 *
 * Iterates the RUBRIC, never the model's array: an id the model invented has no
 * author-written point behind it and must be dropped, and a point the model
 * skipped must not silently vanish from the learner's feedback. Missing is
 * scored as `missed` — the alternative is a skipped point reading as free credit.
 */
export function parseGradingResponse(
  raw: unknown,
  rubric: RubricPoint[]
): RubricFeedback | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as { points?: unknown; overall?: unknown };

  const given = new Map<string, { verdict: RubricResult["verdict"]; comment: string }>();
  if (Array.isArray(body.points)) {
    for (const entry of body.points) {
      if (!entry || typeof entry !== "object") continue;
      const { id, verdict, comment } = entry as Record<string, unknown>;
      if (typeof id !== "string") continue;
      const v = verdict as RubricResult["verdict"];
      given.set(id, {
        verdict: typeof verdict === "string" && VERDICTS.has(v) ? v : "missed",
        comment: typeof comment === "string" ? comment : "",
      });
    }
  }

  const points: RubricResult[] = rubric.map((r) => {
    const hit = given.get(r.id);
    return { id: r.id, verdict: hit?.verdict ?? "missed", comment: hit?.comment ?? "" };
  });

  const total = rubric.reduce((s, r) => s + (r.weight > 0 ? r.weight : 0), 0);
  const earned = points.reduce((s, p, i) => {
    const w = (rubric[i]?.weight ?? 0) > 0 ? rubric[i]!.weight : 0;
    if (p.verdict === "caught") return s + w;
    if (p.verdict === "partial") return s + w / 2;
    return s;
  }, 0);

  return {
    points,
    overall: typeof body.overall === "string" ? body.overall : "",
    scorePct: total > 0 ? Math.round((earned / total) * 10000) / 100 : 0,
  };
}

/**
 * Grade one submission. Returns null when grading could not run — a missing
 * rubric, missing ground truth, or a Gemini response that would not parse.
 *
 * Uses `generateJson` (standard model, 30 RPM) rather than the reasoning-class lane
 * (25 requests PER DAY). A cohort working through one module would exhaust the
 * complex lane in an afternoon and starve every other AI feature sharing it.
 *
 * Throws only if Gemini itself throws; the caller treats that identically to a
 * null return. It must never abort the submission.
 */
export async function gradeAgainstRubric(opts: {
  workDescription: string;
  subject: string;
  referenceLabel: string;
  referenceText: string;
  rubric: RubricPoint[];
  submission: string;
}): Promise<RubricFeedback | null> {
  if (!opts.rubric.length) return null;
  if (!opts.referenceText.trim()) return null;
  const { generateJson } = await import("./geminiService.js");
  const raw = await generateJson<unknown>(buildGradingPrompt(opts));
  return parseGradingResponse(raw, opts.rubric);
}
