import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerProjectTools, type ProjectTaskRow } from "./projects.js";
import { createMcpContext, createGrantRateLimiter, type VerifiedAccess, type AccessibleProject } from "../context.js";
import { OAuthError } from "../../services/oauthCore.js";
import type { ProjectContext } from "../../services/projectContextService.js";

let passed = 0;
async function test(name: string, run: () => unknown) { await run(); passed++; console.log(`PASS ${name}`); }

type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>;
const resource = "https://api.example.test/mcp", token = "A".repeat(43);
const NOW = new Date("2026-11-13T12:00:00Z");

function task(id: string, projectId: string, extra: Partial<ProjectTaskRow> = {}): ProjectTaskRow {
  return { id, projectId, title: `Title ${id}`, status: "TODO", priority: "MEDIUM", dueDate: null, updatedAt: NOW,
    storyPoints: null, estimatedHours: null, assignees: [], parentTask: null, milestone: null, blockedBy: [], blockers: [], subtasks: [], ...extra } as ProjectTaskRow;
}
function context(projectId: string): ProjectContext {
  return { project: { id: projectId, name: `Name ${projectId}`, description: null, type: "TEAM", targetDate: null },
    velocity: { windowDays: 28, tasksCompleted: 0, pointsCompleted: 0, tasksPerWeek: 0, pointsPerWeek: 0 },
    unassignedOpen: { tasks: 0, highPriority: 0, storyPoints: 0, estimatedHours: 0 },
    tasks: ["t1", "t2", "t3"].map(id => ({ id }) as ProjectContext["tasks"][number]), milestones: [], members: [], recentActivity: [], activeBlockers: [], rollupProjects: [], truncated: false };
}

function world(options: { admin?: boolean; current?: string[]; granted?: string[]; leads?: string[] } = {}) {
  const current = options.current ?? ["p1", "p2"], granted = options.granted ?? ["p1"];
  const built: string[] = [], loaded: string[][] = [];
  const verify = async () => ({ token, clientId: "client", scopes: ["constellation.read"], expiresAt: Math.floor(NOW.getTime() / 1000) + 3600,
    resource: new URL(resource), extra: {},
    grant: { id: "g", clientId: "client", memberId: "m", scopes: ["constellation.read"], projectIds: granted, revokedAt: null,
      client: { clientId: "client", name: "Claude", redirectUris: [], createdAt: NOW } },
    member: { id: "m", isAdmin: options.admin ?? false, isBot: false, deactivatedAt: null } }) as unknown as VerifiedAccess;
  const listProjects = async () => current.map(id => ({ id, name: `Name ${id}`, status: "ACTIVE",
    members: (options.leads ?? []).includes(id) ? [{ isLead: true }] : [{ isLead: false }] })) as AccessibleProject[];
  const ctx = createMcpContext(token, { verifyAccessToken: verify, listProjects, resource,
    limiter: createGrantRateLimiter({ now: () => NOW.getTime() }), now: () => NOW.getTime() });
  const rows = [
    task("t1", "p1", { assignees: [{ id: "m", displayName: "Me" }], dueDate: new Date("2026-11-10T00:00:00Z") }),
    task("t2", "p1", { assignees: [{ id: "m", displayName: "Me" }], dueDate: new Date("2026-11-15T00:00:00Z") }),
    task("t3", "p2", { assignees: [{ id: "m", displayName: "Me" }], title: "Secret other project" }),
  ];
  const handlers = new Map<string, Handler>();
  const server = { registerTool: (name: string, _config: unknown, handler: Handler) => { handlers.set(name, handler); } } as unknown as McpServer;
  registerProjectTools(server, ctx, {
    buildContext: async id => { built.push(id); return context(id); },
    loadTasks: async ids => { loaded.push(ids); return rows.filter(r => ids.includes(r.projectId)); },
    loadPlanFormat: async () => "FORMAT",
    now: () => NOW,
  });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await handlers.get(name)!(args);
    return { result, body: JSON.parse((result.content[0] as { text: string }).text) };
  };
  return { call, built, loaded, handlers };
}

await test("list_my_projects returns only granted projects the member can still open", async () => {
  const w = world({ current: ["p1", "p2"], granted: ["p1", "p3"] });
  const { body } = await w.call("list_my_projects");
  assert.deepEqual(body.projects.map((p: { projectId: string }) => p.projectId), ["p1"]);
  assert.deepEqual(w.built, ["p1"]);
  assert.deepEqual(w.loaded, [["p1"]]);
  assert.equal(body.projects[0].untrusted.kind, "untrusted_member_data");
});
await test("get_project_snapshot refuses ungranted or no-longer-accessible projects before loading context", async () => {
  for (const projectId of ["p2", "p3"]) {
    const w = world({ current: ["p1", "p2"], granted: ["p1", "p3"] });
    const { result, body } = await w.call("get_project_snapshot", { projectId });
    assert.equal(result.isError, true);
    assert.equal(body.error.status, 403);
    assert.deepEqual(w.built, []); assert.deepEqual(w.loaded, []);
  }
});
await test("get_project_snapshot wraps member-authored text as untrusted data", async () => {
  const w = world();
  const { body } = await w.call("get_project_snapshot", { projectId: "p1" });
  assert.equal(body.projectId, "p1");
  assert.equal(body.openTaskCount, 2);
  assert.equal(body.untrusted.kind, "untrusted_member_data");
  assert.match(body.untrusted.content.snapshot, /Title t1/);
});
await test("get_my_dashboard never includes work from ungranted projects", async () => {
  const w = world({ current: ["p1", "p2"], granted: ["p1"] });
  const { body } = await w.call("get_my_dashboard");
  assert.deepEqual(body.tasks.map((t: { taskId: string }) => t.taskId), ["t1", "t2"]);
  assert.equal(JSON.stringify(body).includes("Secret other project"), false);
  assert.equal(body.counts.overdue, 1);
  assert.equal(body.counts.dueWithin7Days, 1);
  assert.deepEqual(body.managedProjects, []);
});
await test("get_my_dashboard reports risk lines for led projects only", async () => {
  const w = world({ current: ["p1", "p2"], granted: ["p1", "p2"], leads: ["p2"] });
  const { body } = await w.call("get_my_dashboard");
  assert.deepEqual(body.managedProjects.map((p: { projectId: string; role: string }) => [p.projectId, p.role]), [["p2", "lead"]]);
});
await test("unexpected failures never leak internal error text", async () => {
  const w = world();
  const handlers = new Map<string, Handler>();
  const server = { registerTool: (name: string, _c: unknown, h: Handler) => { handlers.set(name, h); } } as unknown as McpServer;
  const ctx = { resolve: async () => { throw new Error("postgres://secret"); }, authorizeProject: async () => { throw new OAuthError("x", "y"); } };
  registerProjectTools(server, ctx as never, { now: () => NOW });
  const result = await handlers.get("list_my_projects")!({});
  assert.equal(result.isError, true);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.ok(w.handlers.has("get_plan_format"));
  assert.equal((await w.call("get_plan_format")).body.format, "FORMAT");
});

console.log(`\n${passed} passed`);
