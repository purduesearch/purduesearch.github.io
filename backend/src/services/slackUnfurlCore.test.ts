// Run: cd backend && npx tsx src/services/slackUnfurlCore.test.ts
import assert from "node:assert/strict";
import { parseConstellationUrl } from "./slackUnfurlCore.js";

let passed = 0, failed = 0;
function check(name: string, run: () => void) {
  try { run(); passed++; }
  catch (error) { failed++; console.error(`  ✗ ${name}`, error); }
}
const origin = "https://purduesearch.org";
const parse = (path: string) => parseConstellationUrl(`${origin}${path}`, []);

check("project", () => assert.deepEqual(parse("/clubpm/projects/p1"), {
  type: "PROJECT", id: "p1", projectId: "p1",
}));
check("task", () => assert.deepEqual(parse("/clubpm/projects/p1?task=t1"), {
  type: "TASK", id: "t1", projectId: "p1",
}));
check("vault item with version", () => assert.deepEqual(parse("/clubpm/projects/p1?tab=files&sub=vault&vaultItem=i1&vaultVersion=v1"), {
  type: "VAULT_ITEM", id: "i1", projectId: "p1",
}));
check("change request", () => assert.deepEqual(parse("/clubpm/projects/p1?tab=files&sub=vault&vaultCr=cr1"), {
  type: "CHANGE_REQUEST", id: "cr1", projectId: "p1",
}));
check("event", () => assert.deepEqual(parse("/clubpm/calendar?event=e1"), {
  type: "EVENT", id: "e1",
}));
check("poll has no frontend deep link", () => assert.equal(parse("/clubpm/calendar?poll=poll1"), null));
check("calendar without entity", () => assert.equal(parse("/clubpm/calendar"), null));
check("project tab without entity", () => assert.deepEqual(parse("/clubpm/projects/p1?tab=milestones"), {
  type: "PROJECT", id: "p1", projectId: "p1",
}));
check("foreign host", () => assert.equal(parseConstellationUrl("https://example.org/clubpm/projects/p1?task=t1", []), null));
check("malformed URL", () => assert.equal(parseConstellationUrl("not a URL", []), null));
check("configured frontend origin", () => assert.deepEqual(parseConstellationUrl("http://localhost:3000/clubpm/projects/p1?task=t1", ["http://localhost:3000"]), {
  type: "TASK", id: "t1", projectId: "p1",
}));
check("configured origin normalization", () => assert.deepEqual(parseConstellationUrl("https://preview.example/clubpm/calendar?event=e1", ["invalid", "https://preview.example/"]), {
  type: "EVENT", id: "e1",
}));
check("different port is not same origin", () => assert.equal(parseConstellationUrl("http://localhost:3001/clubpm/projects/p1", ["http://localhost:3000"]), null));
check("host suffix spoof", () => assert.equal(parseConstellationUrl("https://purduesearch.org.example/clubpm/projects/p1", []), null));
check("credentials rejected", () => assert.equal(parseConstellationUrl("https://user@purduesearch.org/clubpm/projects/p1", []), null));
check("non-web protocol rejected", () => assert.equal(parseConstellationUrl("ftp://purduesearch.org/clubpm/projects/p1", ["ftp://purduesearch.org"]), null));
check("unrelated route", () => assert.equal(parse("/about?task=t1"), null));
check("project nested route", () => assert.equal(parse("/clubpm/projects/p1/unrelated?task=t1"), null));
check("encoded project and task identifiers", () => assert.deepEqual(parse("/clubpm/projects/project%2D1/?task=task%2D1#details"), {
  type: "TASK", id: "task-1", projectId: "project-1",
}));
check("malformed project escaping", () => assert.equal(parse("/clubpm/projects/%ZZ"), null));
check("encoded path separator", () => assert.equal(parse("/clubpm/projects/p1%2Fp2"), null));
check("empty event id", () => assert.equal(parse("/clubpm/calendar?event="), null));
check("whitespace event id", () => assert.equal(parse("/clubpm/calendar?event=%20"), null));
check("CR takes precedence over item on vault links", () => assert.deepEqual(parse("/clubpm/projects/p1?vaultCr=cr1&vaultItem=i1"), {
  type: "CHANGE_REQUEST", id: "cr1", projectId: "p1",
}));

console.log(`\nslackUnfurlCore: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
