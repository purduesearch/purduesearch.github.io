import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuratedLinks, autoLink, getSkillDemand, listUnlinked, removeLink, setLink, type OnetLinkStore } from "./onetLinkService.js";

type Row = Record<string, any>;
const admin = { id: "admin", isAdmin: true };
function fixture() {
  const state = { skills: [
    { id: "matlab", slug: "matlab", name: "MATLAB", aliases: [{ alias: "Simulink" }], status: "ACTIVE", canonicalId: null },
    { id: "python", slug: "python", name: "Python", aliases: [], status: "ACTIVE", canonicalId: null },
    { id: "cpp", slug: "cpp", name: "C++", aliases: [], status: "ACTIVE", canonicalId: null },
    { id: "other", slug: "other", name: "Unmapped", aliases: [], status: "ACTIVE", canonicalId: null },
  ] as Row[], links: [] as Row[], software: [
    { id: 1, example: "The MathWorks MATLAB", exampleNorm: "matlab", occupationCode: "A", hot: true, inDemand: true },
    { id: 2, example: "MathWorks Simulink", exampleNorm: "simulink", occupationCode: "A", hot: false, inDemand: true },
    { id: 3, example: "Python", exampleNorm: "python", occupationCode: "B", hot: false, inDemand: false },
    { id: 4, example: "C++", exampleNorm: "c", occupationCode: "B", hot: false, inDemand: true },
  ] as Row[], elements: [{ id: "2.B.3.e", name: "Programming", domain: "TRANSFERABLE_SKILL" }, { id: "d", name: "Design models", domain: "DWA" }] as Row[], ratings: [] as Row[] };
  let locks = 0, transactions = 0, writesBeforeFailure = Infinity;
  function matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === "onetLinks") return !state.links.some(link => link.skillId === row.id);
      if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
      return row[key] === value;
    });
  }
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray) => { assert.match(strings.join(""), /pg_advisory_xact_lock.*skills-catalog/); locks++; return 1; },
    skill: {
      findUnique: async ({ where }: Row) => state.skills.find(row => matches(row, where)) ?? null,
      findMany: async ({ where, orderBy }: Row) => { const rows = state.skills.filter(row => matches(row, where)); return orderBy ? rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) : rows; },
    },
    onetSoftware: {
      findFirst: async ({ where }: Row) => state.software.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }: Row) => state.software.filter(row => matches(row, where)),
    },
    onetElement: {
      findUnique: async ({ where }: Row) => state.elements.find(row => matches(row, where)) ?? null,
      findMany: async () => state.elements,
    },
    // Return even suppressed rows to verify the aggregation's defensive filter too.
    onetRating: { findMany: async () => state.ratings },
    skillOnetLink: {
      findMany: async ({ where }: Row) => state.links.filter(row => matches(row, where)),
      findUnique: async ({ where }: Row) => state.links.find(row => matches(row, where.skillId_kind_ref)) ?? null,
      upsert: async ({ where, create, update }: Row) => {
        if (writesBeforeFailure-- === 0) throw new Error("injected write failure");
        const old = state.links.find(row => matches(row, where.skillId_kind_ref));
        if (old) return Object.assign(old, update);
        const row = { id: `link-${state.links.length}`, ...create }; state.links.push(row); return row;
      },
      deleteMany: async ({ where }: Row) => { const before = state.links.length; state.links = state.links.filter(row => !matches(row, where)); return { count: before - state.links.length }; },
    },
  };
  const store = { ...tx, $transaction: async (run: (tx: any) => Promise<any>) => {
    transactions++; const before = structuredClone(state);
    try { return await run(tx); } catch (error) { Object.assign(state, before); throw error; }
  } } as unknown as OnetLinkStore;
  return { state, store, tx: tx as unknown as OnetLinkStore, locks: () => locks, transactions: () => transactions, fail: () => { writesBeforeFailure = 1; } };
}

test("automatic exact links preserve reviewed curated and admin relations", async () => {
  const f = fixture();
  await applyCuratedLinks(f.store);
  assert.equal(f.state.links.find(row => row.ref === "simulink")!.relation, "RELATED");
  const before = structuredClone(f.state.links);
  const proposals = await autoLink("matlab", f.store);
  assert.equal(proposals.length, 2);
  assert.deepEqual(f.state.links, before);
  await setLink(admin, { skillId: "matlab", kind: "SOFTWARE", ref: "matlab", relation: "BROADER" }, f.store);
  await autoLink("matlab", f.store);
  await applyCuratedLinks(f.store);
  assert.equal(f.state.links.find(row => row.ref === "matlab")!.origin, "ADMIN");
  assert.equal(f.state.links.find(row => row.ref === "matlab")!.relation, "BROADER");
});

