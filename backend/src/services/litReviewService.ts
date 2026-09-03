/**
 * Literature-review sections: the pure parts.
 *
 * Everything here is a pure function or one isolated Gemini call. The DB work
 * lives in courseProgressService, beside every other learner mutation, because
 * that is where the unlock gate is.
 *
 * The grading machinery itself now lives in `rubricGrading.ts`, shared with
 * ASSIGNMENT sections. What stays here is the lit-review-specific config shape,
 * its learner-safe view, and the adapter that names lit-review's nouns.
 */

// Value imports, because gradeSubmission below calls them. The re-export block
// is separate: a bare `export { … } from` does NOT bring a name into this
// module's scope, so importing and re-exporting are both required.
import { gradeAgainstRubric, normalizeRubric, type RubricFeedback } from "./rubricGrading.js";

// Re-exported under the original names so no importer breaks —
// courseProgressService.ts imports `countWords` and `LitFeedback` from here.
export {
  buildGradingPrompt,
  parseGradingResponse,
  countWords,
  normalizeRubric,
  gradeAgainstRubric,
  type RubricPoint as LitRubricPoint,
  type RubricResult as LitRubricResult,
  type RubricFeedback as LitFeedback,
} from "./rubricGrading.js";

// Local alias for the re-exported type, so the signatures below read naturally.
import type { RubricPoint as LitRubricPoint } from "./rubricGrading.js";

/** The effort floor when an author has not set one. */
export const DEFAULT_MIN_WORDS = 150;

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

/**
 * Grade one lit-review submission. Null when grading could not run — a missing
 * rubric, a missing reference summary, or a response that would not parse.
 *
 * A thin adapter over the shared grader: all this supplies is lit review's
 * nouns (a paper, a reference summary) and its config field names.
 */
export async function gradeSubmission(
  config: unknown,
  submission: string,
  /** The submitting learner, whose linked AI key (if any) grading runs on. */
  memberId?: string | null
): Promise<RubricFeedback | null> {
  const c = (config ?? {}) as Partial<LitConfig>;
  return gradeAgainstRubric({
    workDescription: "a student's written summary of a research paper",
    subject: `Paper: ${typeof c.citation === "string" ? c.citation : ""}`,
    referenceLabel: "REFERENCE SUMMARY",
    referenceText: typeof c.referenceSummary === "string" ? c.referenceSummary : "",
    rubric: normalizeRubric(c.rubric),
    submission,
    memberId,
  });
}
