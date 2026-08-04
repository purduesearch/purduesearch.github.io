import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type TourAdvance =
  | { on: "next" }
  | { on: "click" }
  | { on: "route"; match: string }
  | { on: "api"; method: string; path: string };

export type TourStep = {
  id: string;
  anchor: string;
  route?: string;
  title: string;
  body: string;
  placement?: "top" | "right" | "bottom" | "left" | "center";
  advance: TourAdvance;
  dim?: string[];
  optional?: boolean;
};

export type TourConfig = {
  tourId: string;
  entryRoute: string;
  requiresTrainingProject: boolean;
  requiresAdmin?: boolean;
  stepCount: number;
};

/**
 * Monotonic, bounded by the tour length, and nothing more.
 *
 * There is deliberately no wall-clock rule. Moving through a tour quickly is
 * moving through it quickly; a time gate would punish that and stop no one.
 */
export function clampStepIndex(opts: {
  prevMaxIndex: number; stepIndex: number; stepCount: number;
}): number {
  const { prevMaxIndex, stepIndex, stepCount } = opts;
  if (stepCount <= 0) return 0;
  const bounded = Math.min(Math.max(stepIndex, 0), stepCount - 1);
  return Math.max(prevMaxIndex, bounded);
}

export function isTourComplete(opts: { maxStepIndex: number; stepCount: number }): boolean {
  if (opts.stepCount <= 0) return false;
  return opts.maxStepIndex >= opts.stepCount - 1;
}

// docs/ lives in the repo working tree, not in a deployed dist. Resolving from
// import.meta.url keeps that explicit: step files are repo content, and a
// deployed backend that cannot see them will fail loudly here rather than
// serving a tour with no steps.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const COURSES_DIR = path.join(REPO_ROOT, "docs", "courses");

const cache = new Map<string, TourStep[]>();

export function loadTourSteps(tourId: string): TourStep[] {
  const cached = cache.get(tourId);
  if (cached) return cached;

  const matches: string[] = [];
  for (const course of fs.readdirSync(COURSES_DIR, { withFileTypes: true })) {
    if (!course.isDirectory()) continue;
    const p = path.join(COURSES_DIR, course.name, "walkthroughs", `${tourId}.steps.json`);
    if (fs.existsSync(p)) matches.push(p);
  }
  if (matches.length === 0) throw new Error(`tour "${tourId}" has no steps file`);
  if (matches.length > 1) throw new Error(`tour "${tourId}" is defined in ${matches.length} courses`);

  const doc = JSON.parse(fs.readFileSync(matches[0]!, "utf8"));
  const steps = validateSteps(doc.steps, matches[0]!);
  cache.set(tourId, steps);
  return steps;
}

function validateSteps(steps: unknown, file: string): TourStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`${file}: "steps" must be a non-empty array`);
  }
  const seen = new Set<string>();
  return steps.map((s, i) => {
    const where = `${file} step ${i}`;
    if (!s?.id || typeof s.id !== "string") throw new Error(`${where}: missing "id"`);
    if (seen.has(s.id)) throw new Error(`${where}: duplicate id "${s.id}"`);
    seen.add(s.id);
    if (!s.anchor) throw new Error(`${where} (${s.id}): missing "anchor"`);
    if (!s.title || !s.body) throw new Error(`${where} (${s.id}): needs both title and body`);
    const on = s.advance?.on;
    if (!["next", "click", "route", "api"].includes(on)) {
      throw new Error(`${where} (${s.id}): advance.on must be next|click|route|api`);
    }
    if (on === "route" && !s.advance.match) throw new Error(`${where} (${s.id}): route advance needs "match"`);
    if (on === "api" && (!s.advance.method || !s.advance.path)) {
      throw new Error(`${where} (${s.id}): api advance needs "method" and "path"`);
    }
    return s as TourStep;
  });
}
