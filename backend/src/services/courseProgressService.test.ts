// Pure-logic unit tests for courseProgressService. No DB required.
// Run: cd backend && npx tsx src/services/courseProgressService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Uses the same tiny inline assertion harness as pollService.test.ts /
// sectionPlan.test.ts so no test-framework dependency is needed.

import {
  isSectionUnlocked,
  isModuleComplete,
  gradeQuestion,
  computeScorePct,
  clampVideoProgress,
  VIDEO_BOOTSTRAP_GRACE_SEC,
  type GateModule,
  type GateSection,
  type GateProgress,
  type ProgressLookup,
  type GradableQuestion,
} from "./courseProgressService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

// ── isSectionUnlocked / isModuleComplete ─────────────────────

const mod = (id: string, order: number, sequential = true, isRequired = true): GateModule =>
  ({ id, order, sequential, isRequired });
const sec = (id: string, moduleId: string, order: number, isRequired = true): GateSection =>
  ({ id, moduleId, order, isRequired });
const done = (): GateProgress => ({ status: "COMPLETED" });
const started = (): GateProgress => ({ status: "IN_PROGRESS" });

console.log("isSectionUnlocked — inside a sequential module");
{
  const modules = [mod("m1", 0)];
  const sections = [sec("a", "m1", 0), sec("b", "m1", 1), sec("c", "m1", 2)];
  const u = (s: GateSection, p: ProgressLookup = {}) => isSectionUnlocked(modules, sections, p, s);

  check("first section is always unlocked", u(sections[0]!));
  check("second is locked while the first is unstarted", !u(sections[1]!));
  check("second is locked while the first is only in progress", !u(sections[1]!, { a: started() }));
  check("second unlocks once the first is complete", u(sections[1]!, { a: done() }));
  check("third stays locked while the second is incomplete", !u(sections[2]!, { a: done() }));
  check("third unlocks once both predecessors are complete", u(sections[2]!, { a: done(), b: done() }));
  check("a Map of progress works the same as a record", u(sections[1]!, new Map([["a", done()]])));
  check("a section's own status never gates itself", u(sections[0]!, { a: started() }));
}

console.log("isSectionUnlocked — optional sections never block");
{
  const modules = [mod("m1", 0)];
  const sections = [sec("intro", "m1", 0, false), sec("safety", "m1", 1), sec("test", "m1", 2)];
  const u = (s: GateSection, p: ProgressLookup = {}) => isSectionUnlocked(modules, sections, p, s);

  check("an unstarted optional section does not block what follows", u(sections[1]!));
  check("a required section still blocks what follows", !u(sections[2]!));
  check("completing the required one unlocks the rest", u(sections[2]!, { safety: done() }));
}

console.log("isSectionUnlocked — a free-order module");
{
  const modules = [mod("m1", 0, false)];
  const sections = [sec("a", "m1", 0), sec("b", "m1", 1), sec("c", "m1", 2)];
  const u = (s: GateSection) => isSectionUnlocked(modules, sections, {}, s);

  check("every section of a free-order module is open at once", u(sections[0]!) && u(sections[1]!) && u(sections[2]!));
}

console.log("isSectionUnlocked — between modules");
{
  const modules = [mod("m1", 0), mod("m2", 1, false), mod("m3", 2)];
  const sections = [
    sec("a", "m1", 0), sec("b", "m1", 1),
    sec("c", "m2", 0), sec("d", "m2", 1),
    sec("e", "m3", 0),
  ];
  const u = (s: GateSection, p: ProgressLookup = {}) => isSectionUnlocked(modules, sections, p, s);

  check("module 2 is locked while module 1 is unfinished", !u(sections[2]!, { a: done() }));
  check(
    "finishing module 1 opens BOTH sections of the free-order module 2",
    u(sections[2]!, { a: done(), b: done() }) && u(sections[3]!, { a: done(), b: done() })
  );
  check(
    "module 3 is locked while module 2 is unfinished",
    !u(sections[4]!, { a: done(), b: done(), c: done() })
  );
  check(
    "module 3 unlocks once modules 1 and 2 are complete",
    u(sections[4]!, { a: done(), b: done(), c: done(), d: done() })
  );
}

console.log("isSectionUnlocked — modules that never gate");
{
  const optionalMod = [mod("m1", 0, true, false), mod("m2", 1)];
  const optionalSecs = [sec("a", "m1", 0), sec("b", "m2", 0)];
  check(
    "a non-required module never blocks the module after it",
    isSectionUnlocked(optionalMod, optionalSecs, {}, optionalSecs[1]!)
  );

  const allOptional = [mod("m1", 0), mod("m2", 1)];
  const allOptionalSecs = [sec("a", "m1", 0, false), sec("b", "m1", 1, false), sec("c", "m2", 0)];
  check(
    "a module whose sections are all optional never blocks",
    isSectionUnlocked(allOptional, allOptionalSecs, {}, allOptionalSecs[2]!)
  );

  const withEmpty = [mod("m1", 0), mod("m2", 1)];
  const onlyLater = [sec("c", "m2", 0)];
  check(
    "an empty module never blocks",
    isSectionUnlocked(withEmpty, onlyLater, {}, onlyLater[0]!)
  );
}

