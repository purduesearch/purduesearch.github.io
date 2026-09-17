#!/usr/bin/env node
/**
 * Fails the build when the anchor registry, the components, and the tour step
 * files disagree. This script is the entire justification for keeping tour
 * steps in the repo instead of the database: without it, renaming a nav link
 * produces a clean diff and a tour that breaks silently in production.
 *
 * Run: node scripts/check-tour-anchors.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const COURSES = path.join(ROOT, "docs", "courses");

function walk(dir, test, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(p)) out.push(p);
  }
  return out;
}

// 1. Registry — parsed as text so this script needs no ESM loader.
const registrySrc = fs.readFileSync(
  path.join(SRC, "clubpm", "tour", "tourAnchors.js"), "utf8"
);
const declared = new Set(
  [...registrySrc.matchAll(/^\s*"([A-Za-z0-9._]+)":\s*\{/gm)].map((m) => m[1])
);

// Which shell presentation mounts each anchor (contracts.md §7). Absent means
// one owner that renders in both layouts. "both" means a desktop owner and a
// phone owner in mutually exclusive branches — the only case where one id may
// appear as a literal in more than one place. "desktop" / "compact" mean the
// element exists in that layout only.
const LAYOUTS = new Set(["both", "desktop", "compact"]);
const layoutOf = new Map();
// `reveal`: the phone surface ("more" | "projects" | "expand") the element lives in, which a
// compact step must open before the element exists.
const revealOf = new Map();
for (const m of registrySrc.matchAll(/^\s*"([A-Za-z0-9._]+)":\s*\{([^\n]*)$/gm)) {
  const lm = m[2].match(/layout:\s*"([a-z]+)"/);
  if (lm) layoutOf.set(m[1], lm[1]);
  const rm = m[2].match(/reveal:\s*"([a-z]+)"/);
  if (rm) revealOf.set(m[1], rm[1]);
}

// 2. Anchors actually rendered by components.
//
// An attribute value is either a plain string ("nav.shop") or a JSX expression
// container. For the container we take the whole balanced {...} and pull out
// every anchor-shaped string literal inside it, so a conditional
// (`{index === 0 ? "dash.project.card" : undefined}`) or an inline lookup map
// (`{{ TODO: "board.column.TODO", ... }[status]}`) is still statically visible.
// That is the reason components must not build ids with template interpolation:
// `board.column.${status}` renders an anchor no static check can see, which is
// exactly the silent breakage this script exists to prevent.
const ANCHOR_LITERAL = /["']([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)["']/g;

/** The attribute value starting at `i` (just past `data-tour-id=`). */
function attributeValue(src, i) {
  // JSX attributes never have a space before the value, but object properties
  // (`tourId: 'nav.shop'`) usually do.
  while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
  if (src[i] === '"' || src[i] === "'") {
    const end = src.indexOf(src[i], i + 1);
    return end === -1 ? "" : src.slice(i, end + 1);
  }
  if (src[i] !== "{") return "";
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(i, j + 1);
  }
  return "";
}

const rendered = new Map(); // id -> [files]
// Test files are skipped: their fixtures name real ids (to assert each mounts
// once) but render nothing in the app.
for (const file of walk(SRC, (p) => /\.jsx?$/.test(p) && !/\.test\.jsx?$/.test(p))) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  // A `*tourId=` prop counts too: a local presentational component often owns
  // the DOM node, so the id is chosen at the call site and handed down (as
  // `tourId`, `healthTourId`, …). The literal is what matters, not which
  // attribute carries it. `:` as well as `=` because a config array — the
  // sidebar's NAV_ITEMS, say — carries the id as an object property and the
  // JSX below it spreads the value in.
  for (const m of src.matchAll(/(?:data-tour-id|[A-Za-z]*[Tt]ourId)\s*[:=]/g)) {
    const value = attributeValue(src, m.index + m[0].length);
    for (const lit of value.matchAll(ANCHOR_LITERAL)) {
      rendered.set(lit[1], [...(rendered.get(lit[1]) ?? []), rel]);
    }
  }
}

