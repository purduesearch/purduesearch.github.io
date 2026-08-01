// Pure-logic tests for coursePlan. No DB / no network required.
// Run: cd backend && npx tsx src/services/coursePlan.test.ts
import {
  validateCoursePlan, planSectionCount,
  MAX_MODULES, MAX_SECTIONS_PER_MODULE, MAX_TOTAL_SECTIONS,
} from "./coursePlan.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

const mod = (title: string, sections: unknown[]) => ({ title, sections });
const sec = (kind: string, title = "S", brief = "b") => ({ kind, title, brief });

console.log("validateCoursePlan — shape");
{
  const plan = validateCoursePlan({
    title: "Orbital Mechanics",
    summary: "A primer",
    modules: [mod("Basics", [sec("CONTENT"), sec("QUIZ")])],
  });
  eq("keeps the title", plan.title, "Orbital Mechanics");
  eq("keeps the summary", plan.summary, "A primer");
  eq("keeps one module", plan.modules.length, 1);
  eq("keeps both sections", plan.modules[0]!.sections.length, 2);
  eq("keeps the kinds", plan.modules[0]!.sections.map((s) => s.kind), ["CONTENT", "QUIZ"]);
}

console.log("validateCoursePlan — rejection and clamping");
{
  const plan = validateCoursePlan({
    title: "T",
    modules: [mod("M", [sec("CONTENT"), sec("PODCAST"), sec("SLIDES"), { title: "no kind" }])],
  });
  eq("drops unknown kinds and kindless entries",
    plan.modules[0]!.sections.map((s) => s.kind), ["CONTENT", "SLIDES"]);

  const many = validateCoursePlan({
    title: "T",
    modules: Array.from({ length: 20 }, (_, i) => mod(`M${i}`, [sec("CONTENT")])),
  });
  eq("clamps module count", many.modules.length, MAX_MODULES);

  const wide = validateCoursePlan({
    title: "T",
    modules: [mod("M", Array.from({ length: 30 }, () => sec("CONTENT")))],
  });
  eq("clamps sections per module", wide.modules[0]!.sections.length, MAX_SECTIONS_PER_MODULE);

  const huge = validateCoursePlan({
    title: "T",
    modules: Array.from({ length: 8 }, (_, i) =>
      mod(`M${i}`, Array.from({ length: 10 }, () => sec("CONTENT")))),
  });
  check("clamps the total", planSectionCount(huge) <= MAX_TOTAL_SECTIONS);

  eq("garbage becomes an empty plan", validateCoursePlan(null).modules.length, 0);
  eq("a plan with no title still parses", validateCoursePlan({ modules: [] }).title, "Untitled course");
}

console.log("validateCoursePlan — per-kind fields");
{
  const plan = validateCoursePlan({
    title: "T",
    modules: [mod("M", [
      { kind: "QUIZ", title: "Q", brief: "b", questionCount: 900, passThreshold: 400 },
      { kind: "QUIZ", title: "Q2", brief: "b", questionCount: 0, passThreshold: -5 },
      { kind: "SLIDES", title: "S", brief: "b", slideCount: 999 },
    ])],
  });
  const [q1, q2, s] = plan.modules[0]!.sections;
  check("questionCount clamps high", (q1!.questionCount ?? 0) <= 20);
  check("questionCount clamps low", (q2!.questionCount ?? 0) >= 1);
  check("passThreshold clamps to 0-100",
    (q1!.passThreshold ?? 0) <= 100 && (q2!.passThreshold ?? 0) >= 0);
  check("slideCount clamps", (s!.slideCount ?? 0) <= 60);
}

console.log("validateCoursePlan — empty modules survive");
{
  const plan = validateCoursePlan({ title: "T", modules: [mod("Empty", []), mod("Full", [sec("CONTENT")])] });
  eq("an empty module is kept for the author to fill", plan.modules.length, 2);
  eq("planSectionCount counts only real sections", planSectionCount(plan), 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
