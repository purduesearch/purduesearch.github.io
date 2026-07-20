import { prisma } from "../db/prisma.js";
import type { TaskStatus, GitHubLinkKind } from "@prisma/client";
import {
  octokitForProject,
  octokitForRepo,
  parseRepoUrl,
  getIssue,
  getPull,
  createMilestone,
  getMilestone,
  listMilestones,
  listRepoContributors,
} from "./githubService.js";
import { logAuditEvent } from "./activityService.js";
import { createNotification } from "./notificationCrud.js";

// Maps GitHub state strings to ClubPM TaskStatus.
function ghStateToTaskStatus(state: string, merged?: boolean): TaskStatus {
  if (state === "closed") return "DONE";
  if (state === "open" && merged) return "DONE";
  return "TODO";
}

// ── Tag (label) sync ─────────────────────────────────────────

/**
 * For each GitHub label, ensure a Project-scoped Tag exists with a matching
 * name + color, and return the Tag IDs. Labels collide by name within a project
 * (Tag has a unique [name, projectId]), so re-imports converge.
 */
export async function ensureTagsForLabels(
  projectId: string,
  labels: { name: string; color: string }[]
): Promise<string[]> {
  if (!labels.length) return [];
  const ids: string[] = [];
  for (const l of labels) {
    if (!l.name) continue;
    const color = l.color && l.color !== "808080" ? `#${l.color}` : "#6c5ce7";
    const tag = await prisma.tag.upsert({
      where: { name_projectId: { name: l.name, projectId } },
      create: { name: l.name, color, projectId },
      update: { color },
    });
    ids.push(tag.id);
  }
  return ids;
}

// ── Link helpers ─────────────────────────────────────────────

export async function linkExists(
  taskId: string | null,
  projectId: string,
  kind: GitHubLinkKind,
  ref: { number?: number; sha?: string; path?: string; repoFullName: string }
): Promise<string | null> {
  const existing = await prisma.gitHubLink.findFirst({
    where: {
      taskId: taskId ?? undefined,
      projectId,
      kind,
      repoFullName: ref.repoFullName,
      refNumber: ref.number ?? null,
      refSha: ref.sha ?? null,
      refPath: ref.path ?? null,
    },
    select: { id: true },
  });
  return existing?.id ?? null;
}

// ── Issue ↔ Task ─────────────────────────────────────────────

/**
 * Link an existing Task to an existing GitHub issue, posting a back-link
 * comment on the issue (best-effort).
 */
export async function linkTaskToIssue(opts: {
  taskId: string;
  projectId: string;
  issueNumber: number;
  actorMemberId: string;
}): Promise<{ id: string; alreadyLinked: boolean } | null> {
  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { githubRepo: true },
  });
  if (!project?.githubRepo) return null;
  const ref = parseRepoUrl(project.githubRepo);
  if (!ref) return null;

  const o = await octokitForProject(opts.projectId, opts.actorMemberId);
  if (!o) return null;

  const issue = await getIssue(o, ref, opts.issueNumber);
  if (!issue) return null;

  const existing = await linkExists(opts.taskId, opts.projectId, "ISSUE", {
    repoFullName: `${ref.owner}/${ref.repo}`,
    number: opts.issueNumber,
  });
  if (existing) return { id: existing, alreadyLinked: true };

  const link = await prisma.gitHubLink.create({
    data: {
      taskId: opts.taskId,
      projectId: opts.projectId,
      kind: "ISSUE",
      repoFullName: `${ref.owner}/${ref.repo}`,
      refNumber: opts.issueNumber,
      state: issue.state,
      title: issue.title,
      url: issue.url,
      createdById: opts.actorMemberId,
      lastSyncedAt: new Date(),
    },
  });

  // Mirror labels into project tags + attach to task
  if (issue.labels.length) {
    const tagIds = await ensureTagsForLabels(opts.projectId, issue.labels);
    if (tagIds.length) {
      await prisma.task.update({
        where: { id: opts.taskId },
        data: { tags: { connect: tagIds.map(id => ({ id })) } },
      });
    }
  }

  // Best-effort back-link comment on the issue
  try {
    const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const body = `🔗 Linked to ClubPM task: ${frontend}/clubpm/projects/${opts.projectId}?task=${opts.taskId}`;
    await o.issues.createComment({
      owner: ref.owner,
      repo: ref.repo,
      issue_number: opts.issueNumber,
      body,
    });
  } catch (err) {
    console.warn("[github-sync] back-link comment failed:", err);
  }

  return { id: link.id, alreadyLinked: false };
}

/**
 * Create a new GitHub issue from a Task and link them.
 */
