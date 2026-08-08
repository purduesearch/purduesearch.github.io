/**
 * Guard for the duplication in `src/services/courseMarkdown.ts`.
 *
 * That module is a hand-port of the editor's
 * `src/components/clubpm/blog/blogMarkdown.js`, which the backend cannot import
 * — the repo root package.json has no `"type": "module"`, so Node reads its
 * `export` statements as CommonJS syntax errors. Two copies of a parser is a
 * divergence waiting to happen, so this script loads the frontend file as text,
 * evaluates it in a sandbox, and asserts both produce identical output for every
 * real course article in `docs/courses`.
 *
 * It also checks the thing that actually broke: that each CONTENT body converts
 * to a genuine TipTap document, since a payload TipTap can't render is exactly
 * how every CONTENT section came to display blank.
 *
 * No database, no network. Run: cd backend && npm run check:courses
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { markdownToDoc, stripAuthoringHeader, courseBodyToDoc } from "../src/services/courseMarkdown.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FRONTEND_CONVERTER = path.join(REPO_ROOT, "src/components/clubpm/blog/blogMarkdown.js");
const COURSES = path.join(REPO_ROOT, "docs", "courses");

const failures: string[] = [];
let checks = 0;

function check(label: string, fn: () => void) {
  checks += 1;
  try {
    fn();
  } catch (err) {
    failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Evaluate the frontend ESM module and hand back its markdownToDoc. */
function loadFrontendConverter(): (md: string) => unknown {
  const source = fs.readFileSync(FRONTEND_CONVERTER, "utf8").replace(/\bexport\s+/g, "");
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(`${source}\nthis.__markdownToDoc = markdownToDoc;`, sandbox);
  const fn = sandbox.__markdownToDoc;
  if (typeof fn !== "function") {
    throw new Error(`could not extract markdownToDoc from ${FRONTEND_CONVERTER}`);
  }
  return fn as (md: string) => unknown;
}

/** Refs a course.json points at that nobody has written yet. */
const pending: string[] = [];

/**
 * Every CONTENT body referenced by a course.json, as [label, markdown].
 *
 * A ref with no file behind it is recorded as pending rather than thrown on. A
 * course is scaffolded before it is written — `ares-101`'s course.json lands
 * with all 52 sections so eleven independently-written modules cannot drift on
 * section order or asset numbering, which means its bodyRefs necessarily dangle
 * until each module task fills one in. Crashing here would make this script
 * unrunnable for the whole time the course is being authored, and every module
 * task in the plan is supposed to run it.
 */
function courseBodies(): [string, string][] {
  const out: [string, string][] = [];
  for (const entry of fs.readdirSync(COURSES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(COURSES, entry.name);
    const courseFile = path.join(dir, "course.json");
    if (!fs.existsSync(courseFile)) continue;
    const doc = JSON.parse(fs.readFileSync(courseFile, "utf8"));
    for (const mod of doc.modules) {
      for (const section of mod.sections) {
        if (section.kind !== "CONTENT" || !section.bodyRef) continue;
        const label = `${doc.slug}/${section.bodyRef}`;
        const file = path.join(dir, section.bodyRef);
        if (!fs.existsSync(file)) {
          pending.push(label);
          continue;
        }
        out.push([label, fs.readFileSync(file, "utf8")]);
      }
    }
  }
  return out;
}

const bodies = courseBodies();

// A refactor that moves docs/courses would otherwise make this whole run pass
// vacuously, reporting success while checking nothing.
check("finds course articles", () => {
  assert.ok(bodies.length >= 11, `expected >= 11 CONTENT bodies, found ${bodies.length}`);
});

const frontend = loadFrontendConverter();

for (const [label, markdown] of bodies) {
  const body = stripAuthoringHeader(markdown);

  check(`${label} matches the frontend converter`, () => {
    // Serialized comparison, not deepEqual: the frontend converter runs inside
    // a vm realm, so its objects have a different Object.prototype and
    // assert/strict rejects them as unequal even when structurally identical.
    // JSON is also the precise claim — this value is stored as JSON.
    assert.equal(JSON.stringify(markdownToDoc(body)), JSON.stringify(frontend(body)));
  });

  check(`${label} converts to a TipTap doc`, () => {
    const doc = courseBodyToDoc(markdown);
    assert.equal(doc.type, "doc");
    assert.ok(doc.content.length > 5, `only ${doc.content.length} top-level nodes`);
    assert.ok(!("markdownSource" in doc), "still carrying raw markdown");
  });

  check(`${label} drops its authoring header`, () => {
    assert.ok(!/^#\s+C\d\d\s+—/.test(body), "authoring H1 survived the strip");
  });
}

check("stripAuthoringHeader removes H1 + metadata + rule", () => {
  const md = [
    "# C02 — The task, field by field",
    "",
    "> CONTENT section · Constellation 101 · M2 · ~3 min read",
    "> Reference companion to V02.",
    "",
    "---",
    "",
    "You just watched a task get taken apart.",
  ].join("\n");
  assert.equal(stripAuthoringHeader(md), "You just watched a task get taken apart.");
});

check("stripAuthoringHeader leaves an ordinary body alone", () => {
  const md = "## Welcome\n\nSome prose.";
  assert.equal(stripAuthoringHeader(md), md);
});

check("stripAuthoringHeader leaves an H1 with no closing rule alone", () => {
  const md = "# A real title\n\nSome prose.";
  assert.equal(stripAuthoringHeader(md), md);
});

check("tables become tableHeader / tableCell rows", () => {
  const doc = markdownToDoc("| Field | Use |\n|---|---|\n| Title | The outcome |");
  const table = doc.content[0];
  assert.equal(table?.type, "table");
  assert.equal(table?.content?.[0]?.content?.[0]?.type, "tableHeader");
  assert.equal(table?.content?.[1]?.content?.[0]?.type, "tableCell");
});

check("checkbox lists become a taskList", () => {
  const doc = markdownToDoc("- [ ] Read it once more\n- [x] Check the slug");
  assert.equal(doc.content[0]?.type, "taskList");
  assert.equal(doc.content[0]?.content?.[0]?.attrs?.checked, false);
  assert.equal(doc.content[0]?.content?.[1]?.attrs?.checked, true);
});

check("bold and inline code are marked", () => {
  const doc = markdownToDoc("A **bold** word and `some code`.");
  const marks = (doc.content[0]?.content ?? []).flatMap((n) => (n.marks ?? []).map((m) => m.type));
  assert.ok(marks.includes("bold"), "no bold mark");
  assert.ok(marks.includes("code"), "no code mark");
});

if (failures.length) {
  console.error(`check-course-markdown: ${failures.length} of ${checks} checks FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    "\nIf the converter comparison failed, courseMarkdown.ts and blogMarkdown.js have drifted.\n" +
      "Fix both — the seed and the editor must agree on what a course body becomes."
  );
  process.exit(1);
}

// Named, not silent. An unwritten article and a mistyped bodyRef look identical
// from here, so the only safe thing is to print every one of them.
if (pending.length) {
  console.log(`check-course-markdown: ${pending.length} bodyRef(s) not written yet`);
  for (const p of pending) console.log(`  · ${p}`);
  console.log("");
}

console.log(
  `check-course-markdown: OK — ${checks} checks, ${bodies.length} course articles, ` +
    `identical to the editor's converter`
);
