// Shared fakes for the MCP tool tests. Not a test file itself (no `.test.ts` suffix).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpContext, createGrantRateLimiter, type VerifiedAccess, type AccessibleProject, type McpContext } from "../context.js";

export type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>;
export const TEST_RESOURCE = "https://api.example.test/mcp";
const token = "A".repeat(43);

export interface FakeAccessOptions {
  now: Date;
  admin?: boolean;
  /** Projects the member can currently open. */
  current?: string[];
  /** Projects selected on the grant. */
  granted?: string[];
  leads?: string[];
  scopes?: string[];
  changeCursor?: string | null;
  grantId?: string;
}

export function fakeContext(options: FakeAccessOptions): McpContext {
  const current = options.current ?? ["p1", "p2"], granted = options.granted ?? ["p1"];
  const scopes = options.scopes ?? ["constellation.read"];
  const verify = async () => ({ token, clientId: "client", scopes, expiresAt: Math.floor(options.now.getTime() / 1000) + 3600,
    resource: new URL(TEST_RESOURCE), extra: {},
    grant: { id: options.grantId ?? "g", clientId: "client", memberId: "m", scopes, projectIds: granted, revokedAt: null,
      changeCursor: options.changeCursor ?? null, client: { clientId: "client", name: "Claude", redirectUris: [], createdAt: options.now } },
    member: { id: "m", isAdmin: options.admin ?? false, isBot: false, deactivatedAt: null } }) as unknown as VerifiedAccess;
  const listProjects = async () => current.map(id => ({ id, name: `Name ${id}`, status: "ACTIVE",
    members: [{ isLead: (options.leads ?? []).includes(id) }] })) as AccessibleProject[];
  return createMcpContext(token, { verifyAccessToken: verify, listProjects, resource: TEST_RESOURCE,
    limiter: createGrantRateLimiter({ now: () => options.now.getTime() }), now: () => options.now.getTime() });
}

/** Captures registered handlers so tests call tools without an HTTP transport. */
export function fakeServer() {
  const handlers = new Map<string, Handler>();
  const server = { registerTool: (name: string, _config: unknown, handler: Handler) => { handlers.set(name, handler); } } as unknown as McpServer;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`tool ${name} not registered`);
    const result = await handler(args);
    return { result, body: JSON.parse((result.content[0] as { text: string }).text) };
  };
  return { server, handlers, call };
}