export async function createIssueFromTask(opts: {
  taskId: string;
  projectId: string;
  actorMemberId: string;
}): Promise<{ id: string; number: number; url: string } | null> {
  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { githubRepo: true },
  });
  if (!project?.githubRepo) return null;
  const ref = parseRepoUrl(project.githubRepo);
  if (!ref) return null;

  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    include: { tags: true },
  });
  if (!task) return null;

  const o = await octokitForProject(opts.projectId, opts.actorMemberId);
  if (!o) return null;

  try {
    const { data: issue } = await o.issues.create({
      owner: ref.owner,
      repo: ref.repo,
      title: task.title,
      body: task.description ?? undefined,
      labels: task.tags.map(t => t.name),
    });
    const link = await prisma.gitHubLink.create({
      data: {
        taskId: opts.taskId,
        projectId: opts.projectId,
        kind: "ISSUE",
        repoFullName: `${ref.owner}/${ref.repo}`,
        refNumber: issue.number,
        state: issue.state,
        title: issue.title,
        url: issue.html_url,
        createdById: opts.actorMemberId,
        lastSyncedAt: new Date(),
      },
    });
    return { id: link.id, number: issue.number, url: issue.html_url };
  } catch (err) {
    console.error("[github-sync] createIssueFromTask failed:", err);
    return null;
  }
}

/**
 * Push task title/body/state to its linked GitHub issue.
 */
export async function mirrorTaskToIssue(opts: {
  taskId: string;
  actorMemberId: string;
}): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    include: {
      githubLinks: { where: { kind: "ISSUE" } },
      tags: true,
    },
  });
  if (!task || task.githubLinks.length === 0) return false;
  const issueLink = task.githubLinks[0];
  if (!issueLink.refNumber) return false;

  const ref = parseRepoUrl(issueLink.repoFullName);
  if (!ref) return false;
  const o = await octokitForProject(task.projectId, opts.actorMemberId);
  if (!o) return false;

  try {
    await o.issues.update({
      owner: ref.owner,
      repo: ref.repo,
      issue_number: issueLink.refNumber,
      title: task.title,
      body: task.description ?? "",
      state: task.status === "DONE" ? "closed" : "open",
      labels: task.tags.map(t => t.name),
    });
    await prisma.gitHubLink.update({
      where: { id: issueLink.id },
      data: { title: task.title, lastSyncedAt: new Date() },
    });
    return true;
  } catch (err) {
    console.error("[github-sync] mirrorTaskToIssue failed:", err);
    return false;
  }
}

// ── Branch creation ──────────────────────────────────────────

/**
 * Generate the recommended branch name for a task.
 * Format: feature/<projectSlug-or-id>/<task-shortid>-<kebab-title>
 */
export function suggestBranchName(opts: {
  taskId: string;
  taskTitle: string;
  projectName: string;
  prefix?: "feature" | "fix" | "chore";
}): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  const proj = slug(opts.projectName) || "task";
  const short = opts.taskId.slice(-6); // cuid suffix is stable + short
  const title = slug(opts.taskTitle) || "untitled";
  return `${opts.prefix ?? "feature"}/${proj}-${short}-${title}`;
}

/**
 * Create a new branch from the repo's default branch (or supplied base) and
 * link it to the task.
 */
export async function createBranchFromTask(opts: {
  taskId: string;
  projectId: string;
  name: string;
  baseRef?: string;
  actorMemberId: string;
}): Promise<{ id: string; url: string; sha: string } | { error: string }> {
  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { githubRepo: true },
  });
  if (!project?.githubRepo) return { error: "Project has no linked repo" };
  const ref = parseRepoUrl(project.githubRepo);
  if (!ref) return { error: "Invalid repo identifier" };

  const o = await octokitForProject(opts.projectId, opts.actorMemberId);
  if (!o) return { error: "GitHub auth required" };

  try {
    // Resolve base SHA
    let baseName = opts.baseRef;
    if (!baseName) {
      const { data: repo } = await o.repos.get({ owner: ref.owner, repo: ref.repo });
      baseName = repo.default_branch;
    }
    const { data: baseRef } = await o.git.getRef({
      owner: ref.owner,
      repo: ref.repo,
      ref: `heads/${baseName}`,
    });
    const baseSha = baseRef.object.sha;

    await o.git.createRef({
      owner: ref.owner,
      repo: ref.repo,
      ref: `refs/heads/${opts.name}`,
      sha: baseSha,
    });

    const url = `https://github.com/${ref.owner}/${ref.repo}/tree/${encodeURIComponent(opts.name)}`;
    const link = await prisma.gitHubLink.create({
      data: {
        taskId: opts.taskId,
        projectId: opts.projectId,
        kind: "BRANCH",
        repoFullName: `${ref.owner}/${ref.repo}`,
        refPath: opts.name,
        refSha: baseSha,
        state: "open",
        title: opts.name,
        url,
        createdById: opts.actorMemberId,
        lastSyncedAt: new Date(),
      },
    });
    return { id: link.id, url, sha: baseSha };
  } catch (err: any) {
    // 422 — branch already exists
    const msg = err?.response?.data?.message ?? err?.message ?? "Failed to create branch";
    console.error("[github-sync] createBranchFromTask failed:", msg);
    return { error: msg };
  }
}

