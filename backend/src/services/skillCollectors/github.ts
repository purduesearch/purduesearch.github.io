// GitHub -> artifacts: one per merged/closed pull request for its author, one per
// reviewer for review work. Commits are not artifacts (commit count is a weak
// signal and is easy to inflate). Raw diffs are never fetched or stored: only the
// file list with line counts, the PR description, and review states.

import type { Octokit } from "@octokit/rest";
import { prisma } from "../../db/prisma.js";
import { octokitForRepo } from "../githubService.js";
import { EXCLUDE_TRAINING } from "../trainingSandboxService.js";
import { enforceCap, isBotLogin, pullAuthorArtifact, pullReviewArtifact, type PullInput } from "../skillArtifactCore.js";
import { emptyResult, type CollectResult, type CollectWindow } from "./types.js";

export interface RepoRef { owner: string; repo: string }

export interface PullListing {
  number: number;
  title: string;
  body: string | null;
  url: string;
  authorLogin: string | null;
  merged: boolean;
  mergedAt: Date | null;
  closedAt: Date | null;
  draft: boolean;
}

/** The slice of GitHub this collector needs; faked in tests, Octokit in production. */
export interface GithubSource {
  /** Closed PRs whose close/merge time falls in (since, until], OLDEST first, at most `max` (truncated=true when more exist). */
  listClosedPulls(repo: RepoRef, since: Date, until: Date, max: number): Promise<{ pulls: PullListing[]; truncated: boolean }>;
  getPullStats(repo: RepoRef, number: number): Promise<{ additions: number; deletions: number; changedFiles: number; commits: number }>;
  getPullFiles(repo: RepoRef, number: number): Promise<{ filename: string; additions: number; deletions: number }[]>;
  getPullReviews(repo: RepoRef, number: number): Promise<{ login: string; state: string }[]>;
}

export interface RepoTarget { projectRepoId: string; slug: string; projectId: string; projectName: string | null }

const MAX_PAGES = 20;

export function octokitSource(octokit: Octokit): GithubSource {
  return {
    async listClosedPulls(repo, since, until, max) {
      const pulls: PullListing[] = [];
      let truncated = false;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { data } = await octokit.pulls.list({ ...repo, state: "closed", sort: "updated", direction: "desc", per_page: 50, page });
        if (!data.length) break;
        let stop = false;
        for (const p of data) {
          if (new Date(p.updated_at) <= since) { stop = true; break; }
          const closedAt = p.closed_at ? new Date(p.closed_at) : null;
          const mergedAt = p.merged_at ? new Date(p.merged_at) : null;
          const at = mergedAt ?? closedAt;
          if (!at || at <= since || at > until) continue;
          pulls.push({
            number: p.number, title: p.title, body: p.body ?? null, url: p.html_url, authorLogin: p.user?.login ?? null,
            merged: !!mergedAt, mergedAt, closedAt, draft: !!p.draft,
          });
        }
        if (stop) break;
        if (page === MAX_PAGES) truncated = true;
      }
      // Oldest first: when there are more than `max`, the newest kept time is a safe resume point.
      const at = (p: PullListing) => (p.mergedAt ?? p.closedAt)!.getTime();
      pulls.sort((a, b) => at(a) - at(b));
      if (pulls.length > max) { pulls.length = max; truncated = true; }
      return { pulls, truncated };
    },
    async getPullStats(repo, number) {
      const { data } = await octokit.pulls.get({ ...repo, pull_number: number });
      return { additions: data.additions, deletions: data.deletions, changedFiles: data.changed_files, commits: data.commits };
    },
    async getPullFiles(repo, number) {
      const { data } = await octokit.pulls.listFiles({ ...repo, pull_number: number, per_page: 100 });
      return data.map((f) => ({ filename: f.filename, additions: f.additions, deletions: f.deletions }));
    },
    async getPullReviews(repo, number) {
      const { data } = await octokit.pulls.listReviews({ ...repo, pull_number: number, per_page: 100 });
      return data.filter((r) => r.user?.login && r.state !== "PENDING").map((r) => ({ login: r.user!.login, state: r.state }));
    },
  };
}

/** Closed-unmerged PRs are only evidence when somebody engaged with them or they held real work. */
function worthKeepingUnmerged(stats: { additions: number; deletions: number }, reviews: number): boolean {
  return reviews > 0 || stats.additions + stats.deletions >= 20;
}

