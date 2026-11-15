import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { computeForMember, recomputeAll, recomputeAllImpact, type ImpactStore, type ImpactTransaction } from "./impactMetricService.js";
import { METRICS, renderBullet } from "./impactMetricCore.js";

type Row = Record<string, any>;
const NOW = new Date("2026-11-15T12:00:00.000Z");
const OLD = new Date("2025-01-01T12:00:00.000Z");
const LATER = new Date("2026-11-01T12:00:00.000Z");
const FUTURE = new Date("2026-12-01T12:00:00.000Z");
const m = { id: "m", isBot: false }, a = { id: "a", isBot: false }, b = { id: "b", isBot: false }, bot = { id: "bot", isBot: true };

// Small relational fixture evaluator: every source query is actually filtered and
// projected, including nested some/OR and nested assignee/signoff selection.
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return expected.some((w: Row) => matches(row, w));
    const actual = row[key];
    if (expected === null || typeof expected !== "object" || expected instanceof Date) return actual === expected;
    if ("some" in expected) return Array.isArray(actual) && actual.some(r => matches(r, expected.some));
    const operations = Object.keys(expected);
    if (operations.every(op => ["not", "in", "gt", "lt", "contains"].includes(op))) {
      return operations.every(op => {
        if (op === "not") return actual !== expected.not;
        if (op === "in") return expected.in.includes(actual);
        if (op === "gt") return actual > expected.gt;
        if (op === "lt") return actual < expected.lt;
        return typeof actual === "string" && actual.includes(expected.contains);
      });
    }
    return actual != null && matches(actual, expected);
  });
}
function selectRows(rows: Row[], args: Row): Row[] {
  let selected = rows.filter(r => matches(r, args.where));
  if (args.orderBy) {
    const key = Object.keys(args.orderBy)[0];
    selected = selected.slice().sort((x, y) => x[key] < y[key] ? -1 : x[key] > y[key] ? 1 : 0);
  }
  if (args.take !== undefined) selected = selected.slice(0, args.take);
  return selected.map(row => args.select ? Object.fromEntries(Object.entries(args.select).map(([key, spec]) => {
    assert(key in row, `Fixture is missing selected ${key}`);
    if (spec === true) return [key, row[key]];
    return [key, Array.isArray(row[key]) ? selectRows(row[key], spec as Row)
      : row[key] === null ? null : selectRows([row[key]], spec as Row)[0]];
  })) : row);
}
const tableNames = ["member", "project", "projectMember", "courseEnrollment", "course", "vaultItem", "vaultVersion", "changeRequest",
  "skillEvidence", "task", "labVisit", "event", "eventRsvp", "outreachSubmission", "blogPost", "milestone",
  "skill", "skillAssessment", "skillDispute", "skillOnetLink", "onetSoftware"];

