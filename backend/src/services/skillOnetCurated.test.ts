// Local, deterministic taxonomy/O*NET referential checks. No DB or network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { normalizeExample, normalizeText, type OnetSubset } from "./onetCsvCore.js";
import { buildAliasIndex, resolveSkillName } from "./skillMatchCore.js";
import { CURATED_LINKS } from "./skillOnetCurated.js";
import { SEED_SKILLS } from "./skillSeedData.js";

let passed = 0;
function check(name: string, condition: boolean) {
  assert.ok(condition, name);
  passed++;
}

const subset: OnetSubset = JSON.parse(gunzipSync(readFileSync(
  new URL("../../data/onet/31.0/onet-subset.json.gz", import.meta.url),
)).toString("utf8"));
const slugs = new Set(SEED_SKILLS.map(s => s.slug));
const software = new Set(subset.sw.map(row => normalizeExample(row[1])));
const elements = new Set(subset.el.map(row => row[0]));
const dwas = new Set(subset.dwa.map(row => row[2]));
const tuples = new Set<string>();

check("review uses O*NET 31.0", subset.meta.version === "31.0");
for (const link of CURATED_LINKS) {
  const key = JSON.stringify([link.slug, link.kind, link.ref]);
  check(`seed slug exists: ${key}`, slugs.has(link.slug));
  check(`no duplicate tuple: ${key}`, !tuples.has(key));
  tuples.add(key);
  check(`valid relation: ${key}`, ["EXACT", "BROADER", "RELATED"].includes(link.relation));
  if (link.kind === "SOFTWARE") {
    check(`software ref is normalized: ${key}`, normalizeText(link.ref) === link.ref);
    check(`software ref exists: ${key}`, software.has(link.ref));
  } else if (link.kind === "ELEMENT") {
    check(`element ref exists: ${key}`, elements.has(link.ref));
  } else {
    check(`actual DWA ref exists: ${key}`, link.kind === "DWA" && dwas.has(link.ref));
  }
}

const index = buildAliasIndex(SEED_SKILLS.map(s => ({ id: s.slug, name: s.name, aliases: s.aliases })));
check("seed aliases remain unambiguous", index.collisions.length === 0);
for (const name of [
  "AI-assisted Engineering", "LLM Tools", "Prompt Design", "Machine Learning",
  "PyTorch", "scikit-learn", "Data Analysis", "pandas", "SQL", "Cybersecurity Fundamentals",
  "Cloud Basics", "AWS", "C", "C++", "Simulink", "CATIA", "Creo", "AutoCAD",
  "Mentorship", "Cross-functional Collaboration", "Instructing", "Technical Writing",
  "Public Speaking", "Project Scheduling", "Jira", "MS Project",
]) {
  check(`requested starter concept resolves: ${name}`, resolveSkillName(name, index) !== null);
}
check("C retains its identity", resolveSkillName("C", index) === "c-language");
check("C++ retains its identity", resolveSkillName("C++", index) === "cpp");
check("Simulink retains existing MATLAB alias", resolveSkillName("Simulink", index) === "matlab");
check("Data Analysis retains existing Data Science alias", resolveSkillName("Data Analysis", index) === "data-science");
check("C family software collision is real", normalizeExample("C") === normalizeExample("C++")
  && normalizeExample("C++") === normalizeExample("C#"));
check("ambiguous C family software identity is never curated", CURATED_LINKS.every(link =>
  link.kind !== "SOFTWARE" || link.ref !== normalizeExample("C")));
for (const slug of ["c-language", "cpp"]) {
  check(`${slug} has broader Programming link`, CURATED_LINKS.some(link =>
    link.slug === slug && link.kind === "ELEMENT" && link.ref === "2.B.3.e" && link.relation === "BROADER"));
}
check("Simulink product relation is not falsely exact", CURATED_LINKS.some(link =>
  link.slug === "matlab" && link.kind === "SOFTWARE" && link.ref === normalizeExample("MathWorks Simulink")
  && link.relation === "RELATED"));
for (const slug of ["pytorch", "scikit-learn", "pandas", "chatgpt", "aws", "autocad", "creo", "jira", "ms-project"]) {
  const skill = SEED_SKILLS.find(s => s.slug === slug)!;
  check(`new tool has source, aliases and parent: ${slug}`, skill.type === "TOOL" && skill.source === "ONET"
    && skill.aliases.length > 0 && skill.parents.length > 0);
  check(`new tool has reviewed software link: ${slug}`, CURATED_LINKS.some(link => link.slug === slug && link.kind === "SOFTWARE"));
}

console.log(`skillOnetCurated: ${passed} passed, 0 failed (${CURATED_LINKS.length} reviewed links)`);
