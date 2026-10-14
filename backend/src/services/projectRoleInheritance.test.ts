// Offline creation-boundary tests; no Prisma connection or Slack client.
import assert from "node:assert/strict";
import { createProjectWithInheritedRoles } from "./projectRoleInheritance.js";

type Db = Parameters<typeof createProjectWithInheritedRoles>[0];
const parentRoles = [
  { memberId: "admin", isLead: true, leadTitle: "Director", member: { isAdmin: true } },
  { memberId: "lead", isLead: true, leadTitle: "Microgreens lead", member: { isAdmin: false } },
  { memberId: "untitled", isLead: true, leadTitle: null, member: { isAdmin: false } },
];
let readCount = 0;
let createdData: any;
const db = {
  projectMember: {
    async findMany(query: any) {
      readCount++;
      assert.equal(query.where.projectId, "parent");
      assert.equal(query.where.member.isBot, false);
      assert.deepEqual(query.where.OR, [{ isLead: true }, { leadTitle: { not: null } }]);
      return parentRoles;
    },
  },
  project: {
    async create({ data }: any) {
      createdData = data;
      return { id: "child", ...data };
    },
  },
} as unknown as Db;

const child = await createProjectWithInheritedRoles(db, { name: "Child", type: "ENGINEERING", parentId: "parent" });
assert.equal(child.id, "child");
assert.equal(createdData.parentId, "parent");
assert.deepEqual(createdData.members.createMany.data, [
  { memberId: "admin", isLead: false, leadTitle: "Director", addedManually: true },
  { memberId: "lead", isLead: true, leadTitle: "Microgreens lead", addedManually: true },
  { memberId: "untitled", isLead: true, leadTitle: null, addedManually: true },
]);

// Inheritance is a snapshot: changing or clearing either side is independent.
const inherited = createdData.members.createMany.data;
parentRoles[1].leadTitle = "New parent title";
assert.equal(inherited[1].leadTitle, "Microgreens lead");
inherited[1].leadTitle = "Child lead";
assert.equal(parentRoles[1].leadTitle, "New parent title");
inherited[0].leadTitle = null;
assert.equal(parentRoles[0].leadTitle, "Director");

await createProjectWithInheritedRoles(db, { name: "Root", type: "ENGINEERING" });
assert.equal(readCount, 1, "root projects must not read parent roles");
assert.equal(createdData.members, undefined);

parentRoles.length = 0;
await createProjectWithInheritedRoles(db, { name: "Empty child", type: "ENGINEERING", parentId: "parent" });
assert.deepEqual(createdData.members.createMany.data, []);

// A failed nested write must propagate, rather than returning a partial success.
const failingDb = {
  projectMember: (db as any).projectMember,
  project: { async create() { throw new Error("Membership write failed"); } },
} as unknown as Db;
await assert.rejects(
  createProjectWithInheritedRoles(failingDb, { name: "Child", type: "ENGINEERING", parentId: "parent" }),
  /Membership write failed/,
);
console.log("projectRoleInheritance: creation, admin/sublead roles, independent edits, empty parent, and failure checks passed");
