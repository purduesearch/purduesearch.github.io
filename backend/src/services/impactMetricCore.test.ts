import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACHIEVEMENTS, METRICS, METRIC_VERSION, PUBLIC_FLOOR, publicAggregate,
  renderBullet, shareable, validateMemberTemplate, type ImpactAttestationInput,
} from "./impactMetricCore.js";

const expectedMetrics = [
  ["members_trained", "4.A.4.b.3.d.1", "RECORDS", "Courses I authored were completed by 7 other members."],
  ["courses_authored", "4.A.3.b.6.l.10", "RECORDS", "Authored 7 published courses."],
  ["cad_items_released", "4.A.3.b.2.d.1", "RECORDS", "Contributed uploaded versions to 7 released CAD items using SolidWorks."],
  ["cad_revisions", "4.A.2.b.2.o.18", "RECORDS", "Uploaded 7 Vault versions using SolidWorks."],
  ["drawings_released", "4.A.3.b.6.i.2", "RECORDS", "Contributed uploaded versions to 7 released drawings."],
  ["design_reviews", "4.A.2.a.4.e.3", "RECORDS", "Reviewed or signed off on 7 design change requests."],
  ["prs_merged", "4.A.2.b.2.b.1", "RECORDS", "Authored 7 merged pull requests for ARES and AstroUSA."],
  ["code_reviews", "4.A.2.a.4.e.3", "RECORDS", "Recorded 7 code reviews for ARES and AstroUSA."],
  ["tasks_completed", null, "RECORDS", "Was assigned to 7 completed tasks for ARES and AstroUSA."],
  ["lab_hours", null, "RECORDS", "Recorded 7 confirmed lab hours."],
  ["team_led", "4.A.4.b.4.a.2", "CONFIRMED", "Led a project with 7 other task assignees."],
  ["events_organized", "4.A.4.b.4.j.20", "RECORDS", "Organized 7 past events."],
  ["outreach_attendees", "4.A.4.b.4.j.20", "RECORDS", "Recorded 7 attendances at public events I organized."],
  ["outreach_published", "4.A.3.b.6.p.3", "RECORDS", "Authored 7 published outreach submissions."],
  ["blog_posts_published", "4.A.3.b.6.l.5", "RECORDS", "Authored 7 published blog posts."],
  ["milestones_delivered", "4.A.4.b.4.j.12", "RECORDS", "Owned 7 completed milestones for ARES and AstroUSA."],
] as const;

test("v1 registry has exactly the ordered metrics, DWA identities and proof gates", () => {
  assert.equal(METRIC_VERSION, "impact-v1");
  assert.equal(PUBLIC_FLOOR, 3);
  assert.deepEqual(METRICS.map(m => [m.id, m.dwaId, m.proof]), expectedMetrics.map(row => row.slice(0, 3)));
  for (const metric of METRICS) {
    assert(metric.label && metric.unitSingular && metric.unitPlural);
    assert.equal(new Set(metric.softwareCategories).size, metric.softwareCategories.length);
    assert(metric.softwareCategories.every(id => /^2\.E\.\d+\.[a-z]$/.test(id)));
    assert.equal((metric.bulletTemplate.match(/\{n\}/g) ?? []).length, 1);
  }
});

for (const [index, [id, , , expected]] of expectedMetrics.entries()) {
  test(`${id} renders its factual counted-record bullet`, () => {
    assert.equal(renderBullet(METRICS[index].bulletTemplate, {
      n: 7, tool: "SolidWorks", projects: ["ARES", "AstroUSA", "Software"],
    }), expected);
  });
}

