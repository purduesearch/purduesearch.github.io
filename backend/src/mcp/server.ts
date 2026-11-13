import { Router } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { oauthService } from "../services/oauthService.js";
import { createMcpBearerAuth, type AuthenticatedMcpRequest } from "./auth.js";
import { createMcpContext, type McpContext, type McpContextDependencies } from "./context.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerChangeTools } from "./tools/changes.js";
import { registerTaskTools } from "./tools/tasks.js";

export type McpToolRegistrar = (server: McpServer, context: McpContext) => void;
export function createMcpServer(context: McpContext, registerTools?: McpToolRegistrar) {
  const server = new McpServer({ name: "constellation", version: "1.0.0" }, { maxToolInputElements: 10_000 });
  server.registerTool("connection_status", {
    description: "Check that this Constellation connection is active. This tool does not read member-authored project content.",
    inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    await context.resolve();
    return { content: [{ type: "text", text: "Constellation connection is active." }] };
  });
  // Controller adds the project/task/plan registrars here as their phases land.
  registerProjectTools(server, context);
  registerChangeTools(server, context);
  registerTaskTools(server, context);
  registerTools?.(server, context);
  return server;
}

export interface McpRouterOptions extends McpContextDependencies {
  issuer?: string;
  frontendOrigin?: string;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  registerTools?: McpToolRegistrar;
}
export function createMcpRouter(options: McpRouterOptions = {}) {
  const router = Router();
  const issuer = options.issuer ?? oauthService.config.issuer;
  const hosts = new Set(options.allowedHosts ?? [new URL(issuer).host]);
  const origins = new Set(options.allowedOrigins ?? [new URL(issuer).origin, options.frontendOrigin ?? oauthService.config.frontendOrigin, "https://claude.ai"]);
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    // Do not derive metadata/issuer from Host or forwarded headers.
    if (!req.headers.host || !hosts.has(req.headers.host.toLowerCase()) || (req.headers.origin !== undefined && !origins.has(req.headers.origin))) {
      res.status(403).json({ error: "access_denied" }); return;
    }
    next();
  });
  router.use(createMcpBearerAuth({ verifyAccessToken: options.verifyAccessToken, issuer }));
  router.all("/", (req, res) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed" } }); return;
    }
    if (!req.is("application/json")) { res.status(415).json({ error: "invalid_request" }); return; }
    if (Buffer.byteLength(JSON.stringify(req.body) ?? "", "utf8") > 256 * 1024) { res.status(413).json({ error: "invalid_request" }); return; }
    // Batches are intentionally unsupported: every HTTP invocation owns one SDK server.
    if (Array.isArray(req.body)) { res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch requests are not supported" } }); return; }
    const token = (req as typeof req & AuthenticatedMcpRequest).mcpToken!;
    const context = createMcpContext(token, { ...options, resource: options.resource ?? `${issuer}/mcp` });
    const server = createMcpServer(context, options.registerTools);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 256 * 1024 });
    let closed = false;
    const cleanup = () => {
      if (closed) return; closed = true;
      void Promise.allSettled([transport.close(), server.close()]);
    };
    res.once("close", cleanup);
    void (async () => {
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        if (res.writableFinished) cleanup();
      } catch {
        if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "MCP request could not be completed" } });
        cleanup();
      }
    })();
  });
  return router;
}

export const mcpRouter = createMcpRouter();
