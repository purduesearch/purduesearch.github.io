import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { TaskPatch, MutationResult } from "./taskMutationService.js";

// Run the actual service with offline boundaries, including its lazy imports.
const source = readFileSync(new URL("./taskMutationService.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(editable = true) {
  const tasks: Record<string, any> = {
    parent: { id: "parent", projectId: "project", status: "TODO", title: "Parent", assignees: [], tags: [], attachments: [], subtasks: [], blockers: [], blockedBy: [] },
  };
  const writes: { id: string; data: any }[] = [];
  const notices: any[] = [];
  const audits: any[] = [];
  const taskService = {
    getTask: async (id: string) => tasks[id],
    updateTask: async (id: string, data: any) => {
      writes.push({ id, data });
      for (const [key, value] of Object.entries(data)) if (value !== undefined) tasks[id][key] = value;
      return { ...tasks[id] };
    },
    createSubtask: async (id: string, data: any) => {
      const child = { ...tasks.parent, id: "created", ...data, assignees: [], subtasks: [] };
      tasks.created = child; tasks[id].subtasks.push(child); return child;
    },
    assertCanComplete: (task: any) => task.blockers.some((b: any) => b.blocker.resolvedAt === null) ? "Blocked" : null,
    assertNotCategoryBlocked: () => null,
  };
  const deps: Record<string, any> = {
    "../db/prisma.js": { prisma: {
      blocker: { findMany: async ({ where }: any) => where.id.in.filter((id: string) => id === "active").map((id: string) => ({ id })) },
      taskBlocker: { delete: async ({ where }: any) => { tasks.parent.blockers = tasks.parent.blockers.filter((b: any) => b.blockerId !== where.taskId_blockerId.blockerId); } },
      memberAchievement: { findMany: async () => [] },
    } },
    "../middleware/taskAccess.js": { getTaskPermissions: async (_actor: string, id: string) => ({ canEdit: editable && id !== "forbidden" }) },
    "./taskService.js": taskService,
    "./taskCompletionService.js": { assertCiGatePasses: async () => null },
    "./activityService.js": { diffObjects: () => [], logAuditEvent: async (event: any) => { audits.push(event); } },
    "./notificationCrud.js": { createNotification: async (notice: any) => { notices.push(notice); } },
    "./timeLogService.js": {}, "./mentionService.js": {},
    "./taskChangeBus.js": { emitTaskChanged: () => {} },
    "./milestoneService.js": { refreshMilestoneHealth: async () => {} },
    "./challengeService.js": { recordEvent: async () => [] },
    "./blockerMutationService.js": {
      createBlockerAsMember: async () => ({ id: "new" }),
      attachBlockerAsMember: async (_actor: string, _id: string, { blockerId }: any) => {
        tasks.parent.blockers.push({ blockerId, blocker: { resolvedAt: null } }); tasks.parent.status = "BLOCKED";
      },
    },
  };
  const exports: any = {};
  runInNewContext(js, { exports, require: (name: string) => {
    assert.ok(name in deps, `Unexpected boundary ${name}`); return deps[name];
  }, Date, console });
  return { tasks, writes, notices, audits, update: exports.updateTaskAsMember as (actor: string, id: string, patch: TaskPatch, source: string) => Promise<MutationResult> };
}

test("full modal metadata and recurrence reach the shared write; tagIds overrides legacy tags", async () => {
  const f = fixture();
  await f.update("actor", "parent", { milestoneId: "milestone", tagIds: ["new"], tags: ["old"], estimatedHours: 2.5,
    storyPoints: 3, isRecurring: true, recurrencePattern: "WEEKLY", recurrenceEndDate: "2026-12-31",
    parentTaskId: "ancestor", recurringInterval: null, recurringParentId: null }, "SLACK");
  const data = f.writes[0].data;
  assert.deepEqual(Array.from(data.tags), ["new"]);
  assert.equal(data.milestoneId, "milestone"); assert.equal(data.estimatedHours, 2.5); assert.equal(data.storyPoints, 3);
  assert.equal(data.isRecurring, true); assert.equal(data.recurrencePattern, "WEEKLY");
  assert.equal(data.recurrenceEndDate.toISOString(), "2026-12-31T00:00:00.000Z"); assert.equal(data.parentTaskId, "ancestor");
  await f.update("actor", "parent", { milestoneId: null, tags: [], estimatedHours: null, storyPoints: null,
    recurrencePattern: null, recurrenceEndDate: null, isRecurring: false }, "WEB");
  assert.equal(f.writes[1].data.estimatedHours, null); assert.equal(f.writes[1].data.recurrenceEndDate, null);
  assert.equal(f.writes[1].data.milestoneId, null); assert.equal(f.writes[1].data.tags.length, 0);
});

test("permission refusal stops metadata and child writes", async () => {
  const f = fixture(false);
  await assert.rejects(f.update("actor", "parent", { estimatedHours: 3, subtasks: [{ title: "Child" }] }, "SLACK"), { status: 403 });
  assert.equal(f.writes.length, 0); assert.equal(f.tasks.parent.subtasks.length, 0);
});

test("legacy dependency, attachment and due date forwarding retain REST semantics", async () => {
  const f = fixture();
  await f.update("actor", "parent", { blockingTaskIds: ["dependency"], blockingTaskReasons: { dependency: "Waiting" },
    dueDate: null, attachments: [{ url: "example.com/design", label: " Design " }] }, "WEB");
  const data = f.writes[0].data;
  assert.deepEqual(Array.from(data.blockedByIds), ["dependency"]);
  assert.equal(data.blockedByReasons.dependency, "Waiting");
  assert.equal(data.dueDate, undefined);
  assert.equal(data.attachments[0].url, "https://example.com/design");
  assert.equal(data.attachments[0].label, "Design");
  assert.equal(f.tasks.parent.blockers.length, 0);
  assert.equal(f.tasks.parent.subtasks.length, 0);
});

test("subtask upserts preserve omitted children and assign the actor as creator", async () => {
  const f = fixture();
  const child = { ...f.tasks.parent, id: "child", title: "Old", subtasks: [] };
  f.tasks.child = child; f.tasks.parent.subtasks = [child, { id: "keep", title: "Untouched" }];
  const result = await f.update("actor", "parent", { subtasks: [{ id: "child", title: "Edited" }, { title: "New" }] }, "SLACK");
  assert.equal(f.tasks.child.title, "Edited"); assert.equal(f.tasks.created.createdById, "actor");
  assert.equal(result.task.subtasks.length, 3); assert.equal(result.task.subtasks[1].title, "Untouched");
});

test("foreign or forbidden children fail before updating the parent", async () => {
  const f = fixture();
  await assert.rejects(f.update("actor", "parent", { subtasks: [{ id: "other", title: "Edit" }] }, "SLACK"), { status: 400 });
  f.tasks.parent.subtasks = [{ id: "forbidden" }];
  await assert.rejects(f.update("actor", "parent", { subtasks: [{ id: "forbidden", title: "Edit" }] }, "SLACK"), { status: 403 });
  assert.equal(f.writes.length, 0);
});

test("category blocker replacement validates scope, attaches via shared service, and clears BLOCKED on detach", async () => {
  const f = fixture();
  await assert.rejects(f.update("actor", "parent", { blockerIds: ["other-project"] }, "SLACK"), { status: 400 });
  assert.equal(f.writes.length, 0);
  await f.update("actor", "parent", { blockerIds: ["active"] }, "SLACK");
  assert.equal(f.tasks.parent.status, "BLOCKED");
  await f.update("actor", "parent", { blockerIds: [] }, "SLACK");
  assert.equal(f.tasks.parent.status, "TODO"); assert.equal(f.tasks.parent.blockers.length, 0);
  assert.ok(f.audits.some(e => e.eventType === "TASK_BLOCKER_DETACHED"));
});

test("new blockers cannot accompany completion and are attached through the shared blocker service", async () => {
  const f = fixture();
  await assert.rejects(f.update("actor", "parent", { newBlocker: "Waiting", status: "DONE" }, "SLACK"), { status: 400 });
  assert.equal(f.writes.length, 0);
  await f.update("actor", "parent", { newBlocker: "Waiting" }, "SLACK");
  assert.equal(f.tasks.parent.blockers[0].blockerId, "new"); assert.equal(f.tasks.parent.status, "BLOCKED");
});
