import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBullets, buildJsonResume, buildPlainText, JSON_RESUME_SCHEMA,
  type AttestationInput, type BulletRowInput, type SnapshotInput,
} from "./resumeCore.js";

const snaps: SnapshotInput[] = [
  { metricId: "courses_authored", value: 3 },
  { metricId: "prs_merged", value: 5, detail: { tool: null, projects: [{ name: "ARES" }] } },
  { metricId: "team_led", value: 4 },
  { metricId: "lab_hours", value: 0 },
];
const claim = (id: string, status: AttestationInput["status"], value = 1200): AttestationInput =>
  ({ id, kind: "CLAIM", status, label: `Raised funds ${id}`, value, unit: "USD" });
const confirm = (id: string, status: AttestationInput["status"], value = 4): AttestationInput =>
  ({ id, kind: "CONFIRM", status, metricId: "team_led", value });
const byKey = (b: ReturnType<typeof buildBullets>) => Object.fromEntries(b.map(x => [x.key, x]));

test("RECORDS bullets are shareable; zero-value snapshots are dropped", () => {
  const b = byKey(buildBullets(snaps, [], [], undefined));
  assert.equal(b["METRIC:courses_authored"].shareable, true);
  assert.equal(b["METRIC:courses_authored"].pending, false);
  assert.equal(b["METRIC:courses_authored"].text, "Authored 3 published courses.");
  assert.equal(b["METRIC:lab_hours"], undefined);
});

test("CONFIRMED metric gating: unconfirmed, pending, verified, mismatched value", () => {
  assert.equal(byKey(buildBullets(snaps, [], [], undefined))["METRIC:team_led"].shareable, false);
  assert.equal(byKey(buildBullets(snaps, [], [], undefined))["METRIC:team_led"].pending, true);
  assert.equal(byKey(buildBullets(snaps, [confirm("a", "PENDING")], [], undefined))["METRIC:team_led"].shareable, false);
  const ok = byKey(buildBullets(snaps, [confirm("a", "VERIFIED")], [], undefined))["METRIC:team_led"];
  assert.equal(ok.shareable, true);
  assert.equal(ok.pending, false);
  const stale = byKey(buildBullets(snaps, [confirm("a", "VERIFIED", 3)], [], undefined))["METRIC:team_led"];
  assert.equal(stale.shareable, false);
});

test("CLAIM gating: pending, needs proof, verified, declined", () => {
  const b = byKey(buildBullets([], [claim("p", "PENDING"), claim("n", "NEEDS_PROOF"), claim("v", "VERIFIED"), claim("d", "DECLINED")], [], undefined));
  assert.equal(b["ATTESTATION:p"].pending, true);
  assert.equal(b["ATTESTATION:p"].shareable, false);
  assert.equal(b["ATTESTATION:n"].pending, true);
  assert.equal(b["ATTESTATION:v"].shareable, true);
  assert.equal(b["ATTESTATION:v"].pending, false);
  assert.equal(b["ATTESTATION:v"].text, "Raised funds v: 1200 USD");
  assert.equal(b["ATTESTATION:d"], undefined);
});

test("disabled metrics are dropped", () => {
  const b = byKey(buildBullets(snaps, [], [], undefined, new Set(["courses_authored"])));
  assert.equal(b["METRIC:courses_authored"], undefined);
  assert.ok(b["METRIC:prs_merged"]);
});

test("member overrides: hide, reorder, custom template valid/invalid", () => {
  const rows: BulletRowInput[] = [
    { sourceKind: "METRIC", sourceId: "courses_authored", included: false, position: 0 },
    { sourceKind: "METRIC", sourceId: "prs_merged", included: true, position: 1, template: "Shipped {n} PRs" },
  ];
  const out = buildBullets(snaps, [], rows, undefined);
  const b = byKey(out);
  assert.equal(b["METRIC:courses_authored"].hidden, true);
  assert.equal(b["METRIC:courses_authored"].selected, false);
  assert.equal(out[0].key, "METRIC:prs_merged");
  assert.equal(b["METRIC:prs_merged"].text, "Shipped 5 PRs");
  const bad = byKey(buildBullets(snaps, [], [{ sourceKind: "METRIC", sourceId: "prs_merged", included: true, position: 0, template: "no placeholder {x}" }], undefined));
  assert.equal(bad["METRIC:prs_merged"].text, "Authored 5 merged pull requests for ARES.");
});

const member = { name: "Ada L.", email: "ada@example.com" };
const profile = { major: "Aerospace Engineering", gradTerm: "2028-05", headline: "Builder", targetRoles: ["Systems Engineer"] };
const skills = [
  { name: "SolidWorks", area: "CAD" }, { name: "Python", area: "Software" },
  { name: "Fusion 360", area: "CAD" }, { name: "Python", area: "Software" },
];

test("JSON Resume excludes pending, hidden and unconfirmed; no level or image", () => {
  const bullets = buildBullets(snaps, [claim("p", "PENDING"), claim("v", "VERIFIED")],
    [{ sourceKind: "METRIC", sourceId: "prs_merged", included: false, position: 0 }], undefined);
  const r = buildJsonResume(profile, member, bullets, skills,
    [{ name: "Machine Shop Safety", issuer: "Purdue SEARCH", date: "2026-09-01" }], [{ name: "Trainer", date: "2026-10-01" }]);
  assert.equal(r.$schema, JSON_RESUME_SCHEMA);
  assert.equal(r.work[0].name, "Purdue SEARCH");
  assert.deepEqual(r.work[0].highlights, ["Authored 3 published courses.", "Raised funds v: 1200 USD"]);
  assert.deepEqual(r.skills, [
    { name: "CAD", keywords: ["Fusion 360", "SolidWorks"] }, { name: "Software", keywords: ["Python"] },
  ]);
  assert.equal(r.certificates.length, 2);
  assert.equal(r.certificates[0].name, "Machine Shop Safety");
  assert.equal(r.basics.label, "Systems Engineer");
  assert.equal(r.basics.email, undefined);
  assert.equal(buildJsonResume(profile, member, bullets, skills, [], [], { includeEmail: true }).basics.email, "ada@example.com");
  const keys: string[] = [];
  const scan = (v: unknown) => { if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.push(k); scan(x); } };
  scan(r);
  assert.ok(!keys.some(k => /^(level|image|picture|photo|slackId)$/i.test(k)));
  const text = buildPlainText(r);
  assert.ok(text.includes("- Authored 3 published courses."));
  assert.ok(!text.includes("Slack") && !text.includes("ada@example.com"));
  assert.ok(!text.includes("Led a project"));
});

test("pending claims are flagged for the member but absent from exports", () => {
  const bullets = buildBullets([], [claim("p", "PENDING")], [], undefined);
  assert.equal(bullets[0].pending, true);
  const r = buildJsonResume(profile, member, bullets, [], []);
  assert.deepEqual(r.work[0].highlights, []);
  assert.ok(!buildPlainText(r).includes("Raised funds"));
});

test("output is deterministic for shuffled input", () => {
  const atts = [claim("b", "VERIFIED"), claim("a", "VERIFIED"), confirm("c", "VERIFIED")];
  const one = buildBullets(snaps, atts, [], undefined);
  const two = buildBullets([...snaps].reverse(), [...atts].reverse(), [], undefined);
  assert.deepEqual(one, two);
  const s1 = buildJsonResume(profile, member, one, skills, [], []);
  const s2 = buildJsonResume(profile, member, two, [...skills].reverse(), [], []);
  assert.deepEqual(s1, s2);
});