export async function collectGithubFromRepos(
  repos: RepoTarget[],
  /** lowercase GitHub login -> member id */
  logins: ReadonlyMap<string, string>,
  sourceFor: (repo: RepoTarget) => Promise<GithubSource | null>,
  win: CollectWindow,
): Promise<CollectResult> {
  const out = emptyResult();
  const wanted = win.memberIds ? new Set(win.memberIds) : null;
  const want = (memberId: string) => !wanted || wanted.has(memberId);
  const seenRepo = new Set<string>();
  const unmappedLogins = new Set<string>();

  for (const target of repos) {
    if (seenRepo.has(target.slug.toLowerCase())) continue; // one repo linked to several projects is read once
    seenRepo.add(target.slug.toLowerCase());
    const [owner, repoName] = target.slug.split("/");
    if (!owner || !repoName) { out.errors.push(`bad repo slug: ${target.slug}`); continue; }
    const ref: RepoRef = { owner, repo: repoName };
    const source = await sourceFor(target).catch(() => null);
    if (!source) { out.errors.push(`no GitHub access for ${target.slug}`); continue; }

    let listing: Awaited<ReturnType<GithubSource["listClosedPulls"]>>;
    try {
      listing = await source.listClosedPulls(ref, win.since, win.until, Math.max(1, win.maxArtifacts - out.artifacts.length));
    } catch (err) {
      out.errors.push(`${target.slug}: list failed: ${String((err as Error)?.message ?? err).slice(0, 160)}`);
      continue;
    }
    if (listing.truncated) {
      out.truncated = true;
      const newestKept = listing.pulls.reduce<Date | null>((m, p) => { const t = p.mergedAt ?? p.closedAt; return t && (!m || t > m) ? t : m; }, null);
      // Several repos: the safest resume point is the earliest one any truncated repo reached.
      out.resumeFrom = out.resumeFrom && newestKept ? new Date(Math.min(out.resumeFrom.getTime(), newestKept.getTime())) : newestKept ?? out.resumeFrom;
    }

    for (const pr of listing.pulls) {
      if (out.artifacts.length >= win.maxArtifacts) { out.truncated = true; break; }
      if (pr.draft || isBotLogin(pr.authorLogin)) continue;
      const authorId = logins.get(pr.authorLogin!.toLowerCase());
      try {
        const [stats, files, reviews] = await Promise.all([
          source.getPullStats(ref, pr.number), source.getPullFiles(ref, pr.number), source.getPullReviews(ref, pr.number),
        ]);
        const humanReviews = reviews.filter((r) => !isBotLogin(r.login));
        if (!pr.merged && !worthKeepingUnmerged(stats, humanReviews.length)) continue;
        const input: PullInput = {
          repo: target.slug, number: pr.number, title: pr.title, body: pr.body, url: pr.url, merged: pr.merged,
          mergedAt: pr.mergedAt, closedAt: pr.closedAt, additions: stats.additions, deletions: stats.deletions,
          changedFiles: stats.changedFiles, commits: stats.commits, files, reviews: humanReviews, authorLogin: pr.authorLogin!,
        };
        const ctx = { projectId: target.projectId, projectName: target.projectName };

        if (authorId) { if (want(authorId)) out.artifacts.push(enforceCap(pullAuthorArtifact(input, { memberId: authorId, ...ctx }, win.maxChars), win.maxChars)); }
        else if (!unmappedLogins.has(pr.authorLogin!.toLowerCase())) { unmappedLogins.add(pr.authorLogin!.toLowerCase()); out.unmapped++; }

        const byReviewer = new Map<string, string[]>();
        for (const r of humanReviews) {
          if (r.login.toLowerCase() === pr.authorLogin!.toLowerCase()) continue;
          byReviewer.set(r.login, [...(byReviewer.get(r.login) ?? []), r.state]);
        }
        for (const [login, states] of byReviewer) {
          const memberId = logins.get(login.toLowerCase());
          if (!memberId) { if (!unmappedLogins.has(login.toLowerCase())) { unmappedLogins.add(login.toLowerCase()); out.unmapped++; } continue; }
          if (want(memberId)) out.artifacts.push(enforceCap(pullReviewArtifact(input, { memberId, login, states }, ctx, win.maxChars), win.maxChars));
        }
      } catch (err) {
        out.errors.push(`${target.slug}#${pr.number}: ${String((err as Error)?.message ?? err).slice(0, 160)}`);
      }
    }
  }
  return out;
}

/** Production entry: repos linked to real projects, members matched by githubLogin. */
export async function collectGithub(win: CollectWindow): Promise<CollectResult> {
  const [repos, members] = await Promise.all([
    prisma.projectRepo.findMany({ where: { project: EXCLUDE_TRAINING }, select: { id: true, slug: true, projectId: true, project: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.member.findMany({ where: { githubLogin: { not: null }, isBot: false }, select: { id: true, githubLogin: true } }),
  ]);
  const logins = new Map<string, string>();
  for (const m of members) if (m.githubLogin) logins.set(m.githubLogin.toLowerCase(), m.id);
  const targets: RepoTarget[] = repos.map((r) => ({ projectRepoId: r.id, slug: r.slug, projectId: r.projectId, projectName: r.project?.name ?? null }));
  return collectGithubFromRepos(targets, logins, async (t) => {
    const octokit = await octokitForRepo(t.projectRepoId);
    return octokit ? octokitSource(octokit) : null;
  }, win);
}
