import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const routeSource = readFileSync(new URL("../api/tasks.ts", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("./taskMutationService.ts", import.meta.url), "utf8");
const patchStart = routeSource.indexOf('tasksRouter.patch("/:id", channelAuth');
const patchEnd = routeSource.indexOf('tasksRouter.get("/:id"', patchStart);
const patchRoute = routeSource.slice(patchStart, patchEnd);

test("PATCH delegates task rules to the member mutation service", () => {
  assert.ok(patchStart >= 0 && patchEnd > patchStart);
  assert.match(patchRoute, /updateTaskAsMember\(req\.memberId!, taskId, req\.body as TaskPatch, "WEB"\)/);
  assert.doesNotMatch(patchRoute, /assertCanComplete\(/);
  assert.doesNotMatch(patchRoute, /applyCompletionSideEffects\(/);
  assert.match(serviceSource, /assertCanComplete\(/);
  assert.match(serviceSource, /applyCompletionSideEffects\(/);
});

test("TaskMutationError preserves HTTP status and message without loading the DB", () => {
  const declaration = serviceSource.match(/export class TaskMutationError extends Error \{[\s\S]*?\n\}/)?.[0];
  assert.ok(declaration);
  assert.match(declaration, /constructor\(public status: number, message: string\)/);
  const js = declaration
    .replace("export class", "class")
    .replace("public status: number, message: string", "status, message")
    .replace("super(message);", "super(message); this.status = status;");
  const error = runInNewContext(`${js}; new TaskMutationError(409, "CI failed")`) as Error & { status: number };
  assert.equal(error.status, 409);
  assert.equal(error.message, "CI failed");
});

test("PATCH preserves the response fields and translates service errors", () => {
  assert.match(patchRoute, /const responseBody: any = \{ \.\.\.task \}/);
  assert.match(patchRoute, /Object\.assign\(responseBody, actorReward\)/);
  assert.match(patchRoute, /responseBody\.progressMilestones = progressMilestones/);
  assert.match(patchRoute, /responseBody\.achievementUnlocks = achievementUnlocks/);
  assert.match(patchRoute, /error instanceof TaskMutationError/);
  assert.match(patchRoute, /res\.status\(error\.status\)\.json\(\{ error: error\.message \}\)/);
});

test("shared mutation preserves gates, assignment notices, and circular-error status", () => {
  assert.match(serviceSource, /getTaskPermissions\(actorId, taskId\)/);
  assert.match(serviceSource, /assertNotCategoryBlocked\(/);
  assert.match(serviceSource, /assertCiGatePasses\(/);
  assert.match(serviceSource, /type: "TASK_ASSIGNED"/);
  assert.match(serviceSource, /refreshMilestoneHealth\(/);
  assert.match(serviceSource, /memberAchievement\.findMany\(/);
  assert.match(serviceSource, /includes\("circular"\)/);
  assert.match(serviceSource, /new TaskMutationError\(400, error\.message\)/);
  assert.doesNotMatch(serviceSource, /source: "WEB"/);
});