// ── Bulk import ──────────────────────────────────────────────

/**
 * Import a batch of GitHub issues into the project as Tasks. Each import
 * creates a Task and a GitHubLink. Idempotent: existing links for the same
 * (project, issueNumber) are skipped.
 */
export async function importIssuesAsTasks(opts: {
  projectId: string;
  issueNumbers: number[];
  actorMemberId: string;
}): Promise<{ created: number; skipped: number; errors: string[] }> {
  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { githubRepo: true },
  });
  if (!project?.githubRepo) return { created: 0, skipped: 0, errors: ["No linked repo"] };
  const ref = parseRepoUrl(project.githubRepo);
  if (!ref) return { created: 0, skipped: 0, errors: ["Invalid repo identifier"] };

  const o = await octokitForProject(opts.projectId, opts.actorMemberId);
  if (!o) return { created: 0, skipped: 0, errors: ["GitHub auth required"] };

  const repoFullName = `${ref.owner}/${ref.repo}`;
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const num of opts.issueNumbers) {
    try {
      // Skip if there's already any link for this issue in this project
      const existing = await prisma.gitHubLink.findFirst({
        where: { projectId: opts.projectId, kind: "ISSUE", repoFullName, refNumber: num },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      const issue = await getIssue(o, ref, num);
      if (!issue) { errors.push(`#${num}: not found`); continue; }

      const tagIds = await ensureTagsForLabels(opts.projectId, issue.labels);
      const task = await prisma.task.create({
        data: {
          title: issue.title,
          description: issue.body ?? undefined,
          projectId: opts.projectId,
          status: ghStateToTaskStatus(issue.state),
          createdById: opts.actorMemberId,
          tags: { connect: tagIds.map(id => ({ id })) },
        },
      });
      await prisma.gitHubLink.create({
        data: {
          taskId: task.id,
          projectId: opts.projectId,
          kind: "ISSUE",
          repoFullName,
          refNumber: num,
          state: issue.state,
          title: issue.title,
          url: issue.url,
          createdById: opts.actorMemberId,
          lastSyncedAt: new Date(),
        },
      });
      created++;
    } catch (err: any) {
      errors.push(`#${num}: ${err?.message ?? "unknown"}`);
    }
  }

  return { created, skipped, errors };
}

// ── Live status refresh (used by GET /api/tasks/:id/github) ──

/**
 * For each link, fetch current state from GitHub and persist. Returns the
 * refreshed link rows (small, denormalized).
 */
export async function refreshTaskLinks(opts: {
  taskId: string;
  actorMemberId: string;
}): Promise<any[]> {
  const links = await prisma.gitHubLink.findMany({
    where: { taskId: opts.taskId },
    orderBy: { createdAt: "desc" },
  });
  if (links.length === 0) return [];

  // Group by repo so we reuse one Octokit per repo
  const byRepo = new Map<string, typeof links>();
  for (const l of links) {
    if (!byRepo.has(l.repoFullName)) byRepo.set(l.repoFullName, []);
    byRepo.get(l.repoFullName)!.push(l);
  }

  const out: any[] = [];
  for (const [repoFullName, group] of byRepo) {
    const ref = parseRepoUrl(repoFullName);
    if (!ref) {
      out.push(...group);
      continue;
    }
    // Use the project of the first link (all same project)
    const o = await octokitForProject(group[0].projectId, opts.actorMemberId);
    if (!o) {
      out.push(...group);
      continue;
    }
    for (const l of group) {
      try {
        if (l.kind === "ISSUE" && l.refNumber) {
          const issue = await getIssue(o, ref, l.refNumber);
          if (issue) {
            const updated = await prisma.gitHubLink.update({
              where: { id: l.id },
              data: { state: issue.state, title: issue.title, lastSyncedAt: new Date() },
            });
            out.push(updated);
            continue;
          }
        } else if (l.kind === "PR" && l.refNumber) {
          const pr = await getPull(o, ref, l.refNumber);
          if (pr) {
            const newState = pr.merged ? "merged" : pr.draft ? "draft" : pr.state;
            const updated = await prisma.gitHubLink.update({
              where: { id: l.id },
              data: { state: newState, title: pr.title, lastSyncedAt: new Date() },
            });
            // Attach PR-only fields (review/checks) without persisting
            out.push({ ...updated, reviewState: pr.reviewState, checksStatus: pr.checksStatus });
            continue;
          }
        }
        out.push(l);
      } catch {
        out.push(l);
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Phase 4: milestone & contributor sync
// ─────────────────────────────────────────────────────────────

/**
 * Sync a ClubPM Milestone to a GitHub milestone in a specific linked repo
 * (multi-repo, Workstream B — the target repo is no longer implied by a
 * single `Project.githubRepo`). If a map row already exists for the
 * milestone, update the GH milestone in its already-mapped repo; otherwise
 * create one in `repoId` and persist the map (with `projectRepoId` set).
 */
export async function syncMilestoneToGitHub(opts: {
  milestoneId: string;
  repoId: string;
  actorMemberId: string;
}): Promise<{ githubMilestoneNumber: number; url: string } | { error: string }> {
  const milestone = await prisma.milestone.findUnique({
    where: { id: opts.milestoneId },
    select: { id: true, projectId: true, title: true, description: true, dueDate: true, status: true },
  });
  if (!milestone) return { error: "Milestone not found" };

  const projectRepo = await prisma.projectRepo.findUnique({ where: { id: opts.repoId } });
  if (!projectRepo || projectRepo.projectId !== milestone.projectId) {
    return { error: "Repo not linked to this project" };
  }
  const ref = parseRepoUrl(projectRepo.slug);
  if (!ref) return { error: "Invalid repo identifier" };

  const existing = await prisma.gitHubMilestoneMap.findUnique({
    where: { milestoneId: milestone.id },
  });
  // A milestone maps to exactly one GitHub milestone. If it's already synced
  // to a different repo, `existing.githubMilestoneNumber` is meaningless
  // against `repoId` — don't silently write to the wrong repo/number.
  if (existing?.projectRepoId && existing.projectRepoId !== projectRepo.id) {
    return { error: "This milestone is already synced to a different repo" };
  }

  const o = await octokitForRepo(projectRepo.id, opts.actorMemberId);
  if (!o) return { error: "GitHub auth required" };

  const ghState = milestone.status === "COMPLETED" || milestone.status === "CANCELLED" ? "closed" : "open";

  if (existing) {
    try {
      const res = await o.issues.updateMilestone({
        owner: ref.owner,
        repo: ref.repo,
        milestone_number: existing.githubMilestoneNumber,
        title: milestone.title,
        description: milestone.description ?? undefined,
        due_on: milestone.dueDate ? milestone.dueDate.toISOString() : undefined,
        state: ghState,
      });
      await prisma.gitHubMilestoneMap.update({
        where: { id: existing.id },
        data: {
          lastSyncedAt: new Date(),
          projectRepoId: projectRepo.id,
          repoFullName: projectRepo.slug,
        },
      });
      return { githubMilestoneNumber: res.data.number, url: res.data.html_url };
    } catch (err: any) {
      console.error("[github-sync] syncMilestone update failed:", err);
      return { error: err?.message ?? "Update failed" };
    }
  }

  const created = await createMilestone(o, ref, {
    title: milestone.title,
    description: milestone.description,
    dueOn: milestone.dueDate,
    state: ghState,
  });
  if (!created) return { error: "Could not create GitHub milestone" };

  await prisma.gitHubMilestoneMap.create({
    data: {
      projectId: milestone.projectId,
      milestoneId: milestone.id,
      githubMilestoneNumber: created.number,
      repoFullName: projectRepo.slug,
      projectRepoId: projectRepo.id,
      lastSyncedAt: new Date(),
    },
  });
  return { githubMilestoneNumber: created.number, url: created.url };
}

/**
 * Fetch the GitHub milestone progress (open/closed issue counts) for a single
 * mapped ClubPM milestone. Repo-scoped via the map's own `projectRepoId`
 * (multi-repo, Workstream B) rather than the project's single legacy repo.
 * Returns null if unmapped or fetch fails.
 */
export async function getMappedMilestoneProgress(opts: {
  milestoneId: string;
  actorMemberId: string;
}): Promise<{ openIssues: number; closedIssues: number; url: string; state: string } | null> {
  const map = await prisma.gitHubMilestoneMap.findUnique({
    where: { milestoneId: opts.milestoneId },
  });
  if (!map) return null;
  const ref = parseRepoUrl(map.repoFullName);
  if (!ref) return null;
  // Prefer the mapped repo's own auth; fall back to the legacy project-level
  // path for pre-migration maps that somehow lack `projectRepoId`.
  const o = map.projectRepoId
    ? await octokitForRepo(map.projectRepoId, opts.actorMemberId)
    : await octokitForProject(map.projectId, opts.actorMemberId);
  if (!o) return null;
  const ms = await getMilestone(o, ref, map.githubMilestoneNumber);
  if (!ms) return null;
  return {
    openIssues: ms.openIssues,
    closedIssues: ms.closedIssues,
    url: ms.url,
    state: ms.state,
  };
}

/**
 * Read repo contributors and try to match each `login` to an existing Member
 * via `githubLogin`. Returns {linked, unmatched}. Repo-scoped (multi-repo,
 * Workstream B): `repoId` selects which of the project's linked repos to
 * read contributors from.
 */
export async function discoverContributors(opts: {
  projectId: string;
  repoId: string;
  actorMemberId: string;
}): Promise<{
  linked:    { login: string; avatarUrl: string | null; contributions: number; memberId: string; displayName: string }[];
  unmatched: { login: string; avatarUrl: string | null; contributions: number }[];
} | { error: string }> {
  const projectRepo = await prisma.projectRepo.findUnique({ where: { id: opts.repoId } });
  if (!projectRepo || projectRepo.projectId !== opts.projectId) {
    return { error: "Repo not linked to this project" };
  }
  const ref = parseRepoUrl(projectRepo.slug);
  if (!ref) return { error: "Invalid repo identifier" };
  const o = await octokitForRepo(projectRepo.id, opts.actorMemberId);
  if (!o) return { error: "GitHub auth required" };

  const contribs = await listRepoContributors(o, ref);
  if (contribs.length === 0) return { linked: [], unmatched: [] };

  const logins = contribs.map(c => c.login);
  const members = await prisma.member.findMany({
    where: { githubLogin: { in: logins } },
    select: { id: true, displayName: true, githubLogin: true },
  });
  const byLogin = new Map(members.map(m => [m.githubLogin as string, m]));

  const linked: any[] = [];
  const unmatched: any[] = [];
  for (const c of contribs) {
    const m = byLogin.get(c.login);
    if (m) {
      linked.push({ ...c, memberId: m.id, displayName: m.displayName });
    } else {
      unmatched.push(c);
    }
  }
  return { linked, unmatched };
}

/**
 * Add unmatched contributors as ProjectMembers (after the caller has matched
 * each login to a ClubPM memberId via the UI). Idempotent.
 */
export async function addContributorsToProject(opts: {
  projectId: string;
  links: { memberId: string; githubLogin: string }[];
}): Promise<{ added: number; updatedLogins: number }> {
  let added = 0;
  let updatedLogins = 0;
  for (const l of opts.links) {
    // Set githubLogin on the member if missing
    const m = await prisma.member.findUnique({
      where: { id: l.memberId },
      select: { githubLogin: true },
    });
    if (!m) continue;
    if (m.githubLogin !== l.githubLogin) {
      try {
        await prisma.member.update({
          where: { id: l.memberId },
          data: { githubLogin: l.githubLogin },
        });
        updatedLogins++;
      } catch {
        // unique-constraint violation — another member already owns this login
      }
    }
    // Upsert ProjectMember
    await prisma.projectMember.upsert({
      where: { projectId_memberId: { projectId: opts.projectId, memberId: l.memberId } },
      create: { projectId: opts.projectId, memberId: l.memberId, projectRole: "Contributor" },
      update: {},
    });
    added++;
  }
  return { added, updatedLogins };
}

/**
 * Return the most recent GitHub-event activity rows across all projects the
 * caller is a member of. Used by the Dashboard widget.
 */
export async function recentGithubActivityForMember(opts: {
  memberId: string;
  limit?: number;
}): Promise<any[]> {
  const projects = await prisma.projectMember.findMany({
    where: { memberId: opts.memberId },
    select: { projectId: true },
  });
  const projectIds = projects.map(p => p.projectId);
  if (projectIds.length === 0) return [];
  return prisma.activityLog.findMany({
    where: {
      projectId: { in: projectIds },
      eventType: { in: [
        "GITHUB_PR_OPENED", "GITHUB_PR_MERGED", "GITHUB_PR_CLOSED",
        "GITHUB_PR_REVIEW", "GITHUB_CI_FAILED", "GITHUB_CI_PASSED",
        "GITHUB_ISSUE_SYNCED", "GITHUB_BRANCH_CREATED",
        "GITHUB_PUSH", "GITHUB_REPO_LINKED",
      ] },
    },
    include: {
      project: { select: { id: true, name: true } },
      task:    { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 10,
  });
}

// Suppress unused-import warning until callers wire these in
void listMilestones;

// ─────────────────────────────────────────────────────────────
// Phase 3: webhook event handlers
//
// Each handler:
//   - finds the project(s) linked to the webhook's repo via ProjectRepo.slug
//     (multi-repo, Workstream B — a repo may be linked to more than one
//     project, so this stays a findMany)
//   - reconciles GitHubLink rows
//   - emits ActivityLog entries (visible in the project's Activity tab)
//   - sends Notifications where appropriate
//
// Handlers swallow errors so a single bad delivery doesn't break the receiver.
// ─────────────────────────────────────────────────────────────

async function projectsForRepo(repoFullName: string): Promise<{ id: string; repoId: string }[]> {
  const repos = await prisma.projectRepo.findMany({
    where: { slug: repoFullName },
    select: { projectId: true, id: true },
  });
  return repos.map(r => ({ id: r.projectId, repoId: r.id }));
}

async function notifyTaskAssignees(taskId: string, opts: {
  type: "GITHUB_PR_REVIEW_REQUESTED" | "GITHUB_PR_MERGED" | "GITHUB_CI_FAILED";
  projectId: string;
  message: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { assignees: { select: { id: true } } },
    });
    if (!task) return;
    for (const a of task.assignees) {
      await createNotification({
        type: opts.type,
        recipientId: a.id,
        projectId: opts.projectId,
        taskId,
        message: opts.message,
        metadata: opts.metadata,
      });
    }
  } catch (err) {
    console.error("[github-sync] notifyTaskAssignees failed:", err);
  }
}

// ── issues ────────────────────────────────────────────────────
// Action: opened, edited, closed, reopened, deleted, assigned, etc.
// Mirror title/body/state into any linked tasks (one task per project).
export async function handleIssueEvent(payload: any): Promise<void> {
  try {
    const action = payload.action as string;
    const repoFullName = payload.repository?.full_name;
    const issue = payload.issue;
    if (!repoFullName || !issue?.number) return;

    const projects = await projectsForRepo(repoFullName);
    if (projects.length === 0) return;

    for (const p of projects) {
      // Upsert link if one exists (skip if no linked task)
      const link = await prisma.gitHubLink.findFirst({
        where: {
          projectId: p.id,
          kind: "ISSUE",
          repoFullName,
          refNumber: issue.number,
          taskId: { not: null },
        },
      });
      if (!link?.taskId) continue;

      // Reflect title/state onto the task
      const taskUpdates: any = {
        title: issue.title,
        description: issue.body ?? null,
      };
      if (action === "closed") taskUpdates.status = "DONE" as TaskStatus;
      if (action === "reopened") taskUpdates.status = "TODO" as TaskStatus;

      await prisma.task.update({ where: { id: link.taskId }, data: taskUpdates });
      await prisma.gitHubLink.update({
        where: { id: link.id },
        data: { title: issue.title, state: issue.state, lastSyncedAt: new Date() },
      });
      logAuditEvent({
        projectId: p.id,
        taskId: link.taskId,
        source: "WEB",
        eventType: "GITHUB_ISSUE_SYNCED",
        payload: { issueNumber: issue.number, action, title: issue.title },
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[github-webhook] handleIssueEvent error:", err);
  }
}

// ── pull_request ──────────────────────────────────────────────
// Action: opened, ready_for_review, closed (merged?), synchronize, reopened, edited
//
// Behavior:
//   - opened (non-draft) or ready_for_review → move linked task to IN_PROGRESS
//   - closed + merged                       → move linked task to DONE
//   - upsert a PR-kind link tied to the task whose branch == pr.head.ref
export async function handlePullRequestEvent(payload: any): Promise<void> {
  try {
    const action = payload.action as string;
    const repoFullName = payload.repository?.full_name;
    const pr = payload.pull_request;
    if (!repoFullName || !pr?.number) return;

    const projects = await projectsForRepo(repoFullName);
    if (projects.length === 0) return;

    const newState = pr.merged ? "merged" : pr.draft ? "draft" : pr.state;

    for (const p of projects) {
      // Find candidate task by an existing BRANCH link matching the PR's head ref.
      const branchLink = await prisma.gitHubLink.findFirst({
        where: { projectId: p.id, kind: "BRANCH", repoFullName, refPath: pr.head?.ref },
        select: { taskId: true },
      });
      const taskId = branchLink?.taskId ?? null;

      // Upsert PR link
      const existing = await prisma.gitHubLink.findFirst({
        where: { projectId: p.id, kind: "PR", repoFullName, refNumber: pr.number },
      });
      if (existing) {
        await prisma.gitHubLink.update({
          where: { id: existing.id },
          data: {
            state: newState,
            title: pr.title,
            taskId: existing.taskId ?? taskId,
            lastSyncedAt: new Date(),
          },
        });
      } else {
        await prisma.gitHubLink.create({
          data: {
            projectId: p.id,
            taskId,
            kind: "PR",
            repoFullName,
            refNumber: pr.number,
            state: newState,
            title: pr.title,
            url: pr.html_url,
            lastSyncedAt: new Date(),
          },
        });
      }

      // Task status transitions
      const linkedTaskId = taskId ?? existing?.taskId ?? null;
      if (linkedTaskId) {
        if (
          (action === "opened" && !pr.draft) ||
          action === "ready_for_review"
        ) {
          await prisma.task.update({
            where: { id: linkedTaskId },
            data: { status: "IN_PROGRESS", progress: "IN_PROGRESS" },
          });
        }
        if (action === "closed" && pr.merged) {
          await prisma.task.update({
            where: { id: linkedTaskId },
            data: { status: "DONE", progress: "COMPLETED" },
          });
          notifyTaskAssignees(linkedTaskId, {
            type: "GITHUB_PR_MERGED",
            projectId: p.id,
            message: `PR #${pr.number} merged: ${pr.title}`,
            metadata: { prNumber: pr.number, url: pr.html_url },
          }).catch(() => {});
        }
      }

      // Audit
      const evt = action === "opened"
        ? "GITHUB_PR_OPENED"
        : action === "closed" && pr.merged
          ? "GITHUB_PR_MERGED"
          : action === "closed"
            ? "GITHUB_PR_CLOSED"
            : "GITHUB_PR_OPENED";
      logAuditEvent({
        projectId: p.id,
        taskId: linkedTaskId ?? undefined,
        source: "WEB",
        eventType: evt,
        payload: { prNumber: pr.number, title: pr.title, action, merged: pr.merged },
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[github-webhook] handlePullRequestEvent error:", err);
  }
}

// ── pull_request_review ───────────────────────────────────────
// Notify the linked task's assignees on submitted reviews.
export async function handlePullRequestReviewEvent(payload: any): Promise<void> {
  try {
    if (payload.action !== "submitted") return;
    const repoFullName = payload.repository?.full_name;
    const pr = payload.pull_request;
    const review = payload.review;
    if (!repoFullName || !pr?.number || !review?.state) return;

    const projects = await projectsForRepo(repoFullName);
    for (const p of projects) {
      const link = await prisma.gitHubLink.findFirst({
        where: { projectId: p.id, kind: "PR", repoFullName, refNumber: pr.number, taskId: { not: null } },
      });
      if (!link?.taskId) continue;
      notifyTaskAssignees(link.taskId, {
        type: "GITHUB_PR_REVIEW_REQUESTED",
        projectId: p.id,
        message: `Review on PR #${pr.number}: ${review.state.toLowerCase().replace("_", " ")}`,
        metadata: { prNumber: pr.number, state: review.state, reviewer: review.user?.login },
      }).catch(() => {});
      logAuditEvent({
        projectId: p.id,
        taskId: link.taskId,
        source: "WEB",
        eventType: "GITHUB_PR_REVIEW",
        payload: { prNumber: pr.number, state: review.state, reviewer: review.user?.login },
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[github-webhook] handlePullRequestReviewEvent error:", err);
  }
}

// ── push ──────────────────────────────────────────────────────
// Parse commit messages for:
//   - "#<task-shortid>" (last-6-chars of cuid)  → create COMMIT link
//   - "fixes #<n>" / "closes #<n>" / "resolves #<n>"  → mark linked task DONE
const TASK_SHORTID_RE = /#([a-z0-9]{6})\b/gi;
const FIXES_RE = /\b(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+#(\d+)/gi;

export async function handlePushEvent(payload: any): Promise<void> {
  try {
    const repoFullName = payload.repository?.full_name;
    const commits = payload.commits as Array<any> | undefined;
    if (!repoFullName || !commits?.length) return;

    const projects = await projectsForRepo(repoFullName);
    if (projects.length === 0) return;

    for (const c of commits) {
      const msg: string = c.message ?? "";
      // Task short-id references
      const shortIds = new Set<string>();
      for (const m of msg.matchAll(TASK_SHORTID_RE)) shortIds.add(m[1].toLowerCase());

      for (const proj of projects) {
        // Find tasks in this project whose id ends with any shortid (cuid suffix)
        if (shortIds.size > 0) {
          const tasks = await prisma.task.findMany({
            where: { projectId: proj.id },
            select: { id: true },
          });
          const matched = tasks.filter(t => {
            const suffix = t.id.slice(-6).toLowerCase();
            return shortIds.has(suffix);
          });
          for (const t of matched) {
            // Skip duplicates
            const existing = await prisma.gitHubLink.findFirst({
              where: {
                projectId: proj.id, kind: "COMMIT", repoFullName,
                refSha: c.id, taskId: t.id,
              },
            });
            if (existing) continue;
            await prisma.gitHubLink.create({
              data: {
                projectId: proj.id,
                taskId: t.id,
                kind: "COMMIT",
                repoFullName,
                refSha: c.id,
                state: "open",
                title: msg.split("\n")[0].slice(0, 200),
                url: c.url ?? `https://github.com/${repoFullName}/commit/${c.id}`,
                lastSyncedAt: new Date(),
              },
            });
            logAuditEvent({
              projectId: proj.id,
              taskId: t.id,
              source: "WEB",
              eventType: "GITHUB_COMMIT_REFERENCED",
              payload: { sha: c.id, message: msg.split("\n")[0].slice(0, 200) },
            }).catch(() => {});
          }
        }

        // "fixes #N" — close task linked to issue #N
        const fixed = new Set<number>();
        for (const m of msg.matchAll(FIXES_RE)) fixed.add(parseInt(m[1], 10));
        for (const issueNum of fixed) {
          const issueLink = await prisma.gitHubLink.findFirst({
            where: {
              projectId: proj.id, kind: "ISSUE", repoFullName, refNumber: issueNum,
              taskId: { not: null },
            },
          });
          if (!issueLink?.taskId) continue;
          await prisma.task.update({
            where: { id: issueLink.taskId },
            data: { status: "DONE", progress: "COMPLETED" },
          });
          logAuditEvent({
            projectId: proj.id,
            taskId: issueLink.taskId,
            source: "WEB",
            eventType: "TASK_COMPLETED",
            payload: { via: "github-commit", sha: c.id, issueNumber: issueNum },
          }).catch(() => {});
        }
      }
    }

    // Project-level push activity
    for (const proj of projects) {
      logAuditEvent({
        projectId: proj.id,
        source: "WEB",
        eventType: "GITHUB_PUSH",
        payload: {
          ref: payload.ref,
          commits: commits.length,
          pusher: payload.pusher?.name,
        },
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[github-webhook] handlePushEvent error:", err);
  }
}

// ── check_suite / check_run ──────────────────────────────────
// Updates PR link state + notifies assignees on failure.
export async function handleCheckEvent(payload: any): Promise<void> {
  try {
    const repoFullName = payload.repository?.full_name;
    const suite = payload.check_suite ?? payload.check_run?.check_suite;
    const headSha = payload.check_run?.head_sha ?? suite?.head_sha;
    const conclusion = payload.check_run?.conclusion ?? suite?.conclusion;
    if (!repoFullName || !headSha) return;

    const projects = await projectsForRepo(repoFullName);
    if (projects.length === 0) return;

    // Best-effort: find a PR matching head SHA via any linked PR. We don't have
    // pull_requests on the suite payload reliably, so query our links.
    for (const proj of projects) {
      const prLink = await prisma.gitHubLink.findFirst({
        where: { projectId: proj.id, kind: "PR", repoFullName },
        orderBy: { lastSyncedAt: "desc" },
      });
      // We can't trivially confirm the PR's head sha equals headSha without
      // re-fetching; for now we attach CI status to the most-recent PR link.
      // (Full implementation can re-fetch via Octokit for stricter mapping.)
      if (!prLink) continue;

      if (conclusion === "failure" && prLink.taskId) {
        logAuditEvent({
          projectId: proj.id,
          taskId: prLink.taskId,
          source: "WEB",
          eventType: "GITHUB_CI_FAILED",
          payload: { sha: headSha, conclusion },
        }).catch(() => {});
        notifyTaskAssignees(prLink.taskId, {
          type: "GITHUB_CI_FAILED",
          projectId: proj.id,
          message: `CI failed on linked PR (#${prLink.refNumber ?? "?"})`,
          metadata: { sha: headSha, prNumber: prLink.refNumber },
        }).catch(() => {});
      } else if (conclusion === "success" && prLink.taskId) {
        logAuditEvent({
          projectId: proj.id,
          taskId: prLink.taskId,
          source: "WEB",
          eventType: "GITHUB_CI_PASSED",
          payload: { sha: headSha },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[github-webhook] handleCheckEvent error:", err);
  }
}