function fixtures(): Record<string, Row[]> {
  const tables = Object.fromEntries(tableNames.map(t => [t, [] as Row[]]));
  tables.member = [m, a, b, bot];
  tables.project = [{ id: "p1", name: "ARES" }, { id: "p2", name: "AstroUSA" }, { id: "p3", name: "Empty" }];
  const course = (id: string, createdById = "m", status = "PUBLISHED") => ({ id, createdById, status, publishedAt: OLD });
  tables.course = [course("c1"), course("c2"), course("draft", "m", "DRAFT"), course("other", "a")];
  const enroll = (id: string, member: Row, c: Row, completedAt: Date | null = OLD) => ({ id, memberId: member.id, member, course: c, completedAt });
  tables.courseEnrollment = [enroll("e1", a, tables.course[0]), enroll("e2", a, tables.course[1]), enroll("e3", b, tables.course[0]),
    enroll("self", m, tables.course[0]), enroll("bot", bot, tables.course[0]), enroll("unfinished", a, tables.course[0], null), enroll("other-author", a, tables.course[3])];
  const crItem = (uploadedById = "m", status = "APPROVED") => ({ version: { uploadedById }, changeRequest: { status, reviewedAt: LATER } });
  const item = (id: string, crItems: Row[], drawingForId: string | null = null, deletedAt: Date | null = null) => ({ id, projectId: "p1", crItems, drawingForId, deletedAt });
  tables.vaultItem = [item("part", [crItem(), crItem()]), item("drawing", [crItem()], "part"), item("deleted", [crItem()], "part", OLD),
    item("unapproved", [crItem("m", "OPEN")]), item("other-upload", [crItem("a")])];
  const version = (id: string, item: Row, uploadedById = "m") => ({ id, item, uploadedById, createdAt: OLD });
  tables.vaultVersion = [version("v1", tables.vaultItem[0]), version("v2", tables.vaultItem[0]), version("v3", tables.vaultItem[1]),
    version("deleted-version", tables.vaultItem[2]), version("other-version", tables.vaultItem[0], "a")];
  const review = (id: string, reviewerId: string, status: string, signed = false) => ({ id, projectId: "p1", reviewerId, status, reviewedAt: LATER,
    signoffs: signed ? [{ memberId: "m", createdAt: OLD }, { memberId: "a", createdAt: LATER }] : [] });
  tables.changeRequest = [review("cr-approved", "m", "APPROVED", true), review("cr-rejected", "m", "REJECTED"), review("cr-signoff", "a", "OPEN", true),
    review("cr-pending", "m", "OPEN"), review("cr-other", "a", "APPROVED")];
  const evidence = (sourceRef: string, patch: Row = {}) => ({ memberId: "m", source: "GITHUB", sourceRef, contribution: "AUTHORED", outcome: "MERGED",
    supersededAt: null, occurredAt: OLD, projectId: "p1", ...patch });
  tables.skillEvidence = [evidence("repo:pr:1"), evidence("repo:pr:1"), evidence("repo:pr:2", { projectId: "deleted-project" }),
    evidence("old", { supersededAt: LATER }), evidence("assisted", { contribution: "ASSISTED" }), evidence("open", { outcome: "NONE" }), evidence("other", { memberId: "a" }),
    evidence("task", { source: "TASK" }), evidence("repo:pr:1:review:1", { source: "REVIEW" }), evidence("repo:pr:1:review:1", { source: "REVIEW" }),
    evidence("repo:pr:2:review:1", { source: "REVIEW", projectId: "p2" }), evidence("vault:signoff:1", { source: "REVIEW" }),
    evidence("repo:review:old", { source: "REVIEW", supersededAt: LATER }), evidence("repo:review:other", { source: "REVIEW", memberId: "a" })];
  const task = (id: string, dueDate: Date | null, completedAt: Date | null, patch: Row = {}) => ({ id, status: "DONE", assignees: [m], projectId: "p1", dueDate, completedAt, ...patch });
  tables.task = [task("on-time", LATER, OLD), task("late", OLD, LATER), task("no-completion-date", LATER, null), task("no-due-date", null, OLD),
    task("todo", OLD, null, { status: "TODO" }), task("unassigned", OLD, OLD, { assignees: [a] })];
  tables.projectMember = [
    { memberId: "m", isLead: true, projectId: "p1", project: { tasks: [
      { id: "team1", status: "DONE", assignees: [m, a, bot] }, { id: "team2", status: "DONE", assignees: [a, b] },
      { id: "team3", status: "TODO", assignees: [b] }, { id: "unassigned-team", status: "DONE", assignees: [] },
    ] } },
    { memberId: "m", isLead: true, projectId: "p2", project: { tasks: [{ id: "other-team", status: "DONE", assignees: [a] }] } },
    { memberId: "m", isLead: false, projectId: "p3", project: { tasks: [] } },
    { memberId: "a", isLead: true, projectId: "p3", project: { tasks: [] } },
  ];
  const visit = (id: string, patch: Row = {}) => ({ id, memberId: "m", status: "CLOSED", totalMinutes: 90, checkedInAt: OLD, checkedOutAt: LATER, ...patch });
  tables.labVisit = [visit("lab1"), visit("lab2", { status: "DISCARDED", totalMinutes: 10 }), visit("lab-unconfirmed", { totalMinutes: 0 }),
    visit("lab-open", { status: "OPEN" }), visit("lab-no-checkout", { checkedOutAt: null }), visit("lab-other", { memberId: "a" })];
  const event = (id: string, patch: Row = {}) => ({ id, organizerId: "m", type: "MEETING", startTime: OLD, projectId: "p1", isPublic: true, ...patch });
  tables.event = [event("event1"), event("event2", { isPublic: false }), event("deadline", { type: "DEADLINE" }),
    event("future", { startTime: FUTURE }), event("now", { startTime: NOW }), event("other-event", { organizerId: "a" })];
  const rsvp = (id: string, member: Row | null, event: Row, attended = true) => ({ id, memberId: member?.id ?? null, member, event, attended, attendedAt: OLD });
  tables.eventRsvp = [rsvp("rsvp-member", a, tables.event[0]), rsvp("rsvp-guest", null, tables.event[0]),
    rsvp("rsvp-bot", bot, tables.event[0]), rsvp("rsvp-cancelled", b, tables.event[0], false), rsvp("rsvp-private", b, tables.event[1]), rsvp("rsvp-other-organizer", b, tables.event[5])];
  const outreach = (id: string, patch: Row = {}) => ({ id, authorId: "m", status: "PUBLISHED", publishedAt: OLD, projectId: "p1", ...patch });
  tables.outreachSubmission = [outreach("outreach"), outreach("outreach-draft", { status: "DRAFT" }), outreach("outreach-other", { authorId: "a" })];
  const blog = (id: string, createdById: string, authorId: string, status = "PUBLISHED") => ({ id, createdById, authors: [{ memberId: authorId }], status, publishedAt: OLD });
  tables.blogPost = [blog("authored-blog", "a", "m"), blog("ghostwritten-for-other", "m", "a"), blog("draft-blog", "m", "m", "DRAFT")];
  const milestone = (id: string, patch: Row = {}) => ({ id, ownerId: "m", status: "COMPLETED", completedAt: OLD, projectId: "p2", ...patch });
  tables.milestone = [milestone("milestone"), milestone("open-milestone", { status: "ON_TRACK" }), milestone("other-milestone", { ownerId: "a" })];
  return tables;
}