test("achievement identities, thresholds and required proof are derived from metrics", () => {
  assert.deepEqual(ACHIEVEMENTS, [
    { id: "trainer", threshold: 5, metricId: "members_trained", proof: "RECORDS" },
    { id: "cad-release", threshold: 5, metricId: "cad_items_released", proof: "RECORDS" },
    { id: "design-reviewer", threshold: 5, metricId: "design_reviews", proof: "RECORDS" },
    { id: "software-contributor", threshold: 10, metricId: "prs_merged", proof: "RECORDS" },
    { id: "lab-practitioner", threshold: 50, metricId: "lab_hours", proof: "RECORDS" },
    { id: "team-lead", threshold: 3, metricId: "team_led", proof: "CONFIRMED" },
    { id: "outreach-organizer", threshold: 50, metricId: "outreach_attendees", proof: "RECORDS" },
  ]);
});

const confirmation: ImpactAttestationInput = { kind: "CONFIRM", status: "VERIFIED", metricId: "team_led", value: 3 };
const claim: ImpactAttestationInput = { kind: "CLAIM", status: "VERIFIED", value: 25 };

test("records need no attestation; sharing preferences remain the caller's responsibility", () => {
  assert.equal(shareable("RECORDS"), true);
  assert.equal(shareable("RECORDS", { ...claim, status: "DECLINED" }), true);
});

test("confirmed metrics need a verified CONFIRM, never a verified CLAIM", () => {
  assert.equal(shareable("CONFIRMED"), false);
  assert.equal(shareable("CONFIRMED", null), false);
  assert.equal(shareable("CONFIRMED", claim), false);
  assert.equal(shareable("CONFIRMED", confirmation), true);
  assert.equal(shareable("CONFIRMED", { ...confirmation, metricId: null }), false);
  assert.equal(shareable("CONFIRMED", { ...confirmation, metricId: " " }), false);
});

test("claims need verified CLAIM; pending, declined and needs-proof assertions never share", () => {
  assert.equal(shareable("CLAIM"), false);
  assert.equal(shareable("CLAIM", confirmation), false);
  assert.equal(shareable("CLAIM", claim), true);
  for (const status of ["PENDING", "DECLINED", "NEEDS_PROOF"] as const) {
    assert.equal(shareable("CLAIM", { ...claim, status }), false);
    assert.equal(shareable("CONFIRMED", { ...confirmation, status }), false);
  }
});

test("confirmation binding rejects a different metric or a changed value in either direction", () => {
  assert.equal(shareable("CONFIRMED", confirmation, { metricId: "team_led", value: 3 }), true);
  assert.equal(shareable("CONFIRMED", confirmation, { metricId: "other", value: 3 }), false);
  for (const value of [2, 4, NaN, Infinity]) {
    assert.equal(shareable("CONFIRMED", confirmation, { value }), false);
  }
  assert.equal(shareable("CLAIM", claim, { value: 25 }), true);
  assert.equal(shareable("CLAIM", claim, { value: 26 }), false);
  for (const value of [-1, NaN, Infinity, -Infinity]) {
    assert.equal(shareable("CONFIRMED", { ...confirmation, value }), false);
    assert.equal(shareable("CLAIM", { ...claim, value }), false);
  }
  assert.equal(shareable("CLAIM", { ...claim, value: 0 }), true);
});

test("public totals hide fewer than three distinct positive contributors", () => {
  assert.equal(publicAggregate([]), null);
  assert.equal(publicAggregate([{ memberId: "a", value: 1000 }]), null);
  assert.equal(publicAggregate([{ memberId: "a", value: 10 }, { memberId: "b", value: 10 }]), null);
  const rows = [{ memberId: "a", value: 1 }, { memberId: "b", value: 2 }, { memberId: "c", value: 3 }];
  assert.deepEqual(publicAggregate(rows), { sum: 6, contributors: 3 });
  assert.deepEqual(publicAggregate([...rows, { memberId: "d", value: 4 }]), { sum: 10, contributors: 4 });
});

test("repeated members add values without inflating the public contributor floor", () => {
  const rows = [{ memberId: "a", value: 1 }, { memberId: "a", value: 2 }, { memberId: "b", value: 3 }];
  assert.equal(publicAggregate(rows), null);
  assert.deepEqual(publicAggregate([...rows, { memberId: "c", value: 4 }]), { sum: 10, contributors: 3 });
});

