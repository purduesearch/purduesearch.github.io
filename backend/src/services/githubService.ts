import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { prisma } from "../db/prisma.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";

// GitHub integration — mirrors driveService.ts in shape (module-level
// functions, try/catch returning null on failure). All free-tier APIs:
// REST + OAuth + GitHub App. No GraphQL, no Advanced Security, no Actions
// execution. Caching keeps us comfortably under the 5,000 req/hr floor.

// ── In-memory TTL cache (mirrors geminiService pattern) ──────

type CacheEntry<T> = { value: T; expires: number };
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

// ── Auth helpers ─────────────────────────────────────────────

function appPrivateKey(): string | null {
  const b64 = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!b64) return null;
  return Buffer.from(b64, "base64").toString("utf8");
}

function isAppConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && appPrivateKey());
}

/** Octokit authenticated as the GitHub App itself (no installation). */
export function appOctokit(): Octokit | null {
  if (!isAppConfigured()) return null;
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey: appPrivateKey()!,
    },
  });
}

/** Octokit authenticated as a specific App installation (per-org/per-repo). */
export function octokitForInstallation(installationId: number): Octokit | null {
  if (!isAppConfigured()) return null;
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey: appPrivateKey()!,
      installationId,
    },
  });
}

/** Octokit authenticated as a specific ClubPM member via stored OAuth token. */
export async function octokitForMember(memberId: string): Promise<Octokit | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { githubAccessToken: true },
  });
  const token = decryptSecret(member?.githubAccessToken);
  if (!token) return null;
  return new Octokit({ auth: token });
}

/**
 * Pick the best Octokit for a project's repo.
 * Preference: installation (highest rate-limit ceiling, no user-budget burn)
 *   → caller's OAuth → null.
 */
export async function octokitForProject(
  projectId: string,
  fallbackMemberId?: string
): Promise<Octokit | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { githubInstallId: true },
  });
  if (project?.githubInstallId) {
    const o = octokitForInstallation(project.githubInstallId);
    if (o) return o;
  }
  if (fallbackMemberId) return octokitForMember(fallbackMemberId);
  return null;
}

// ── URL / identifier parsers ─────────────────────────────────

export type RepoRef = { owner: string; repo: string };

/**
 * Accepts any of:
 *   - "owner/repo"
 *   - "https://github.com/owner/repo"
 *   - "https://github.com/owner/repo.git"
 *   - "git@github.com:owner/repo.git"
 *   - "https://github.com/owner/repo/anything..."
 */
export function parseRepoUrl(input: string): RepoRef | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Plain "owner/repo"
  const plain = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(trimmed);
  if (plain) return { owner: plain[1], repo: plain[2] };
  // SSH form
  const ssh = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(trimmed);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  // HTTPS form
  const https =
    /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i.exec(trimmed);
  if (https) return { owner: https[1], repo: https[2] };
  return null;
}

/** Build the "owner/repo" canonical form. */
export function repoSlug(ref: RepoRef): string {
  return `${ref.owner}/${ref.repo}`;
}

// ── Encrypted-token persistence ──────────────────────────────

export async function saveMemberGithubAuth(
  memberId: string,
  data: {
    login: string;
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
  }
): Promise<void> {
  await prisma.member.update({
    where: { id: memberId },
    data: {
      githubLogin: data.login,
      githubAccessToken: encryptSecret(data.accessToken),
      githubRefreshToken: encryptSecret(data.refreshToken ?? null),
      githubTokenExpiresAt: data.expiresAt ?? null,
    },
  });
}

export async function clearMemberGithubAuth(memberId: string): Promise<void> {
  await prisma.member.update({
    where: { id: memberId },
    data: {
      githubLogin: null,
      githubAccessToken: null,
      githubRefreshToken: null,
      githubTokenExpiresAt: null,
    },
  });
}

// ── Repo metadata ────────────────────────────────────────────

export type RepoStats = {
  fullName: string;
  htmlUrl: string;
  description: string | null;
  defaultBranch: string;
  visibility: string;
  stars: number;
  forks: number;
  openIssues: number;
  pushedAt: string | null;
  language: string | null;
};