function memory(tables = fixtures(), options: { failMetric?: string; afterLock?: () => Promise<void> } = {}) {
  const calls: { table: string; method: string; args: Row; txId: number }[] = [];
  const transactions: Row[] = [];
  let snapshots = new Map<string, Row>(), lockOwner: number | null = null;
  let serial = 0;
  const store: ImpactStore = {
    async transaction(work, opts) {
      const txId = ++serial;
      transactions.push(opts);
      let active = true;
      const staged = new Map(snapshots);
      const read = (table: string, method: string, args: Row) => {
        assert(active, "query outside transaction");
        calls.push({ table, method, args, txId });
        const rows = selectRows(tables[table], args);
        return Promise.resolve(method === "findUnique" ? rows[0] ?? null : rows);
      };
      const tx: Row = Object.fromEntries(tableNames.map(table => [table, {
        findMany: (args: Row) => read(table, "findMany", args), findUnique: (args: Row) => read(table, "findUnique", args),
      }]));
      tx.impactSnapshot = { upsert: async (args: Row) => {
        assert(active);
        calls.push({ table: "impactSnapshot", method: "upsert", args, txId });
        if (args.create.metricId === options.failMetric) throw new Error("injected upsert failure");
        const key = `${args.create.memberId}:${args.create.metricId}`;
        staged.set(key, structuredClone(staged.has(key) ? args.update : args.create));
        return staged.get(key);
      } };
      tx.$queryRaw = async (sql: TemplateStringsArray) => {
        assert(active);
        assert.match(sql.join(""), /pg_try_advisory_xact_lock.*impact-recompute/);
        calls.push({ table: "lock", method: "$queryRaw", args: {}, txId });
        if (lockOwner !== null) return [{ locked: false }];
        lockOwner = txId;
        await options.afterLock?.();
        return [{ locked: true }];
      };
      try {
        const result = await work(tx as ImpactTransaction);
        snapshots = staged;
        return result;
      } finally {
        active = false;
        if (lockOwner === txId) lockOwner = null;
      }
    },
  };
  return { tables, store, calls, transactions, options, snapshotRows: () => [...snapshots.values()], locked: () => lockOwner !== null };
}
const deps = (db: ReturnType<typeof memory>) => ({ store: db.store, now: () => NOW });
const metric = async (id: string, db = memory()) => (await computeForMember("m", deps(db))).find(r => r.metricId === id)!;

