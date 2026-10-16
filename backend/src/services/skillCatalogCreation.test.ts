import assert from "node:assert/strict";
import { processCatalogProposal } from "./skillCatalogService.js";
import { prisma } from "../db/prisma.js";

function fixture(maxCreates = 10) {
  const quote = "Routed the harness around the bracket and validated the minimum bend radius.";
  const input = { name: "Harness routing", type: "TECHNIQUE" as const, description: "Plan and validate the physical routing of wiring harnesses.", rationale: "The check-in demonstrates routing and clearance validation.", supportingQuote: quote, parentIds: ["parent"], evidenceId: "e1", artifact: { memberId: "m1", source: "CAD" as const, sourceRef: "v1", occurredAt: new Date(), title: "Harness clearance change", body: quote, memberRole: "authored the check-in note", facts: {}, contentHash: "hash1" } };
  const state = { skills: [{ id: "parent", slug: "cable-systems", name: "Cable systems", type: "DOMAIN", status: "ACTIVE", canonicalId: null, aliases: [], lifecycle: "ESTABLISHED" }] as any[], proposals: [] as any[], changes: [] as any[], tags: [] as any[], evidence: { id: "e1", memberId: "m1", supersededAt: null, modelVersion: "fake-model", summary: "Routed and checked a harness." }, locks: 0 };
  const matches = (row: any, where: any = {}): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((clause: any) => matches(row, clause));
    if (value && typeof value === "object") { if ("in" in value) return value.in.includes(row[key]); if ("gte" in value) return row[key] >= value.gte; }
    return row[key] === value;
  });
  const tx = {
    $executeRaw: async () => { state.locks++; return 1; },
    skill: {
      findMany: async (args: any = {}) => state.skills.filter(s => matches(s, args.where)),
      findUnique: async (args: any) => state.skills.find(s => matches(s, args.where)) ?? null,
      create: async ({ data }: any) => { const row = { id: `skill-${state.skills.length}`, aliases: [], canonicalId: null, status: "ACTIVE", lifecycle: "ESTABLISHED", ...data }; state.skills.push(row); return row; },
      update: async ({ where, data }: any) => Object.assign(state.skills.find(s => matches(s, where)), data),
    },
    skillEdge: { findMany: async () => [], upsert: async () => ({}) },
    skillSuppression: { findMany: async () => [] },
    skillProposal: {
      findFirst: async ({ where }: any) => state.proposals.find(p => matches(p, where)) ?? null,
      create: async ({ data }: any) => { const row = { id: `proposal-${state.proposals.length}`, status: "PENDING", seenCount: 1, ...data }; state.proposals.push(row); return row; },
      update: async ({ where, data }: any) => Object.assign(state.proposals.find(p => matches(p, where)), data),
    },
    skillAutomationPolicy: { upsert: async () => ({ paused: false, autoCreate: true, maxCreatesPerDay: maxCreates }) },
    skillEvidence: { findUnique: async () => state.evidence, findFirst: async () => state.evidence },
    skillEvidenceSkill: { create: async ({ data }: any) => { state.tags.push(data); return data; }, upsert: async ({ create }: any) => { if (!state.tags.some(t => t.evidenceId === create.evidenceId && t.skillId === create.skillId)) state.tags.push(create); return create; } },
    skillDispute: { count: async () => 0 },
    skillCatalogChange: { count: async ({ where }: any) => state.changes.filter(c => matches(c, where)).length, create: async ({ data }: any) => { state.changes.push({ id: `change-${state.changes.length}`, createdAt: new Date(), ...data }); return state.changes.at(-1); } },
  };
  const root = { $transaction: async (fn: any) => { const before = structuredClone(state); try { return await fn(tx); } catch (e) { Object.assign(state, before); throw e; } } } as unknown as Pick<typeof prisma, "$transaction">;
  return { state, root, input };
}
{
  const { state, root, input } = fixture();
  const originalEvidence = structuredClone(state.evidence);
  const result = await processCatalogProposal(input, root);
  assert.equal(result.kind, "created");
  assert.equal(state.skills.at(-1).lifecycle, "PROVISIONAL");
  assert.equal(state.changes.length, 1);
  assert.equal(state.changes[0].automatic, true);
  assert.equal(state.tags.length, 1);
  assert.deepEqual(state.evidence, originalEvidence, "creation links work without rewriting immutable evidence");
  assert.equal((await processCatalogProposal(input, root)).kind, "mapped");
  assert.equal(state.skills.length, 2, "repeat proposals resolve to the new canonical concept");
  assert.equal(state.changes.length, 1);
  assert.equal(state.tags.length, 1, "repeat credit is idempotent");
  assert(state.locks >= 2);
}
{
  const { state, root, input } = fixture(0);
  assert.equal((await processCatalogProposal(input, root)).kind, "queued");
  assert.match(state.proposals[0].exceptionReason, /Daily creation limit/);
  assert.equal(state.changes.length, 0);
  assert.equal(state.skills.length, 1);
}
{
  const { state, root, input } = fixture();
  await processCatalogProposal({ ...input, supportingQuote: "A plausible but fabricated supporting passage." }, root);
  assert.match(state.proposals[0].exceptionReason, /passage/);
  assert.equal(state.skills.length, 1);
}
{
  const { state, root, input } = fixture();
  await processCatalogProposal({ ...input, parentIds: ["invented-parent"] }, root);
  assert.match(state.proposals[0].exceptionReason, /broader skill/);
  assert.equal(state.skills.length, 1);
}
console.log("skillCatalogCreation: supported creation, immutable evidence, receipt, retry idempotency, limits, hallucinated quote and parent validation passed");