test("zero, negative, nonfinite and blank-identity rows do not inflate the public floor or sum", () => {
  const bad = [0, -1, NaN, Infinity, -Infinity].map((value, i) => ({ memberId: `bad${i}`, value }));
  const rows = [{ memberId: "a", value: 1 }, { memberId: "b", value: 1 }];
  assert.equal(publicAggregate([...rows, ...bad, { memberId: " ", value: 10 }]), null);
  assert.deepEqual(publicAggregate([...rows, ...bad, { memberId: "c", value: 0.25 }]), { sum: 2.25, contributors: 3 });
});

test("aggregate fractions have stable order and overflow is withheld", () => {
  const rows = [{ memberId: "a", value: 0.1 }, { memberId: "b", value: 0.2 }, { memberId: "c", value: 1e15 }];
  assert.deepEqual(publicAggregate(rows), publicAggregate([...rows].reverse()));
  assert.equal(publicAggregate(["a", "b", "c"].map(memberId => ({ memberId, value: Number.MAX_VALUE }))), null);
});

test("tool and project fallbacks are explicit and usable in every registry template", () => {
  assert.equal(renderBullet("Used {tool} on {n} items for {projects}.", { n: 0 }), "Used project tools on 0 items for club projects.");
  assert.equal(renderBullet("{n} {tool} {projects}", { n: 1, tool: " ", projects: ["", " "] }), "1 project tools club projects");
  for (const metric of METRICS) {
    const result = renderBullet(metric.bulletTemplate, { n: 0, tool: null, projects: null });
    assert(!/[{}]|undefined|null/.test(result));
  }
});

test("project names are trimmed, deduplicated and capped at two in supplied order", () => {
  assert.equal(renderBullet("{projects}: {n}", { n: 1, projects: [" ", " ARES ", "ARES", "AstroUSA", "Software"] }), "ARES and AstroUSA: 1");
  assert.equal(renderBullet("{projects}: {n}", { n: 1, projects: ["ARES"] }), "ARES: 1");
});

test("bullet values are exact deterministic numbers; invalid values cannot appear", () => {
  for (const n of [0, 1, 1234.56789, 0.000001, Number.MIN_VALUE, Number.MAX_VALUE]) {
    assert.equal(renderBullet("{n}", { n }), String(n));
  }
  assert.equal(renderBullet("{n}", { n: -0 }), "0");
  for (const n of [-1, NaN, Infinity, -Infinity]) assert.throws(() => renderBullet("{n}", { n }), RangeError);
});

test("substitution never evaluates inserted tokens or dollar replacement syntax", () => {
  assert.equal(renderBullet("{n} {tool} {projects}", { n: 2, tool: "{n} $&", projects: ["{tool}"] }), "2 {n} $& {tool}");
  for (const template of ["{count}", "{{n}}", "{n", "n}"]) assert.throws(() => renderBullet(template, { n: 2 }));
});

test("member templates accept exactly one number token and the inclusive 300-character limit", () => {
  assert.deepEqual(validateMemberTemplate("{n}"), { valid: true });
  assert.deepEqual(validateMemberTemplate("Recorded {n} outcomes."), { valid: true });
  assert.deepEqual(validateMemberTemplate("x".repeat(297) + "{n}"), { valid: true });
  const result = validateMemberTemplate("x".repeat(298) + "{n}");
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /300/);
});

test("member templates reject missing/repeated tokens, all other braces and non-text inputs", () => {
  for (const template of ["", "3 outcomes", "{N}", "{n}{n}", "{n} {tool}", "{projects} {n}", "{{n}}", "{n}{", "}{n}", "{ n }"]) {
    const result = validateMemberTemplate(template);
    assert.equal(result.valid, false, template);
    if (!result.valid) assert(result.error.length > 0);
  }
  for (const template of [null, undefined, 123, {}, ["{n}"]]) assert.equal(validateMemberTemplate(template).valid, false);
});