/** Cached 10 min. Returns null on 404 / auth failure. */
export async function getRepoStats(
  octokit: Octokit,
  ref: RepoRef
): Promise<RepoStats | null> {
  const key = `repo:${repoSlug(ref)}`;
  const hit = cacheGet<RepoStats>(key);
  if (hit) return hit;
  try {
    const { data } = await octokit.repos.get({ owner: ref.owner, repo: ref.repo });
    const stats: RepoStats = {
      fullName: data.full_name,
      htmlUrl: data.html_url,
      description: data.description,
      defaultBranch: data.default_branch,
      visibility: data.visibility ?? (data.private ? "private" : "public"),
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      pushedAt: data.pushed_at,
      language: data.language,
    };
    return cacheSet(key, stats, 10 * 60 * 1000);
  } catch (err) {
    console.error("[githubService] getRepoStats error:", err);
    return null;
  }
}

// ── Issue / PR / branch / commit listings ────────────────────

export type IssueSummary = {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  author: string | null;
  authorAvatar: string | null;
  labels: { name: string; color: string }[];
  assignees: { login: string; avatarUrl: string }[];
  comments: number;
  updatedAt: string;
};

export async function listIssues(
  octokit: Octokit,
  ref: RepoRef,
  opts: { state?: "open" | "closed" | "all"; labels?: string; assignee?: string; perPage?: number } = {}
): Promise<IssueSummary[]> {
  try {
    const { data } = await octokit.issues.listForRepo({
      owner: ref.owner,
      repo: ref.repo,
      state: opts.state ?? "open",
      labels: opts.labels,
      assignee: opts.assignee,
      per_page: opts.perPage ?? 30,
    });
    // Filter out PRs (the issues API returns both)
    return data
      .filter(i => !(i as any).pull_request)
      .map(i => ({
        number: i.number,
        title: i.title,
        state: i.state as "open" | "closed",
        url: i.html_url,
        author: i.user?.login ?? null,
        authorAvatar: i.user?.avatar_url ?? null,
        labels: (i.labels ?? []).map((l: any) =>
          typeof l === "string"
            ? { name: l, color: "808080" }
            : { name: l.name ?? "", color: l.color ?? "808080" }
        ),
        assignees: (i.assignees ?? []).map(a => ({
          login: a.login,
          avatarUrl: a.avatar_url,
        })),
        comments: i.comments,
        updatedAt: i.updated_at,
      }));
  } catch (err) {
    console.error("[githubService] listIssues error:", err);
    return [];
  }
}

export type IssueDetail = IssueSummary & {
  body: string | null;
  createdAt: string;
  closedAt: string | null;
};

export async function getIssue(
  octokit: Octokit,
  ref: RepoRef,
  number: number
): Promise<IssueDetail | null> {
  try {
    const { data } = await octokit.issues.get({
      owner: ref.owner,
      repo: ref.repo,
      issue_number: number,
    });
    return {
      number: data.number,
      title: data.title,
      state: data.state as "open" | "closed",
      url: data.html_url,
      author: data.user?.login ?? null,
      authorAvatar: data.user?.avatar_url ?? null,
      labels: (data.labels ?? []).map((l: any) =>
        typeof l === "string"
          ? { name: l, color: "808080" }
          : { name: l.name ?? "", color: l.color ?? "808080" }
      ),
      assignees: (data.assignees ?? []).map(a => ({
        login: a.login,
        avatarUrl: a.avatar_url,
      })),
      comments: data.comments,
      updatedAt: data.updated_at,
      body: data.body ?? null,
      createdAt: data.created_at,
      closedAt: data.closed_at,
    };
  } catch (err) {
    console.error("[githubService] getIssue error:", err);
    return null;
  }
}

export type PrSummary = {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  url: string;
  author: string | null;
  authorAvatar: string | null;
  headRef: string;
  baseRef: string;
  updatedAt: string;
};

