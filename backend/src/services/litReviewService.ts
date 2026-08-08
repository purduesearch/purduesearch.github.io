/**
 * Literature-review sections: the pure parts.
 *
 * Everything here is a pure function or one isolated Gemini call. The DB work
 * lives in courseProgressService.submitLitReview, beside every other learner
 * mutation, because that is where the unlock gate is.
 */

/** The effort floor when an author has not set one. */
export const DEFAULT_MIN_WORDS = 150;

export interface LitRubricPoint {
  /** Stable across rubric edits, so feedback rows survive rewording. */
  id: string;
  point: string;
  weight: number;
}

/** The whole author-written column. NEVER serialize this to a learner. */
export interface LitConfig {
  pdfDriveFileId: string;
  pdfTitle: string;
  citation: string;
  promptText: string;
  minWords: number;
  referenceSummary: string;
  rubric: LitRubricPoint[];
}

/** The subset a learner may see before submitting. */
export interface LearnerLitConfig {
  pdfDriveFileId: string;
  pdfTitle: string;
  citation: string;
  promptText: string;
  minWords: number;
}

export interface LitRubricResult {
  id: string;
  verdict: "caught" | "partial" | "missed";
  comment: string;
}

export interface LitFeedback {
  points: LitRubricResult[];
  overall: string;
  /** Officer-facing. The learner UI deliberately does not render it. */
  scorePct: number;
}

/**
 * Build the learner-safe view of `litConfig`.
 *
 * BY CONSTRUCTION, not by deletion. A future author-side key — grading notes, a
 * model override, a second reference summary — would ship to every learner by
 * default if this stripped known secrets off a spread of the column instead.
 * Same reasoning as the learner payload itself, which is built by omission.
 */
export function sanitizeLitConfig(raw: unknown): LearnerLitConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<LitConfig>;
  const minWords = Number(c.minWords);
  return {
    pdfDriveFileId: typeof c.pdfDriveFileId === "string" ? c.pdfDriveFileId : "",
    pdfTitle: typeof c.pdfTitle === "string" ? c.pdfTitle : "",
    citation: typeof c.citation === "string" ? c.citation : "",
    promptText: typeof c.promptText === "string" ? c.promptText : "",
    minWords: Number.isFinite(minWords) && minWords > 0 ? Math.floor(minWords) : DEFAULT_MIN_WORDS,
  };
}

/** Whitespace-separated tokens. An empty or whitespace-only string is 0, not 1. */
export function countWords(text: string): number {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

export function buildGradingPrompt(opts: {
  citation: string;
  referenceSummary: string;
  rubric: LitRubricPoint[];
  submission: string;
}): string {
  const rubricLines = opts.rubric.map((r) => `- id "${r.id}": ${r.point}`).join("\n");
  return [
    "You are giving feedback on a student's written summary of a research paper,",
    "for an undergraduate engineering club's training course.",
    "",
    `Paper: ${opts.citation}`,
    "",
    "REFERENCE SUMMARY (written by the course author — treat as ground truth):",
    opts.referenceSummary,
    "",
    "RUBRIC POINTS — judge the student's summary against each one:",
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
    "'overall' is at most three sentences: what the summary does well, then the",
    "single most useful next step.",
  ].join("\n");
}

const VERDICTS = new Set<LitRubricResult["verdict"]>(["caught", "partial", "missed"]);

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
  rubric: LitRubricPoint[]
): LitFeedback | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as { points?: unknown; overall?: unknown };

  const given = new Map<string, { verdict: LitRubricResult["verdict"]; comment: string }>();
  if (Array.isArray(body.points)) {
    for (const entry of body.points) {
      if (!entry || typeof entry !== "object") continue;
      const { id, verdict, comment } = entry as Record<string, unknown>;
      if (typeof id !== "string") continue;
      const v = verdict as LitRubricResult["verdict"];
      given.set(id, {
        verdict: typeof verdict === "string" && VERDICTS.has(v) ? v : "missed",
        comment: typeof comment === "string" ? comment : "",
      });
    }
  }

  const points: LitRubricResult[] = rubric.map((r) => {
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
 * rubric, a missing reference summary, or a Gemini response that would not parse.
 *
 * Uses `generateJson` (standard model, 30 RPM) rather than `generateJsonComplex`
 * (25 requests PER DAY). A cohort working through one module would exhaust the
 * complex lane in an afternoon and starve every other AI feature sharing it.
 *
 * Throws only if Gemini itself throws; the caller treats that identically to a
 * null return. It must never abort the submission.
 */
export async function gradeSubmission(
  config: unknown,
  submission: string
): Promise<LitFeedback | null> {
  const c = (config ?? {}) as Partial<LitConfig>;
  const rubric = Array.isArray(c.rubric)
    ? c.rubric.filter(
        (r): r is LitRubricPoint =>
          !!r && typeof r.id === "string" && typeof r.point === "string"
      ).map((r) => ({ ...r, weight: Number.isFinite(r.weight) && r.weight > 0 ? r.weight : 1 }))
    : [];
  if (!rubric.length) return null;
  if (typeof c.referenceSummary !== "string" || !c.referenceSummary.trim()) return null;

  const { generateJson } = await import("./geminiService.js");
  const raw = await generateJson<unknown>(
    buildGradingPrompt({
      citation: typeof c.citation === "string" ? c.citation : "",
      referenceSummary: c.referenceSummary,
      rubric,
      submission,
    })
  );
  return parseGradingResponse(raw, rubric);
}
