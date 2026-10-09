import assert from "node:assert/strict";
import { prisma } from "../db/prisma.js";
import { getMemberRsvps, setMemberRsvp } from "./eventRsvpService.js";

const delegate = prisma.eventRsvp;
const originals = { upsert: delegate.upsert, deleteMany: delegate.deleteMany, count: delegate.count, findMany: delegate.findMany };
const calls: { method: string; args: any }[] = [];
Object.assign(delegate, {
  upsert: async (args: any) => { calls.push({ method: "upsert", args }); return { id: "rsvp" }; },
  deleteMany: async (args: any) => { calls.push({ method: "deleteMany", args }); return { count: 1 }; },
  count: async (args: any) => { calls.push({ method: "count", args }); return 3; },
  findMany: async (args: any) => { calls.push({ method: "findMany", args }); return [{ eventId: "e1" }]; },
});
try {
  assert.deepEqual(await setMemberRsvp("e1", "m1", true), { going: true, count: 3 });
  assert.equal(calls[0].method, "upsert");
  assert.deepEqual(calls[0].args.where, { eventId_memberId: { eventId: "e1", memberId: "m1" } });
  assert.deepEqual(calls[0].args.create, { eventId: "e1", memberId: "m1", attended: true });
  assert.equal(calls[0].args.update.attended, true);
  assert.ok(calls[0].args.update.attendedAt instanceof Date);
  assert.deepEqual(calls[1].args.where, { eventId: "e1" });
  calls.length = 0;
  assert.deepEqual(await setMemberRsvp("e1", "m2", false), { going: false, count: 3 });
  assert.equal(calls[0].method, "deleteMany");
  assert.deepEqual(calls[0].args.where, { eventId: "e1", memberId: "m2" });
  calls.length = 0;
  assert.deepEqual(await getMemberRsvps("m1", []), new Set());
  assert.equal(calls.length, 0);
  assert.deepEqual(await getMemberRsvps("m1", ["e1", "e2"]), new Set(["e1"]));
  assert.deepEqual(calls[0].args.where, { memberId: "m1", eventId: { in: ["e1", "e2"] } });
  console.log("✓ going upsert, own-row cancellation, counts, member reads and empty-id fast path (5 cases)");
} finally {
  Object.assign(delegate, originals);
}