export async function listPulls(
  octokit: Octokit,
  ref: RepoRef,
  opts: { state?: "open" | "closed" | "all"; perPage?: number } = {}
): Promise<PrSummary[]> {
  try {
    const { data } = await octokit.pulls.list({
      owner: ref.owner,
      repo: ref.repo,
      state: opts.state ?? "open",
      per_page: opts.perPage ?? 30,
    });
    return data.map(p => ({
      number: p.number,
      title: p.title,
      state: p.state as "open" | "closed",
      merged: Boolean(p.merged_at),
      draft: Boolean(p.draft),
      url: p.html_url,
      author: p.user?.login ?? null,
      authorAvatar: p.user?.avatar_url ?? null,
      headRef: p.head.ref,
      baseRef: p.base.ref,
      updatedAt: p.updated_at,
    }));
  } catch (err) {
    console.error("[githubService] listPulls error:", err);
    return [];
  }
}

export type PrDetail = PrSummary & {
  body: string | null;
  reviewState: "APPROVED" | "CHANGES_REQUESTED" | "PENDING" | "COMMENTED" | "NONE";
  checksStatus: "success" | "failure" | "pending" | "none";
  additions: number;
  deletions: number;
  changedFiles: number;
};

export async function getPull(
  octokit: Octokit,
  ref: RepoRef,
  number: number
): Promise<PrDetail | null> {
  try {
    const { data } = await octokit.pulls.get({
      owner: ref.owner,
      repo: ref.repo,
      pull_number: number,
    });
    // Combine review and CI status (best-effort, ignore errors)
    let reviewState: PrDetail["reviewState"] = "NONE";
    try {
      const { data: reviews } = await octokit.pulls.listReviews({
        owner: ref.owner,
        repo: ref.repo,
        pull_number: number,
      });
      if (reviews.length) {
        // Most-recent non-COMMENTED review wins
        for (let i = reviews.length - 1; i >= 0; i--) {
          const s = reviews[i].state;
          if (s === "APPROVED" || s === "CHANGES_REQUESTED" || s === "PENDING" || s === "COMMENTED") {
            reviewState = s as PrDetail["reviewState"];
            if (s !== "COMMENTED") break;
          }
        }
      }
    } catch { /* ignore */ }

    let checksStatus: PrDetail["checksStatus"] = "none";
    try {
      const { data: combined } = await octokit.repos.getCombinedStatusForRef({
        owner: ref.owner,
        repo: ref.repo,
        ref: data.head.sha,
      });
      const s = combined.state; // "success" | "failure" | "pending"
      if (s === "success" || s === "failure" || s === "pending") checksStatus = s;
    } catch { /* ignore */ }

    return {
      number: data.number,
      title: data.title,
      state: data.state as "open" | "closed",
      merged: Boolean(data.merged_at),
      draft: Boolean(data.draft),
      url: data.html_url,
      author: data.user?.login ?? null,
      authorAvatar: data.user?.avatar_url ?? null,
      headRef: data.head.ref,
      baseRef: data.base.ref,
      updatedAt: data.updated_at,
      body: data.body ?? null,
      reviewState,
      checksStatus,
      additions: data.additions,
      deletions: data.deletions,
      changedFiles: data.changed_files,
    };
  } catch (err) {
    console.error("[githubService] getPull error:", err);
    return null;
  }
}

export type BranchSummary = {
  name: string;
  sha: string;
  protected: boolean;
};

export async function listBranches(
  octokit: Octokit,
  ref: RepoRef,
  perPage = 50
): Promise<BranchSummary[]> {
  try {
    const { data } = await octokit.repos.listBranches({
      owner: ref.owner,
      repo: ref.repo,
      per_page: perPage,
    });
    return data.map(b => ({
      name: b.name,
      sha: b.commit.sha,
      protected: Boolean(b.protected),
    }));
  } catch (err) {
    console.error("[githubService] listBranches error:", err);
    return [];
  }
}

// ── File/folder contents ─────────────────────────────────────

export type ContentEntry = {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string;
  path: string;
  sha: string;
  size: number;
  htmlUrl: string | null;
};