console.log("isModuleComplete");
{
  const sections = [sec("a", "m1", 0), sec("b", "m1", 1, false), sec("c", "m2", 0)];

  check("incomplete while a required section is unfinished", !isModuleComplete(sections, {}, "m1"));
  check(
    "complete once every REQUIRED section is done, optional ones ignored",
    isModuleComplete(sections, { a: done() }, "m1")
  );
  check("an empty module is vacuously complete", isModuleComplete(sections, {}, "m-none"));
  check("sections of other modules are ignored", isModuleComplete(sections, { c: done() }, "m2"));
}

// ── clampVideoProgress ───────────────────────────────────────

console.log("clampVideoProgress");
{
  // Steady playback at 1× — a 10 s ping after 10 s of wall clock is believable.
  eq(
    "accepts a normal 10 s advance after 10 s of wall clock",
    clampVideoProgress({ prevMaxWatchedSec: 30, positionSec: 40, elapsedSec: 10 }),
    40
  );

  // The devtools attack: claim you reached the end of a 40-minute video.
  eq(
    "rejects an over-large jump and holds the previous high-water mark",
    clampVideoProgress({ prevMaxWatchedSec: 30, positionSec: 2400, elapsedSec: 10 }),
    30
  );

  // Budget = elapsed × rate × 1.5 + bootstrap grace. At 10 s / 2× that is 45 s.
  const budget = 10 * 2 * 1.5 + VIDEO_BOOTSTRAP_GRACE_SEC;
  eq(
    "accepts a jump exactly at the budget",
    clampVideoProgress({ prevMaxWatchedSec: 100, positionSec: 100 + budget, elapsedSec: 10, maxAllowedRate: 2 }),
    100 + budget
  );
  eq(
    "rejects a jump one second past the budget",
    clampVideoProgress({ prevMaxWatchedSec: 100, positionSec: 100 + budget + 1, elapsedSec: 10, maxAllowedRate: 2 }),
    100
  );
  eq(
    "a slower max rate shrinks the budget, so the same jump is rejected",
    clampVideoProgress({ prevMaxWatchedSec: 100, positionSec: 100 + budget, elapsedSec: 10, maxAllowedRate: 1 }),
    100
  );

  // Monotonicity: a rewind is allowed in the player but never lowers the mark.
  eq(
    "a rewind never rolls the high-water mark back",
    clampVideoProgress({ prevMaxWatchedSec: 300, positionSec: 12, elapsedSec: 10 }),
    300
  );
  eq(
    "the very first ping of a session is bounded by the bootstrap grace",
    clampVideoProgress({ prevMaxWatchedSec: 0, positionSec: 600, elapsedSec: 0 }),
    0
  );
  eq(
    "a resume at roughly the persisted position is accepted on the first ping",
    clampVideoProgress({ prevMaxWatchedSec: 120, positionSec: 122, elapsedSec: 0 }),
    122
  );
  eq(
    "a non-finite claim is ignored",
    clampVideoProgress({ prevMaxWatchedSec: 50, positionSec: Number.NaN, elapsedSec: 10 }),
    50
  );
}

// ── gradeQuestion ────────────────────────────────────────────

console.log("gradeQuestion");

const single: GradableQuestion = {
  id: "q1", kind: "SINGLE", points: 1,
  answers: [
    { id: "a1", isCorrect: false },
    { id: "a2", isCorrect: true },
    { id: "a3", isCorrect: false },
  ],
};
{
  check("SINGLE: the correct answer passes", gradeQuestion(single, ["a2"]));
  check("SINGLE: a wrong answer fails", !gradeQuestion(single, ["a1"]));
  check("SINGLE: no selection fails", !gradeQuestion(single, []));
  check("SINGLE: two selections fail even if one is correct", !gradeQuestion(single, ["a1", "a2"]));
  check("SINGLE: an unknown answer id fails", !gradeQuestion(single, ["nope"]));
}

const trueFalse: GradableQuestion = {
  id: "q2", kind: "TRUE_FALSE", points: 2,
  answers: [
    { id: "t", isCorrect: true },
    { id: "f", isCorrect: false },
  ],
};
{
  check("TRUE_FALSE: true passes", gradeQuestion(trueFalse, ["t"]));
  check("TRUE_FALSE: false fails", !gradeQuestion(trueFalse, ["f"]));
  check("TRUE_FALSE: selecting both fails", !gradeQuestion(trueFalse, ["t", "f"]));
  check("TRUE_FALSE: no selection fails", !gradeQuestion(trueFalse, []));
}

