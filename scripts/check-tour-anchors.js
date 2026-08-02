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

// 2. Anchors actually rendered by components.
const rendered = new Map(); // id -> [files]
for (const file of walk(SRC, (p) => /\.jsx?$/.test(p))) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/data-tour-id=["'{]{1,2}\s*["']?([A-Za-z0-9._]+)["']?/g)) {
    const rel = path.relative(ROOT, file);
    rendered.set(m[1], [...(rendered.get(m[1]) ?? []), rel]);
  }
}

// 3. Anchors referenced by step files.
const used = new Map(); // id -> [tourId:stepId]
for (const file of walk(COURSES, (p) => p.endsWith(".steps.json"))) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const step of doc.steps) {
    const where = `${doc.tourId}:${step.id}`;
    for (const id of [step.anchor, ...(step.dim ?? [])]) {
      used.set(id, [...(used.get(id) ?? []), where]);
    }
  }
}

const errors = [];
for (const [id, where] of used) {
  if (!declared.has(id)) {
    errors.push(`step "${where[0]}" targets "${id}", which is not in tourAnchors.js`);
  }
}
for (const [id, files] of rendered) {
  if (!declared.has(id)) {
    errors.push(`${files[0]} renders data-tour-id="${id}", which is not in tourAnchors.js`);
  }
  if (files.length > 1) {
    errors.push(`"${id}" is rendered by ${files.length} components (${files.join(", ")}) — ids must be unique`);
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