export async function listContents(
  octokit: Octokit,
  ref: RepoRef,
  path: string
): Promise<ContentEntry[] | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: ref.owner,
      repo: ref.repo,
      path,
    });
    if (!Array.isArray(data)) return null; // single file — caller should use getFile
    return data.map(d => ({
      type: d.type as ContentEntry["type"],
      name: d.name,
      path: d.path,
      sha: d.sha,
      size: d.size,
      htmlUrl: d.html_url,
    }));
  } catch (err) {
    console.error("[githubService] listContents error:", err);
    return null;
  }
}

export type FileContent = {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: "utf8" | "base64";
  htmlUrl: string | null;
};

export async function getFile(
  octokit: Octokit,
  ref: RepoRef,
  path: string
): Promise<FileContent | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: ref.owner,
      repo: ref.repo,
      path,
    });
    if (Array.isArray(data) || data.type !== "file") return null;
    const raw = Buffer.from(data.content, data.encoding as BufferEncoding);
    // Try UTF-8; if invalid (binary), return base64.
    const text = raw.toString("utf8");
    const isProbablyBinary = text.includes(" ");
    return {
      name: data.name,
      path: data.path,
      sha: data.sha,
      size: data.size,
      content: isProbablyBinary ? data.content : text,
      encoding: isProbablyBinary ? "base64" : "utf8",
      htmlUrl: data.html_url,
    };
  } catch (err) {
    console.error("[githubService] getFile error:", err);
    return null;
  }
}

// ── Commits ──────────────────────────────────────────────────

export type CommitSummary = {
  sha: string;
  shortSha: string;
  message: string;
  author: string | null;
  authorAvatar: string | null;
  date: string | null;
  url: string;
};

// ── Milestones (Phase 4) ─────────────────────────────────────

export type MilestoneSummary = {
  number: number;
  title: string;
  description: string | null;
  state: "open" | "closed";
  dueOn: string | null;
  openIssues: number;
  closedIssues: number;
  url: string;
};

export async function listMilestones(
  octokit: Octokit,
  ref: RepoRef,
  state: "open" | "closed" | "all" = "all"
): Promise<MilestoneSummary[]> {
  try {
    const { data } = await octokit.issues.listMilestones({
      owner: ref.owner,
      repo: ref.repo,
      state,
      per_page: 100,
    });
    return data.map(m => ({
      number: m.number,
      title: m.title,
      description: m.description,
      state: m.state as "open" | "closed",
      dueOn: m.due_on,
      openIssues: m.open_issues,
      closedIssues: m.closed_issues,
      url: m.html_url,
    }));
  } catch (err) {
    console.error("[githubService] listMilestones error:", err);
    return [];
  }
}

export async function createMilestone(
  octokit: Octokit,
  ref: RepoRef,
  data: { title: string; description?: string | null; dueOn?: Date | null; state?: "open" | "closed" }
): Promise<MilestoneSummary | null> {
  try {
    const res = await octokit.issues.createMilestone({
      owner: ref.owner,
      repo: ref.repo,
      title: data.title,
      description: data.description ?? undefined,
      due_on: data.dueOn ? data.dueOn.toISOString() : undefined,
      state: data.state ?? "open",
    });
    const m = res.data;
    return {
      number: m.number,
      title: m.title,
      description: m.description,
      state: m.state as "open" | "closed",
      dueOn: m.due_on,
      openIssues: m.open_issues,
      closedIssues: m.closed_issues,
      url: m.html_url,
    };
  } catch (err) {
    console.error("[githubService] createMilestone error:", err);
    return null;
  }
}

export async function getMilestone(
  octokit: Octokit,
  ref: RepoRef,
  number: number
): Promise<MilestoneSummary | null> {
  try {
    const res = await octokit.issues.getMilestone({
      owner: ref.owner,
      repo: ref.repo,
      milestone_number: number,
    });
    const m = res.data;
    return {
      number: m.number,
      title: m.title,
      description: m.description,
      state: m.state as "open" | "closed",
      dueOn: m.due_on,
      openIssues: m.open_issues,
      closedIssues: m.closed_issues,
      url: m.html_url,
    };
  } catch (err) {
    console.error("[githubService] getMilestone error:", err);
    return null;
  }
}