const multi: GradableQuestion = {
  id: "q3", kind: "MULTI", points: 3,
  answers: [
    { id: "m1", isCorrect: true },
    { id: "m2", isCorrect: true },
    { id: "m3", isCorrect: false },
    { id: "m4", isCorrect: false },
  ],
};
{
  check("MULTI: the exact correct set passes", gradeQuestion(multi, ["m1", "m2"]));
  check("MULTI: order does not matter", gradeQuestion(multi, ["m2", "m1"]));
  check("MULTI: duplicates are de-duplicated, not counted", gradeQuestion(multi, ["m1", "m1", "m2"]));
  // Partial selection is the case that must NOT earn credit.
  check("MULTI: a partial selection fails", !gradeQuestion(multi, ["m1"]));
  check("MULTI: a superset fails", !gradeQuestion(multi, ["m1", "m2", "m3"]));
  check("MULTI: an all-of-the-above sweep fails", !gradeQuestion(multi, ["m1", "m2", "m3", "m4"]));
  check("MULTI: no selection fails", !gradeQuestion(multi, []));
}

// Zero-correct questions: an authoring mistake that must not grade as a freebie.
{
  const zeroMulti: GradableQuestion = {
    id: "q4", kind: "MULTI", points: 1,
    answers: [{ id: "z1", isCorrect: false }, { id: "z2", isCorrect: false }],
  };
  check("MULTI with no correct answer: selecting nothing is the only match", gradeQuestion(zeroMulti, []));
  check("MULTI with no correct answer: any selection fails", !gradeQuestion(zeroMulti, ["z1"]));

  const zeroSingle: GradableQuestion = {
    id: "q5", kind: "SINGLE", points: 1,
    answers: [{ id: "s1", isCorrect: false }, { id: "s2", isCorrect: false }],
  };
  check("SINGLE with no correct answer: every selection fails", !gradeQuestion(zeroSingle, ["s1"]));
  check("SINGLE with no correct answer: no selection also fails", !gradeQuestion(zeroSingle, []));
}

// ── computeScorePct + passThreshold ──────────────────────────

console.log("computeScorePct");
{
  eq("all correct is 100", computeScorePct([{ points: 1, isCorrect: true }, { points: 1, isCorrect: true }]), 100);
  eq("none correct is 0", computeScorePct([{ points: 1, isCorrect: false }, { points: 3, isCorrect: false }]), 0);
  // Weighted by points, not question count.
  eq("scoring is weighted by points", computeScorePct([{ points: 3, isCorrect: true }, { points: 1, isCorrect: false }]), 75);
  eq("thirds round to two decimals", computeScorePct([
    { points: 1, isCorrect: true }, { points: 1, isCorrect: false }, { points: 1, isCorrect: false },
  ]), 33.33);
  eq("a zero-point quiz scores 0 rather than NaN", computeScorePct([{ points: 0, isCorrect: true }]), 0);
  eq("an empty quiz scores 0", computeScorePct([]), 0);

  // The default 80 threshold, applied the way submitQuiz applies it.
  const DEFAULT = 80;
  check("75% fails the default 80 threshold", computeScorePct([
    { points: 3, isCorrect: true }, { points: 1, isCorrect: false },
  ]) < DEFAULT);
  check("exactly 80% passes (>=, not >)", computeScorePct([
    { points: 4, isCorrect: true }, { points: 1, isCorrect: false },
  ]) >= DEFAULT);
}

// ── Video completion gate ────────────────────────────────────
//
// Mirrors the branch in completeSection: a configured video with an unrecorded
// duration must REFUSE, not fall through. When durationSec was never persisted
// the old check silently evaluated to "allowed", so POSTing to /complete
// finished a video section without watching any of it.

console.log("video completion gate");
function videoCompletionGate(
  config: { youtubeId?: unknown; durationSec?: unknown },
  maxWatchedSec: number
): "ok" | "unwatched" | "unknown-duration" {
  const duration = Number(config.durationSec);
  const hasVideo = typeof config.youtubeId === "string" && config.youtubeId.length > 0;
  if (!hasVideo) return "ok";
  if (!Number.isFinite(duration) || duration <= 0) return "unknown-duration";
  return maxWatchedSec < duration - 2 ? "unwatched" : "ok";
}
{
  eq(
    "a configured video with no recorded duration refuses",
    videoCompletionGate({ youtubeId: "dQw4w9WgXcQ" }, 0),
    "unknown-duration"
  );
  eq(
    "...and still refuses even with a large claimed watch mark",
    videoCompletionGate({ youtubeId: "dQw4w9WgXcQ" }, 99999),
    "unknown-duration"
  );
  eq(
    "a partially watched video refuses",
    videoCompletionGate({ youtubeId: "dQw4w9WgXcQ", durationSec: 600 }, 120),
    "unwatched"
  );
  eq(
    "reaching the end (within the 2 s slack) passes",
    videoCompletionGate({ youtubeId: "dQw4w9WgXcQ", durationSec: 600 }, 598),
    "ok"
  );
  eq(
    "one second short of the slack still refuses",
    videoCompletionGate({ youtubeId: "dQw4w9WgXcQ", durationSec: 600 }, 597),
    "unwatched"
  );
  // A VIDEO section with no video is just a page — nothing to watch, nothing to
  // gate on, and refusing would strand the learner.
  eq("a section with no video configured passes", videoCompletionGate({}, 0), "ok");
  eq(
    "an empty youtubeId counts as no video",
    videoCompletionGate({ youtubeId: "", durationSec: 600 }, 0),
    "ok"
  );
}

// ── Result ───────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