test("curated upserts are idempotent, replace AUTO, and use broader Programming for C++", async () => {
  const f = fixture();
  await autoLink("python", f.store);
  assert.equal(f.state.links[0].origin, "AUTO");
  await applyCuratedLinks(f.store);
  const once = structuredClone(f.state.links);
  await applyCuratedLinks(f.store);
  assert.deepEqual(f.state.links, once);
  assert.equal(f.state.links.find(row => row.skillId === "python")!.origin, "CURATED");
  assert.equal(f.state.links.find(row => row.skillId === "cpp")!.relation, "BROADER");
  assert(!f.state.links.some(row => row.ref === "c"));
});

test("automatic links reuse injected transaction; standalone calls lock and roll back failures", async () => {
  const f = fixture();
  await autoLink("python", f.tx);
  assert.equal(f.transactions(), 0);
  assert.equal(f.locks(), 0);
  f.fail();
  await assert.rejects(autoLink("matlab", f.store), /write failure/);
  assert.equal(f.state.links.length, 1);
  assert.equal(f.transactions(), 1);
  assert.equal(f.locks(), 1);
  await assert.rejects(autoLink("missing", f.store), { code: "NOT_FOUND" });
});

test("listUnlinked returns only active distinct concepts with no link", async () => {
  const f = fixture();
  f.state.skills.push({ id: "old", name: "Old", status: "ARCHIVED", canonicalId: null }, { id: "redirect", name: "Redirect", status: "ACTIVE", canonicalId: "python" });
  await autoLink("python", f.store);
  assert.deepEqual((await listUnlinked(f.store)).map(row => row.id), ["cpp", "matlab", "other"]);
});

test("admin edits reject missing skills, dangling refs, wrong kinds/relations and unauthorized actors", async () => {
  const f = fixture();
  const input = { skillId: "python", kind: "SOFTWARE" as const, ref: "python", relation: "EXACT" as const };
  for (const patch of [{ skillId: "missing" }, { ref: "missing" }, { kind: "DWA", ref: "2.B.3.e" }, { kind: "ELEMENT", ref: "d" }, { kind: "BOGUS" }, { relation: "BOGUS" }]) {
    await assert.rejects(setLink(admin, { ...input, ...patch } as any, f.store), error => ["INVALID", "NOT_FOUND"].includes((error as any).code));
  }
  await assert.rejects(setLink({ id: "member", isAdmin: false }, input, f.store), { code: "FORBIDDEN" });
  await assert.rejects(removeLink({ id: "member", isAdmin: false }, input, f.store), { code: "FORBIDDEN" });
  assert.equal(f.state.links.length, 0);
  await setLink(admin, input, f.store);
  assert.equal(f.state.links[0].createdById, "admin");
  assert.equal((await removeLink(admin, { skillId: input.skillId, kind: input.kind, ref: input.ref }, f.store)).count, 1);
  assert.equal((await removeLink(admin, { skillId: input.skillId, kind: input.kind, ref: input.ref }, f.store)).count, 0);
});

test("demand deduplicates occupations, excludes suppressed/not-relevant/non-IM, and sorts deterministically", async () => {
  const f = fixture();
  await applyCuratedLinks(f.store);
  f.state.software.push({ id: 9, example: "MATLAB software", exampleNorm: "matlab", occupationCode: "B", hot: false, inDemand: false });
  f.state.elements.push({ id: "other", name: "Other", domain: "KNOWLEDGE" });
  await setLink(admin, { skillId: "matlab", kind: "ELEMENT", ref: "2.B.3.e", relation: "RELATED" }, f.store);
  await setLink(admin, { skillId: "matlab", kind: "ELEMENT", ref: "other", relation: "RELATED" }, f.store);
  const rating = (occupationCode: string, elementId: string, value: number, extra = {}) => ({ occupationCode, elementId, value, scale: "IM", suppress: false, notRelevant: false, occupation: { title: occupationCode }, ...extra });
  f.state.ratings.push(rating("A", "2.B.3.e", 3), rating("A", "other", 4), rating("B", "2.B.3.e", 4), rating("C", "other", 5, { suppress: true }), rating("D", "other", 5, { notRelevant: true }), rating("E", "other", 7, { scale: "LV" }));
  const result = await getSkillDemand(["matlab", "matlab", "unknown"], f.store);
  assert.deepEqual(result.matlab.software, { hot: true, inDemandOccupations: 1, occupationsListed: 2, examples: ["MATLAB software", "MathWorks Simulink", "The MathWorks MATLAB"] });
  assert.deepEqual(result.matlab.topOccupations.map(row => [row.occupationCode, row.importance, row.elementId]), [["A", 4, "other"], ["B", 4, "2.B.3.e"]]);
  assert.deepEqual(result.unknown, { software: { hot: false, inDemandOccupations: 0, occupationsListed: 0, examples: [] }, topOccupations: [] });
  f.state.ratings.reverse(); f.state.software.reverse(); f.state.links.reverse();
  assert.deepEqual(await getSkillDemand(["unknown", "matlab"], f.store), result);
  assert.deepEqual(await getSkillDemand([], f.store), {});
});