// ── Contributors (Phase 4) ───────────────────────────────────

export type ContributorSummary = {
  login: string;
  avatarUrl: string | null;
  contributions: number;
};

export async function listRepoContributors(
  octokit: Octokit,
  ref: RepoRef
): Promise<ContributorSummary[]> {
  const key = `contribs:${repoSlug(ref)}`;
  const hit = cacheGet<ContributorSummary[]>(key);
  if (hit) return hit;
  try {
    const { data } = await octokit.repos.listContributors({
      owner: ref.owner,
      repo: ref.repo,
      per_page: 100,
    });
    const result = data
      .filter(c => c.type === "User" && c.login)
      .map(c => ({
        login: c.login as string,
        avatarUrl: c.avatar_url ?? null,
        contributions: c.contributions,
      }));
    return cacheSet(key, result, 60 * 60 * 1000); // 1h
  } catch (err) {
    console.error("[githubService] listRepoContributors error:", err);
    return [];
  }
}

export type MemberGhStats = {
  login: string;
  commits30d: number;
  prsOpened30d: number;
  reviews30d: number;
};

/**
 * Per-member 30-day activity on a single repo. Uses the Search API which is
 * authenticated-capped at 30 req/min and 1k results per query — fine for one
 * call per cache window. Result cached 1h per (repo, login).
 */
export async function getMemberRepoStats(
  octokit: Octokit,
  ref: RepoRef,
  login: string
): Promise<MemberGhStats> {
  const key = `memberStats:${repoSlug(ref)}:${login}`;
  const hit = cacheGet<MemberGhStats>(key);
  if (hit) return hit;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString().slice(0, 10);
  const repoQ = `repo:${ref.owner}/${ref.repo}`;
  const fallback: MemberGhStats = { login, commits30d: 0, prsOpened30d: 0, reviews30d: 0 };
  try {
    const [commits, prs, reviews] = await Promise.all([
      octokit.search.commits({
        q: `${repoQ} author:${login} committer-date:>=${sinceIso}`,
        per_page: 1,
        // @ts-ignore — preview header still recommended on older Octokit
        headers: { accept: "application/vnd.github.cloak-preview+json" },
      }).catch(() => null),
      octokit.search.issuesAndPullRequests({
        q: `${repoQ} type:pr author:${login} created:>=${sinceIso}`,
        per_page: 1,
      }).catch(() => null),
      octokit.search.issuesAndPullRequests({
        q: `${repoQ} type:pr reviewed-by:${login} updated:>=${sinceIso}`,
        per_page: 1,
      }).catch(() => null),
    ]);
    const result: MemberGhStats = {
      login,
      commits30d:    commits?.data.total_count    ?? 0,
      prsOpened30d:  prs?.data.total_count        ?? 0,
      reviews30d:    reviews?.data.total_count    ?? 0,
    };
    return cacheSet(key, result, 60 * 60 * 1000);
  } catch (err) {
    console.error("[githubService] getMemberRepoStats error:", err);
    return fallback;
  }
}

export async function listCommits(
  octokit: Octokit,
  ref: RepoRef,
  opts: { sha?: string; path?: string; perPage?: number } = {}
): Promise<CommitSummary[]> {
  try {
    const { data } = await octokit.repos.listCommits({
      owner: ref.owner,
      repo: ref.repo,
      sha: opts.sha,
      path: opts.path,
      per_page: opts.perPage ?? 30,
    });
    return data.map(c => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.commit.message,
      author: c.author?.login ?? c.commit.author?.name ?? null,
      authorAvatar: c.author?.avatar_url ?? null,
      date: c.commit.author?.date ?? null,
      url: c.html_url,
    }));
  } catch (err) {
    console.error("[githubService] listCommits error:", err);
    return [];
  }
}