const cases: [string, number, string, Row, number?][] = [
  ["members_trained", 2, "courseEnrollment", { memberId: { not: "m" }, member: { isBot: false }, completedAt: { not: null }, course: { createdById: "m" } }],
  ["courses_authored", 2, "course", { createdById: "m", status: "PUBLISHED" }],
  ["cad_items_released", 2, "vaultItem", { deletedAt: null, crItems: { some: { version: { uploadedById: "m" }, changeRequest: { status: "APPROVED" } } } }],
  ["cad_revisions", 3, "vaultVersion", { uploadedById: "m", item: { deletedAt: null } }],
  ["drawings_released", 1, "vaultItem", { deletedAt: null, drawingForId: { not: null }, crItems: { some: { version: { uploadedById: "m" }, changeRequest: { status: "APPROVED" } } } }, 1],
  ["design_reviews", 3, "changeRequest", { OR: [{ reviewerId: "m", status: { in: ["APPROVED", "REJECTED"] } }, { signoffs: { some: { memberId: "m" } } }] }],
  ["prs_merged", 2, "skillEvidence", { memberId: "m", source: "GITHUB", contribution: "AUTHORED", outcome: "MERGED", supersededAt: null }],
  ["code_reviews", 2, "skillEvidence", { memberId: "m", source: "REVIEW", sourceRef: { contains: ":review:" }, supersededAt: null }, 1],
  ["tasks_completed", 4, "task", { status: "DONE", assignees: { some: { id: "m" } } }],
  ["lab_hours", 100 / 60, "labVisit", { memberId: "m", status: { in: ["CLOSED", "DISCARDED"] }, totalMinutes: { gt: 0 }, checkedOutAt: { not: null } }],
  ["team_led", 2, "projectMember", { memberId: "m", isLead: true }],
  ["events_organized", 2, "event", { organizerId: "m", type: { not: "DEADLINE" }, startTime: { lt: NOW } }],
  ["outreach_attendees", 2, "eventRsvp", { attended: true, event: { organizerId: "m", isPublic: true }, OR: [{ memberId: null }, { member: { isBot: false } }] }],
  ["outreach_published", 1, "outreachSubmission", { authorId: "m", status: "PUBLISHED" }],
  ["blog_posts_published", 1, "blogPost", { status: "PUBLISHED", authors: { some: { memberId: "m" } } }],
  ["milestones_delivered", 1, "milestone", { ownerId: "m", status: "COMPLETED" }],
];
for (const [id, expected, table, where, queryIndex = 0] of cases) {
  test(`${id} counts only the specified real source rows`, async () => {
    const db = memory(), result = await metric(id, db);
    assert.equal(result.value, expected);
    assert.deepEqual(db.calls.filter(c => c.table === table)[queryIndex].args.where, where);
    assert.equal(result.metricVersion, "impact-v1");
    assert.deepEqual(result.computedAt, NOW);
  });
}

test("snapshot contract: registry order, source IDs, real projects, earliest dates, stable clock and idempotent upserts", async () => {
  const db = memory();
  const rows = await computeForMember("m", deps(db));
  assert.deepEqual(rows.map(r => r.metricId), METRICS.map(m => m.id));
  assert.equal(db.transactions.length, 1);
  assert.equal(db.transactions[0].isolationLevel, "RepeatableRead");
  assert.equal(new Set(db.calls.map(c => c.txId)).size, 1);
  assert.deepEqual(rows.find(r => r.metricId === "prs_merged")!.sourceRefs, ["repo:pr:1", "repo:pr:2"]);
  assert.deepEqual(rows.find(r => r.metricId === "prs_merged")!.detail.projects, [{ id: "p1", name: "ARES" }]);
  assert.equal(rows.find(r => r.metricId === "members_trained")!.detail.since, OLD.toISOString());
  assert.equal(rows.find(r => r.metricId === "team_led")!.detail.since, null);
  assert.deepEqual(rows.find(r => r.metricId === "blog_posts_published")!.sourceRefs, ["authored-blog"]);
  const again = await computeForMember("m", deps(db));
  assert.deepEqual(again, rows);
  assert.equal(db.snapshotRows().length, 16);
});

