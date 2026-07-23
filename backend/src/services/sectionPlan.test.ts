// Pure-logic tests for sectionPlan. No DB / no network required.
// Run: cd backend && npx tsx src/services/sectionPlan.test.ts
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).

import {
  validateSectionPlan, buildDocFromPlan, planToMarkdown,
  type SectionPlan, type PlanData,
} from "./sectionPlan.js";
import type { PMNode } from "./blogRender.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

// Find every node of a given type anywhere in a subtree.
function findAll(node: { content?: PMNode[] } | PMNode, type: string): PMNode[] {
  const hits: PMNode[] = [];
  const walk = (n: PMNode) => {
    if (n.type === type) hits.push(n);
    for (const c of n.content ?? []) walk(c);
  };
  for (const c of (node as { content?: PMNode[] }).content ?? []) walk(c);
  return hits;
}

// validateSectionPlan: drops unknown types, clamps fields, accepts array root
{
  const plan = validateSectionPlan({
    sections: [
      { type: "hero", heading: "Hi", subheading: "sub", align: "left", overlay: true },
      { type: "bogus", heading: "nope" },
      { type: "cta", label: "Go", href: "https://x/y", style: "weird" },
      { type: "columns", columns: [{ markdown: "a" }, { markdown: "b" }, { markdown: "c" }, { markdown: "d" }] },
    ],
  });
  check("drops unknown section type", plan.sections.length === 3);
  check("keeps hero attrs", plan.sections[0].type === "hero" && plan.sections[0].align === "left" && plan.sections[0].overlay === true);
  check("invalid cta style dropped", plan.sections[1].style === undefined);
  check("columns clamped to 3", (plan.sections[2].columns?.length ?? 0) === 3);

  const fromArray = validateSectionPlan([{ type: "richText", markdown: "x" }]);
  check("accepts bare-array root", fromArray.sections.length === 1 && fromArray.sections[0].type === "richText");

  check("garbage → empty plan", validateSectionPlan(null).sections.length === 0);
}

// buildDocFromPlan: prose sections
{
  const plan: SectionPlan = { sections: [
    { type: "hero", heading: "Title", subheading: "Tag" },
    { type: "richText", heading: "About", markdown: "This is **bold** copy." },
    { type: "columns", heading: "Two up", columns: [{ markdown: "Left col" }, { markdown: "Right col" }] },
    { type: "quote", text: "A memorable line.", attribution: "Someone" },
    { type: "cta", label: "Get involved", href: "https://join", style: "outline" },
  ] };
  const doc = buildDocFromPlan(plan);

  check("all top-level nodes are sections", (doc.content ?? []).every((n) => n.type === "section"));
  check("hero node emitted", findAll(doc, "hero").length === 1);
  check("hero heading carried", findAll(doc, "hero")[0].attrs?.heading === "Title");
  check("richText heading rendered as h2", findAll(doc, "heading").some((n) => n.attrs?.level === 2));
  const cols2 = (doc.content ?? []).find((n) => n.attrs?.layout === "cols2");
  check("columns → cols2 layout", !!cols2);
  check("cols2 has two column nodes", findAll(cols2 ?? { type: "x" }, "column").length === 2);
  check("columns heading became its own band", (doc.content ?? []).some((n) => n.attrs?.layout === "single" && findAll(n, "heading").length === 1));
  check("quote → blockquote", findAll(doc, "blockquote").length === 1);
  check("cta → ctaButton with style", findAll(doc, "ctaButton")[0]?.attrs?.style === "outline");
}

// buildDocFromPlan: single-column fallback + empty guards
{
  const single = buildDocFromPlan({ sections: [{ type: "columns", columns: [{ markdown: "only one" }] }] });
  check("one-column columns → single section", (single.content ?? [])[0]?.attrs?.layout === "single");

  const emptyHero = buildDocFromPlan({ sections: [{ type: "hero" }] });
  check("empty hero dropped → paragraph fallback", (emptyHero.content ?? [])[0]?.type === "paragraph");
}

// buildDocFromPlan: placeholder data sections
{
  const data: PlanData = {
    stats: [{ label: "TEAM", value: "8" }, { label: "HOURS", value: "1240" }],
    timeline: [{ title: "Kickoff", date: "January 1, 2026" }, { title: "Demo", date: null }],
    team: [{ displayName: "Ada", title: "Lead Eng", isLead: true }, { displayName: "Grace", title: null, isLead: false }],
    contributors: [{ displayName: "Ada", tasksDone: 12, hours: 40 }],
    links: [{ label: "GitHub", url: "https://github.com/x" }],
  };
  const plan: SectionPlan = { sections: [
    { type: "stats", heading: "By the numbers" },
    { type: "timeline" },
    { type: "team" },
    { type: "links" },
  ] };
  const doc = buildDocFromPlan(plan, data);

  const band = findAll(doc, "statBand")[0];
  check("stats → statBand with data values", (band?.attrs?.stats as unknown[])?.length === 2);
  const json = JSON.stringify(doc);
  check("timeline renders real date", json.includes("January 1, 2026"));
  check("team renders lead marker", json.includes("Ada") && json.includes("(Lead)"));
  check("contributors sub-list rendered", json.includes("Top contributors"));
  check("links render label", json.includes("GitHub"));
}

// Placeholder with absent data renders nothing (config-gating behavior)
{
  const doc = buildDocFromPlan({ sections: [{ type: "stats" }, { type: "team" }] }, {});
  check("placeholders with no data → paragraph fallback only", (doc.content ?? []).length === 1 && (doc.content ?? [])[0]?.type === "paragraph");
}

// planToMarkdown: authored prose flattens; data placeholders omitted
{
  const md = planToMarkdown({ sections: [
    { type: "hero", heading: "T", subheading: "S" },
    { type: "richText", heading: "About", markdown: "Body." },
    { type: "stats" },
    { type: "cta", label: "Join", href: "https://j" },
  ] });
  check("markdown has hero H1", md.includes("# T"));
  check("markdown has richText H2 + body", md.includes("## About") && md.includes("Body."));
  check("markdown has cta link", md.includes("[Join](https://j)"));
  check("markdown omits data placeholder", !md.toLowerCase().includes("stat"));
}

console.log(`\nsectionPlan.test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