// 3. Anchors referenced by step files — the desktop step and, when present, its
// `compact` override (what the phone shell runs instead).
const used = new Map(); // id -> [tourId:stepId]
const errors = [];
const REVEALS = new Set(["more", "projects", "expand"]);
for (const file of walk(COURSES, (p) => p.endsWith(".steps.json"))) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const step of doc.steps) {
    const where = `${doc.tourId}:${step.id}`;
    const compact = step.compact ?? null;
    const ids = [step.anchor, ...(step.dim ?? [])];
    if (compact) {
      if (compact.anchor) ids.push(compact.anchor);
      ids.push(...(compact.dim ?? []));
      if (compact.reveal !== undefined && !REVEALS.has(compact.reveal)) {
        errors.push(`step "${where}" has compact.reveal "${compact.reveal}" — expected one of ${[...REVEALS].join(", ")}`);
      }
    }
    for (const id of ids) {
      used.set(id, [...(used.get(id) ?? []), where]);
    }

    // Layout coverage: every step must resolve to a mounted element in BOTH
    // shells, or the phone learner hits a degraded step for no reason.
    const desktopLayout = layoutOf.get(step.anchor);
    if (desktopLayout === "compact") {
      errors.push(`step "${where}" targets "${step.anchor}", which only exists in the phone shell — put it under "compact"`);
    }
    const phoneAnchor = compact?.anchor ?? step.anchor;
    const phoneLayout = layoutOf.get(phoneAnchor);
    if (phoneLayout === "desktop") {
      errors.push(
        compact?.anchor
          ? `step "${where}" has compact.anchor "${phoneAnchor}", which only exists in the desktop shell`
          : `step "${where}" targets desktop-only "${phoneAnchor}" with no compact.anchor for the phone shell`
      );
    }
    const needsReveal = revealOf.get(phoneAnchor) ?? null;
    const hasReveal = compact?.reveal ?? null;
    if (needsReveal !== hasReveal) {
      errors.push(
        needsReveal
          ? `step "${where}" targets "${phoneAnchor}", which lives in the phone "${needsReveal}" sheet — add compact.reveal "${needsReveal}"`
          : `step "${where}" has compact.reveal "${hasReveal}", but "${phoneAnchor}" is not inside that sheet`
      );
    }
  }
}

for (const [id, layout] of layoutOf) {
  if (!LAYOUTS.has(layout)) errors.push(`tourAnchors.js gives "${id}" unknown layout "${layout}"`);
}
for (const [id, where] of used) {
  if (!declared.has(id)) {
    errors.push(`step "${where[0]}" targets "${id}", which is not in tourAnchors.js`);
  }
}
for (const [id, files] of rendered) {
  if (!declared.has(id)) {
    errors.push(`${files[0]} renders data-tour-id="${id}", which is not in tourAnchors.js`);
  }
  // Two owners are allowed only for a `layout: "both"` id, whose desktop and
  // phone owners are mutually exclusive branches of AppShell — and even then
  // only one per shell. src/components/clubpm/AppShell.compact.test.jsx checks
  // at runtime that each id is mounted at most once in either layout.
  const limit = layoutOf.get(id) === "both" ? 2 : 1;
  if (files.length > limit) {
    errors.push(`"${id}" is rendered by ${files.length} components (${files.join(", ")}) — ids must be unique` +
      (limit === 2 ? " (one desktop owner and one phone owner at most)" : ""));
  }
}
for (const id of declared) {
  if (!rendered.has(id)) {
    errors.push(`tourAnchors.js declares "${id}", but no component renders it`);
  }
}

if (errors.length) {
  console.error(`\ncheck-tour-anchors: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(
    "\nIf you renamed a UI element, update src/clubpm/tour/tourAnchors.js,\n" +
    "docs/courses/ANCHORS.md, and the step file that targets it — in one commit.\n"
  );
  process.exit(1);
}
console.log(
  `check-tour-anchors: OK — ${declared.size} anchors, ` +
  `${rendered.size} rendered, ${used.size} used by steps`
);
