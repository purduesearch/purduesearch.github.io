// Shared "course plan" schema for AI course generation.
//
// The model never emits Prisma rows or TipTap JSON. It emits a CoursePlan — an
// ordered tree of modules and typed section stubs, each carrying a `brief` that
// is the ONLY thing stage 2's per-section call sees. courseGenService maps every
// entry into real rows through courseService, so output is always schema-valid
// and the ordering/default rules are the same ones the editor uses.
//
// The caps here are the cost ceiling: the outline is what stands between a
// careless prompt and forty model calls.

export type PlanSectionKind = "CONTENT" | "VIDEO" | "QUIZ" | "SLIDES";

export interface PlanCourseSection {
  kind: PlanSectionKind;
  title: string;
  /** What this section must cover. Stage 2's per-section prompt is built from it. */
  brief: string;
  isRequired?: boolean;
  questionCount?: number;  // QUIZ
  passThreshold?: number;  // QUIZ
  slideCount?: number;     // SLIDES
}

export interface PlanCourseModule {
  title: string;
  summary?: string;
  estimatedMinutes?: number;
  isRequired?: boolean;
  sequential?: boolean;
  sections: PlanCourseSection[];
}

export interface CoursePlan {
  title: string;
  summary?: string;
  modules: PlanCourseModule[];
}

export const MAX_MODULES = 8;
export const MAX_SECTIONS_PER_MODULE = 10;
export const MAX_TOTAL_SECTIONS = 50;

const KINDS: readonly PlanSectionKind[] = ["CONTENT", "VIDEO", "QUIZ", "SLIDES"];

function clampStr(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function validateSection(raw: unknown): PlanCourseSection | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!KINDS.includes(o.kind as PlanSectionKind)) return null;
  const title = clampStr(o.title, 200);
  if (!title) return null;

  const sec: PlanCourseSection = {
    kind: o.kind as PlanSectionKind,
    title,
    brief: clampStr(o.brief, 2000) ?? title,
  };
  if (typeof o.isRequired === "boolean") sec.isRequired = o.isRequired;

  if (sec.kind === "QUIZ") {
    sec.questionCount = clampInt(o.questionCount, 1, 20) ?? 5;
    sec.passThreshold = clampInt(o.passThreshold, 0, 100) ?? 80;
  }
  if (sec.kind === "SLIDES") {
    sec.slideCount = clampInt(o.slideCount, 1, 60) ?? 10;
  }
  return sec;
}

/**
 * Coerce arbitrary model JSON into a safe CoursePlan. Drops unknown kinds and
 * untitled entries, clamps every count, and enforces the module/section caps —
 * including the running total, so eight full modules cannot exceed the ceiling.
 *
 * Never throws. Garbage in yields an empty plan, which the caller reports as a
 * failed outline rather than a crash.
 */
export function validateCoursePlan(raw: unknown): CoursePlan {
  const root = (raw ?? {}) as Record<string, unknown>;
  const rawModules: unknown[] = Array.isArray(root.modules) ? root.modules : [];

  const modules: PlanCourseModule[] = [];
  let total = 0;

  for (const item of rawModules.slice(0, MAX_MODULES)) {
    const o = (item ?? {}) as Record<string, unknown>;
    const title = clampStr(o.title, 200);
    if (!title) continue;

    const mod: PlanCourseModule = { title, sections: [] };
    const summary = clampStr(o.summary, 500);
    if (summary) mod.summary = summary;
    const minutes = clampInt(o.estimatedMinutes, 0, 600);
    if (minutes !== undefined) mod.estimatedMinutes = minutes;
    if (typeof o.isRequired === "boolean") mod.isRequired = o.isRequired;
    if (typeof o.sequential === "boolean") mod.sequential = o.sequential;

    const rawSections: unknown[] = Array.isArray(o.sections) ? o.sections : [];
    for (const s of rawSections.slice(0, MAX_SECTIONS_PER_MODULE)) {
      if (total >= MAX_TOTAL_SECTIONS) break;
      const parsed = validateSection(s);
      if (!parsed) continue;
      mod.sections.push(parsed);
      total += 1;
    }

    // An empty module is KEPT — the author may be planning to fill it by hand,
    // and the modules gate treats it as never-blocking, which is safe.
    modules.push(mod);
  }

  return {
    title: clampStr(root.title, 200) ?? "Untitled course",
    ...(clampStr(root.summary, 500) ? { summary: clampStr(root.summary, 500)! } : {}),
    modules,
  };
}

/** How many sections stage 2 will actually write — the call-count estimate. */
export function planSectionCount(plan: CoursePlan): number {
  return plan.modules.reduce((n, m) => n + m.sections.length, 0);
}