test("due-date denominator includes completed tasks missing completion date; no due dates yields unknown", async () => {
  const db = memory();
  assert.equal((await metric("tasks_completed", db)).detail.onTimeRate, 1 / 3);
  db.tables.task.forEach(t => { t.dueDate = null; });
  assert.equal((await metric("tasks_completed", db)).detail.onTimeRate, null);
});
test("largest led project counts distinct other human assignees and reports its shipped tasks; empty lead yields zero", async () => {
  const db = memory(), result = await metric("team_led", db);
  assert.equal(result.detail.tasksShipped, 3);
  assert.equal(result.detail.breakdown.largestProjectId, "p1");
  const selection = db.calls.find(c => c.table === "projectMember")!.args.select.project.select.tasks.select.assignees;
  assert.deepEqual(selection.where, { id: { not: "m" }, isBot: false });
  db.tables.projectMember = [{ memberId: "m", isLead: true, projectId: "p3", project: { tasks: [{ id: "bot-only", status: "TODO", assignees: [m, bot] }] } }];
  const zero = await metric("team_led", db);
  assert.equal(zero.value, 0);
  assert.equal(zero.detail.tasksShipped, 0);
  assert.equal(zero.detail.since, null);
});
test("source refs are bounded and sorted after counting all records, independently of database row order", async () => {
  const db = memory();
  db.tables.course = Array.from({ length: 70 }, (_, i) => ({ id: `c${String(i).padStart(3, "0")}`, createdById: "m", status: "PUBLISHED", publishedAt: OLD })).reverse();
  const first = await metric("courses_authored", db);
  assert.equal(first.value, 70);
  assert.equal(first.sourceRefs.length, 50);
  assert.equal(first.sourceRefs[0], "c000");
  assert.equal(first.sourceRefs[49], "c049");
  db.tables.course.reverse();
  assert.deepEqual(await metric("courses_authored", db), first);
});
test("bots and missing members produce no snapshots or source reads", async () => {
  const db = memory();
  assert.deepEqual(await computeForMember("bot", deps(db)), []);
  assert.deepEqual(await computeForMember("missing", deps(db)), []);
  assert(db.calls.every(c => c.table === "member"));
  assert.equal(db.snapshotRows().length, 0);
});

function softwareFixtures(db: ReturnType<typeof memory>) {
  db.tables.skill = [
    { id: "cad", canonicalId: null, name: "SolidWorks" }, { id: "alias", canonicalId: "cad", name: "SW" },
    { id: "tie", canonicalId: null, name: "Alpha CAD" }, { id: "other", canonicalId: null, name: "Unrelated tool" },
    { id: "self", canonicalId: null, name: "Self-claimed tool" }, { id: "peer", canonicalId: null, name: "Peer tool" },
  ];
  db.tables.skillAssessment = [
    { memberId: "m", skillId: "cad", provenance: "MANAGER_VERIFIED", level: 4 },
    { memberId: "m", skillId: "alias", provenance: "AI_INFERRED", level: 3 },
    { memberId: "m", skillId: "tie", provenance: "AI_INFERRED", level: 3 },
    { memberId: "m", skillId: "other", provenance: "AI_INFERRED", level: 5 },
    { memberId: "m", skillId: "self", provenance: "SELF_CLAIMED", level: 5 },
    { memberId: "m", skillId: "peer", provenance: "PEER_ENDORSED", level: 5 },
  ];
  db.tables.skillOnetLink = [
    { skillId: "alias", kind: "SOFTWARE", ref: "solidworks" }, { skillId: "tie", kind: "SOFTWARE", ref: "alpha" },
    { skillId: "other", kind: "SOFTWARE", ref: "other" }, { skillId: "self", kind: "SOFTWARE", ref: "solidworks" },
    { skillId: "peer", kind: "SOFTWARE", ref: "solidworks" }, { skillId: "other", kind: "ELEMENT", ref: "solidworks" },
  ];
  db.tables.onetSoftware = [
    { exampleNorm: "solidworks", categoryId: "2.E.9.c" }, { exampleNorm: "alpha", categoryId: "2.E.9.c" },
    { exampleNorm: "other", categoryId: "2.E.4.h" },
  ];
}
test("tool resolution joins canonical SOFTWARE links and categories, chooses highest allowed level with deterministic ties", async () => {
  const db = memory(); softwareFixtures(db);
  assert.equal((await metric("cad_revisions", db)).detail.tool, "SolidWorks");
  assert.equal((await metric("events_organized", db)).detail.tool, "Unrelated tool");
  assert.equal((await metric("lab_hours", db)).detail.tool, null);
  db.tables.skillAssessment[0].level = 3;
  const tied = await metric("cad_revisions", db);
  assert.equal(tied.detail.tool, "Alpha CAD");
  db.tables.skillAssessment.reverse(); db.tables.skill.reverse(); db.tables.skillOnetLink.reverse();
  assert.equal((await metric("cad_revisions", db)).detail.tool, "Alpha CAD");
});
for (const status of ["OPEN", "UPHELD"]) test(`${status} disputes suppress every equivalent tool identity and null falls back in template`, async () => {
  const db = memory(); softwareFixtures(db);
  db.tables.skillDispute = [{ memberId: "m", skillId: "alias", status }, { memberId: "m", skillId: "tie", status }];
  const result = await metric("cad_revisions", db);
  assert.equal(result.detail.tool, null);
  assert.equal(renderBullet(METRICS.find(m => m.id === result.metricId)!.bulletTemplate, { n: result.value, tool: result.detail.tool }), "Uploaded 3 Vault versions using project tools.");
  db.tables.skillDispute.forEach(d => { d.status = "DISMISSED"; });
  assert.equal((await metric("cad_revisions", db)).detail.tool, "SolidWorks");
});

