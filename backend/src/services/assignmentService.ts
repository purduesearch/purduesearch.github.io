/**
 * Assignment sections: the pure parts.
 *
 * Mirrors litReviewService's split — everything here is a pure function or one
 * isolated Gemini call, and the DB work lives in courseProgressService beside
 * every other learner mutation, because that is where the unlock gate is.
 */
import {
  gradeAgainstRubric,
  normalizeRubric,
  type RubricFeedback,
  type RubricPoint,
} from "./rubricGrading.js";

/** The effort floor when an author has not set one. */
export const DEFAULT_ASSIGNMENT_MIN_WORDS = 150;

/** The whole author-written column. NEVER serialize this to a learner. */
export interface AssignmentConfig {
  promptText: string;
  handoutDriveFileId: string;
  handoutName: string;
  handoutMimeType: string;
  minWords: number;
  referenceAnswer: string;
  rubric: RubricPoint[];
}

/** The subset a learner may see. */
export interface LearnerAssignmentConfig {
  promptText: string;
  handoutDriveFileId: string;
  handoutName: string;
  handoutMimeType: string;
  minWords: number;
}

/**
 * Build the learner-safe view of `assignmentConfig`.
 *
 * BY CONSTRUCTION, not by deletion — the same rule as sanitizeLitConfig. A
 * future author-side key (grading notes, a model override, a second reference
 * answer) would ship to every learner by default if this stripped known secrets
 * off a spread of the column instead.
 */
export function sanitizeAssignmentConfig(raw: unknown): LearnerAssignmentConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<AssignmentConfig>;
  const minWords = Number(c.minWords);
  return {
    promptText: typeof c.promptText === "string" ? c.promptText : "",
    handoutDriveFileId: typeof c.handoutDriveFileId === "string" ? c.handoutDriveFileId : "",
    handoutName: typeof c.handoutName === "string" ? c.handoutName : "",
    handoutMimeType: typeof c.handoutMimeType === "string" ? c.handoutMimeType : "",
    minWords:
      Number.isFinite(minWords) && minWords > 0
        ? Math.floor(minWords)
        : DEFAULT_ASSIGNMENT_MIN_WORDS,
  };
}

/** Grade one assignment submission. Null when grading could not run. */
export async function gradeAssignment(
  config: unknown,
  submission: string,
  /** The submitting learner, whose linked AI key (if any) grading runs on. */
  memberId?: string | null
): Promise<RubricFeedback | null> {
  const c = (config ?? {}) as Partial<AssignmentConfig>;
  return gradeAgainstRubric({
    workDescription: "a student's submission for a written assignment",
    subject: `Assignment: ${typeof c.promptText === "string" ? c.promptText : ""}`,
    referenceLabel: "REFERENCE ANSWER",
    referenceText: typeof c.referenceAnswer === "string" ? c.referenceAnswer : "",
    rubric: normalizeRubric(c.rubric),
    submission,
    memberId,
  });
}

export type CompletionOutcome = "COMPLETE" | "BLOCKED" | "COMPLETE_UNGRADED";

/**
 * Decide whether a submission completes its section.
 *
 * This is the whole of the score gate. `isSectionUnlocked` is untouched by this
 * feature — it keys on status === "COMPLETED", so gating is entirely a question
 * of when COMPLETED gets written.
 *
 * THE FAIL-OPEN CASE IS LOAD-BEARING. A gated section whose grading did not
 * produce a score completes anyway, flagged for officer review, because the
 * alternative is a Gemini outage stranding a whole cohort mid-course. The
 * write-before-grade ordering in submitWork is what makes that real rather than
 * aspirational; do not reorder it. See the design doc §5.
 */
export function decideCompletion(input: {
  passThreshold: number | null;
  hasFeedback: boolean;
  scorePct: number | null;
}): CompletionOutcome {
  // No gate configured: completion is gated on effort, exactly as before.
  if (input.passThreshold == null) return "COMPLETE";
  if (!input.hasFeedback || typeof input.scorePct !== "number") return "COMPLETE_UNGRADED";
  return input.scorePct >= input.passThreshold ? "COMPLETE" : "BLOCKED";
}
