import { prisma } from "../db/prisma.js";
import { OAuthError } from "../services/oauthCore.js";
import { oauthService, listAccessibleProjects, type OAuthService } from "../services/oauthService.js";

export type VerifiedAccess = Awaited<ReturnType<OAuthService["verifyAccessToken"]>>;
export type AccessibleProject = Awaited<ReturnType<typeof listAccessibleProjects>>[number];
export type McpRateKind = "read" | "preview" | "execute" | "log";
const HOUR_MS = 3_600_000;
const LIMITS: Record<McpRateKind, number> = { read: 60, preview: 30, execute: 10, log: 20 };

/** Process-local, bounded grant quotas. There is no timer or token material in this store. */
export function createGrantRateLimiter(options: { now?: () => number; maxGrants?: number } = {}) {
  const now = options.now ?? Date.now;
  const buckets = new Map<string, { until: number; read: number; preview: number; execute: number; log: number }>();
  return {
    consume(grantId: string, kind: McpRateKind) {
      const at = now();
      let bucket = buckets.get(grantId);
      if (!bucket || bucket.until <= at) {
        if (buckets.size >= (options.maxGrants ?? 10_000)) {
          for (const [id, candidate] of buckets) if (candidate.until <= at) buckets.delete(id);
        }
        if (!bucket && buckets.size >= (options.maxGrants ?? 10_000)) throw new OAuthError("temporarily_unavailable", "Connector quota capacity is unavailable", 429);
        bucket = { until: at + HOUR_MS, read: 0, preview: 0, execute: 0, log: 0 };
        buckets.set(grantId, bucket);
      }
      if (bucket[kind] >= LIMITS[kind]) throw new OAuthError("rate_limit_exceeded", "This connection's hourly tool limit has been reached", 429);
      bucket[kind]++;
    },
  };
}
export type GrantRateLimiter = ReturnType<typeof createGrantRateLimiter>;
const sharedLimiter = createGrantRateLimiter();

export interface McpResolvedContext {
  grant: VerifiedAccess["grant"];
  member: VerifiedAccess["member"];
  clientName: string;
  projects: AccessibleProject[];
  projectIds: string[];
}
export interface McpResolveOptions {
  scope?: string;
  projectId?: string;
  admin?: boolean;
  /** Omit only for an authorization check that does not itself represent a tool call. */
  rate?: McpRateKind | false;
}
export interface McpContextDependencies {
  verifyAccessToken?: (token: string) => Promise<VerifiedAccess>;
  listProjects?: (memberId: string) => Promise<AccessibleProject[]>;
  limiter?: GrantRateLimiter;
  resource?: string;
  now?: () => number;
}

export function assertScope(access: Pick<McpResolvedContext, "grant">, scope: string) {
  if (!access.grant.scopes.includes(scope)) throw new OAuthError("insufficient_scope", "This connection does not have the required permission", 403);
}
export function assertAdmin(access: Pick<McpResolvedContext, "member">) {
  if (!access.member.isAdmin) throw new OAuthError("access_denied", "Project changes require current administrator permissions", 403);
}

/** A fresh credential, grant, member and project read on EVERY tool invocation. */
export function createMcpContext(token: string, deps: McpContextDependencies = {}) {
  const verify = deps.verifyAccessToken ?? oauthService.verifyAccessToken;
  const projects = deps.listProjects ?? (memberId => listAccessibleProjects(prisma, memberId));
  const resource = deps.resource ?? oauthService.config.resource;
  const limiter = deps.limiter ?? sharedLimiter;
  async function authorizationRead<T>(read: () => Promise<T>): Promise<T> {
    try { return await read(); }
    catch (error) {
      if (error instanceof OAuthError) throw error;
      throw new OAuthError("temporarily_unavailable", "Connection authorization is unavailable", 503);
    }
  }
  async function resolve(options: McpResolveOptions = {}): Promise<McpResolvedContext> {
    const verified = await authorizationRead(() => verify(token));
    const at = (deps.now ?? Date.now)();
    if (!verified.expiresAt || verified.expiresAt * 1000 <= at || verified.resource?.href !== resource
      || verified.grant.revokedAt || verified.member.deactivatedAt || verified.member.isBot
      || verified.member.id !== verified.grant.memberId || verified.clientId !== verified.grant.clientId) {
      throw new OAuthError("invalid_token", "Connection credentials are unavailable", 401);
    }
    const currentProjects = await authorizationRead(() => projects(verified.member.id));
    const allowed = new Set(verified.grant.projectIds);
    const filtered = currentProjects.filter(project => allowed.has(project.id));
    const access: McpResolvedContext = { grant: verified.grant, member: verified.member,
      clientName: verified.grant.client.name, projects: filtered, projectIds: filtered.map(project => project.id) };
    assertScope(access, "constellation.read");
    if (options.scope) assertScope(access, options.scope);
    if (options.admin) assertAdmin(access);
    if (options.projectId !== undefined && !access.projectIds.includes(options.projectId)) {
      throw new OAuthError("access_denied", "Project is unavailable to this connection", 403);
    }
    if (options.rate !== false) limiter.consume(access.grant.id, options.rate ?? "read");
    return access;
  }
  return { resolve, authorizeProject: (projectId: string, options: Omit<McpResolveOptions, "projectId"> = {}) => resolve({ ...options, projectId }) };
}
export type McpContext = ReturnType<typeof createMcpContext>;