test("a failed upsert rolls back all snapshots and preserves prior complete snapshots", async () => {
  const db = memory();
  await computeForMember("m", deps(db));
  const before = structuredClone(db.snapshotRows());
  db.tables.course = [];
  db.options.failMetric = "tasks_completed";
  await assert.rejects(computeForMember("m", deps(db)), /injected upsert failure/);
  assert.deepEqual(db.snapshotRows(), before);
});
test("nightly pages humans in groups of 50 under one lock and transaction with one injected timestamp", async () => {
  const db = memory(Object.fromEntries(tableNames.map(t => [t, []])));
  db.tables.member = [...Array.from({ length: 103 }, (_, i) => ({ id: `member${String(i).padStart(3, "0")}`, isBot: false })), bot];
  const result = await recomputeAll(deps(db));
  assert.deepEqual(result, { status: "COMPLETED", members: 103, snapshots: 103 * 16 });
  const pages = db.calls.filter(c => c.table === "member" && c.method === "findMany");
  assert.equal(pages.length, 3);
  assert(pages.every(p => p.args.take === 50 && p.args.where.isBot === false));
  assert.deepEqual(pages[1].args.where.id, { gt: "member049" });
  assert.deepEqual(pages[2].args.where.id, { gt: "member099" });
  assert.equal(db.calls[0].table, "lock");
  assert.equal(new Set(db.calls.map(c => c.txId)).size, 1);
  assert(db.snapshotRows().every(r => r.computedAt.getTime() === NOW.getTime() && r.memberId !== "bot"));
  assert.equal(db.transactions[0].timeout, 30 * 60_000);
  assert.equal(db.locked(), false);
});
test("overlapping nightly run skips while the pinned lock is held and succeeds after release", async () => {
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(r => { entered = r; });
  const paused = new Promise<void>(r => { release = r; });
  const db = memory(Object.fromEntries(tableNames.map(t => [t, []])), { afterLock: async () => { entered(); await paused; } });
  const first = recomputeAll(deps(db));
  await ready;
  assert.equal(db.locked(), true);
  assert.deepEqual(await recomputeAll(deps(db)), { status: "SKIPPED", members: 0, snapshots: 0 });
  assert.equal(db.calls.filter(c => c.table === "member").length, 0);
  release();
  assert.equal((await first).status, "COMPLETED");
  assert.equal(db.locked(), false);
  assert.equal((await recomputeAll(deps(db))).status, "COMPLETED");
});
test("nightly failure releases lock, rolls back, and cron wrapper catches without sending or exposing errors", async () => {
  const db = memory(undefined, { failMetric: "cad_revisions" });
  await assert.rejects(recomputeAll(deps(db)), /injected/);
  assert.equal(db.locked(), false);
  assert.equal(db.snapshotRows().length, 0);
  const messages: unknown[][] = [], previous = console.error;
  console.error = (...args) => { messages.push(args); };
  try { await recomputeAllImpact(deps(db)); } finally { console.error = previous; }
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], ["[impact] Snapshot recompute failed; transaction rolled back."]);
  assert.equal(db.locked(), false);
  db.options.failMetric = undefined;
  assert.equal((await recomputeAll(deps(db))).status, "COMPLETED");
});
test("CLI supports source/compiled service paths, help before DB import and disconnect in finally", () => {
  const script = readFileSync(new URL("../../scripts/impact-recompute.ts", import.meta.url), "utf8");
  assert.match(script, /existsSync.*impactMetricService\.ts/);
  assert.match(script, /\? "\.\.\/src" : "\.\.\/dist"/);
  assert(script.indexOf("if (values.help)") < script.indexOf("const { prisma }"));
  assert.match(script, /finally\s*\{\s*await prisma\.\$disconnect\(\)/);
  assert.match(script, /result.status === "SKIPPED".*process.exitCode = 2/);
});
