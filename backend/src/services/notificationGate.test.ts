import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute with fake persistence and Slack boundaries; never use credentials.
function load(file: string, deps: Record<string, unknown>): any {
  const source = readFileSync(new URL(file, import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", ...Object.keys(deps), compiled)(exports, ...Object.values(deps));
  return exports;
}

let recipient: any = { slackId: "U1", notificationsDisabled: true, notificationChannels: {} };
const writes: any[] = [], sends: any[] = [], cards: any[] = [];
const prisma = {
  member: { findUnique: async () => recipient },
  notification: {
    create: async (args: any) => { writes.push(args); return { id: "n1", ...args.data }; },
    findFirst: async () => null,
  },
};
const gate = load("./notificationGate.ts", { prisma });
for (const value of [true, undefined, null, "false", 0]) assert.equal(gate.notificationsEnabled(value), false);
assert.equal(gate.notificationsEnabled(false), true);
const crud = load("./notificationCrud.ts", {
  prisma, ...gate, activityBus: { emit: () => {} },
  routeFor: (_type: string, pref: string) => ({ inApp: pref !== "slack" && pref !== "off", slack: pref !== "dashboard" && pref !== "off" }),
  queueDm: (...args: any[]) => sends.push(args), queueCard: async (args: any) => cards.push(args),
});
const notification = { type: "TASK_ASSIGNED", recipientId: "m1", message: "Assigned", slackText: "Assigned" };
assert.equal(await crud.createNotification(notification), null);
assert.equal(await crud.createNotification({ ...notification, slackCard: { entityType: "TASK", entityId: "t1", reason: "ASSIGNED" } }), null);
assert.equal(await crud.upsertSlackNotification({ type: "SLACK_DM", recipientId: "m1" }), null);
assert.deepEqual([writes.length, sends.length, cards.length], [0, 0, 0]);
recipient.notificationsDisabled = false;
await crud.createNotification(notification);
assert.deepEqual([writes.length, sends.length], [1, 1]);
recipient.notificationChannels = { TASK_ASSIGNED: "off" };
await crud.createNotification(notification);
assert.deepEqual([writes.length, sends.length], [1, 1]);

const timers = new Map<number, () => Promise<void>>();
let timerId = 0;
const batcher = load("./dmBatcher.ts", {
  prisma, ...gate,
  setTimeout: (fn: () => Promise<void>) => { timers.set(++timerId, fn); return timerId; },
  clearTimeout: (id: number) => timers.delete(id),
});
const delivered: any[] = [];
batcher.initDmBatcher({ client: { chat: { postMessage: async (args: any) => { delivered.push(args); return { ok: true }; } } } });
recipient.notificationsDisabled = true;
await batcher.queueDm("U1", "Suppressed at enqueue");
assert.equal(timers.size, 0);
await batcher.sendSlackDmNow("U1", "Suppressed immediate send");
assert.equal(delivered.length, 0);
recipient.notificationsDisabled = false;
await batcher.queueDm("U1", "Queued while enabled");
assert.equal(timers.size, 1);
recipient.notificationsDisabled = true;
await batcher.flushDm("U1");
assert.equal(delivered.length, 0);
recipient.notificationsDisabled = false;
await batcher.flushDm("U1");
assert.equal(delivered.length, 0); // Suppressed messages are discarded, not replayed.
await batcher.queueDm("U1", "New notification after opt-in");
await batcher.flushDm("U1");
assert.equal(delivered.length, 1);

// Exercise the actual preferences handler: default-off members must be able
// to opt in while the UI sends null to clear disabled quiet hours.
const memberSource = readFileSync(new URL("../api/members.ts", import.meta.url), "utf8");
const handlerStart = memberSource.indexOf('membersRouter.patch("/me/notification-preferences"');
const handlerEnd = memberSource.indexOf('\n});', handlerStart) + '\n});'.length;
let preferencesHandler: any;
let preferenceWrite: any;
const handlerCode = ts.transpileModule(memberSource.slice(handlerStart, handlerEnd), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("membersRouter", "prisma", handlerCode)(
  { patch: (_path: string, handler: any) => { preferencesHandler = handler; } },
  { member: { update: async (args: any) => { preferenceWrite = args; return args.data; } } },
);
let responseStatus = 200;
const response = { status: (code: number) => { responseStatus = code; return response; }, json: () => {} };
await preferencesHandler({ memberId: "m1", body: { notificationsDisabled: false, quietHoursStart: null, quietHoursEnd: null } }, response);
assert.equal(responseStatus, 200);
assert.deepEqual(preferenceWrite.data, { notificationsDisabled: false, quietHoursStart: null, quietHoursEnd: null });
preferenceWrite = null;
await preferencesHandler({ memberId: "m1", body: { notificationsDisabled: "false" } }, response);
assert.equal(responseStatus, 400);
assert.equal(preferenceWrite, null);
console.log("notificationGate: defaults, opt-in, routing, Slack mirrors and queued DM suppression passed");
