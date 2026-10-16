// Exercise the actual service with a transactional, in-memory boundary. No credentials/network.
import assert from "node:assert/strict";
import { consolidateSkills, reverseCatalogChange } from "./skillCatalogService.js";
import { createSkillsBudget, SkillBudgetExceeded } from "./ai/skillsGemini.js";
import { prisma } from "../db/prisma.js";
import { getProjectSkillCoverage, saveSkillOpportunity } from "./skillWorkspaceService.js";

type RecordRow = Record<string, any>;
function fixture() {
  const state = { skills: ["a", "b", "c"].map(id => ({ id, name: `Concept ${id}`, type: "TECHNIQUE", status: "ACTIVE", canonicalId: null as string | null, description: null })), assertions: [{ memberId: "m1", skillId: "a", provenance: "SELF_CLAIMED", assertedById: "m1", level: 3 }], changes: [] as RecordRow[], edges: [] as RecordRow[], locks: 0 };
  const match = (row: RecordRow, where: RecordRow = {}): boolean => Object.entries(where).every(([k, v]) => {
    if (k === "OR") return v.some((clause: RecordRow) => match(row, clause));
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if ("in" in v) return v.in.includes(row[k]);
      if ("not" in v) return row[k] !== v.not;
      if ("gte" in v) return row[k] >= v.gte;
    }
    return row[k] === v;
  });
  const tx = {
    $executeRaw: async () => { state.locks++; return 1; },
    skill: { findMany: async () => structuredClone(state.skills), findUnique: async ({ where }: RecordRow) => structuredClone(state.skills.find(s => s.id === where.id)), update: async ({ where, data }: RecordRow) => Object.assign(state.skills.find(s => s.id === where.id)!, data) },
    skillEdge: { findMany: async () => state.edges },
    skillAssessment: { findMany: async ({ where }: RecordRow) => state.assertions.filter(a => match(a, where)), deleteMany: async () => ({ count: 0 }) },
    skillEvidenceSkill: { findMany: async () => [] }, skillEvidence: { findMany: async () => [] },
    skillDispute: { count: async () => 0, findMany: async () => [] },
    skillAutomationPolicy: { upsert: async () => ({ paused: false, autoConsolidate: true, maxAffectedMembers: 5, maxMergesPerDay: 3 }) },
    skillCatalogChange: {
      findMany: async ({ where }: RecordRow) => state.changes.filter(c => match(c, where)),
      findUnique: async ({ where }: RecordRow) => state.changes.find(c => match(c, where)),
      findFirst: async ({ where }: RecordRow) => state.changes.find(c => match(c, where)),
      count: async ({ where }: RecordRow) => state.changes.filter(c => match(c, where)).length,
      create: async ({ data }: RecordRow) => { const c = { id: `decision-${state.changes.length + 1}`, createdAt: new Date(1000 + state.changes.length), ...data }; state.changes.push(c); return c; },
    },
  };
  const root = { $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => { const before = structuredClone(state); try { return await fn(tx); } catch (e) { Object.assign(state, before); throw e; } } } as unknown as Pick<typeof prisma, "$transaction">;
  return { state, root };
}
{
  const { state, root } = fixture();
  const original = structuredClone(state.assertions);
  const decision = await consolidateSkills("a", "b", "admin", false, root);
  assert.equal(state.skills[0].canonicalId, "b");
  assert.deepEqual(state.assertions, original, "manual claims keep their original identity");
  assert.equal(state.changes.length, 1);
  await reverseCatalogChange(decision.id, "admin", root);
  assert.equal(state.skills[0].canonicalId, null);
  assert.deepEqual(state.assertions, original);
  assert.equal(state.changes[1].reversesId, decision.id);
  await assert.rejects(reverseCatalogChange(decision.id, "admin", root), /already been reversed/);
  await assert.rejects(consolidateSkills("a", "b", "admin", false, root), /keep-separate/);
  assert.equal(state.changes.length, 2, "retries and blocked remapping do not append duplicate mutations");
}
{
  const { state, root } = fixture();
  const first = await consolidateSkills("a", "b", "admin", false, root);
  const dependent = await consolidateSkills("b", "c", "admin", false, root);
  await assert.rejects(reverseCatalogChange(first.id, "admin", root), /depend/);
  assert.equal(state.skills[0].canonicalId, "b");
  await reverseCatalogChange(dependent.id, "admin", root);
  await reverseCatalogChange(first.id, "admin", root);
  assert(state.skills.every(s => s.canonicalId === null), "reversed dependent changes no longer block the original reversal");
}
{
  const { state, root } = fixture();
  state.edges.push({ fromId: "a", toId: "b", kind: "PARENT" });
  await assert.rejects(consolidateSkills("a", "b", "admin", false, root), /hierarchy/);
  assert.equal(state.changes.length, 0);
  assert.equal(state.skills[0].canonicalId, null, "a rejected merge changes neither identity nor history");
}
{
  const reserve = createSkillsBudget(.1);
  reserve(.05); reserve(.05);
  assert.throws(() => reserve(.001), SkillBudgetExceeded);
  assert.throws(() => createSkillsBudget(.1)(-1), SkillBudgetExceeded);
}
{
  const original = prisma.projectMember.findUnique;
  prisma.projectMember.findUnique = (async () => null) as typeof original;
  try { await assert.rejects(getProjectSkillCoverage("intruder", "private-project"), /belong to/); } finally { prisma.projectMember.findUnique = original; }
  const taskOriginal = prisma.task.findFirst;
  let query: any;
  prisma.task.findFirst = (async args => { query = args; return null; }) as typeof taskOriginal;
  try { await assert.rejects(saveSkillOpportunity("intruder", "private-task", true), /not available/); assert.equal(query.where.project.members.some.memberId, "intruder"); } finally { prisma.task.findFirst = taskOriginal; }
}
console.log("skillCatalogMutation: consolidation, rollback, dependent undo, durable keep-separate, budget and project-access cases passed");
