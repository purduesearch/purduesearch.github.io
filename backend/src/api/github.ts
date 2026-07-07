import { Router, type Request, type Response } from "express";
import type { ProjectRepo } from "@prisma/client";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import {
  octokitForMember,
  octokitForRepo,
  parseRepoUrl,
  getRepoStats,
  listIssues,
  getIssue,
  listPulls,
  getPull,
  listBranches,
  listContents,
  getFile,
  listCommits,
  listMilestones,
  getMemberRepoStats,
  repoSlug,
} from "../services/githubService.js";
import {
  suggestBranchName,
  ensureTagsForLabels,
  mirrorTaskToIssue,
  importIssuesAsTasks,
  refreshTaskLinks,
  linkExists,
  syncMilestoneToGitHub,
  getMappedMilestoneProgress,
  discoverContributors,
  addContributorsToProject,
  recentGithubActivityForMember,
} from "../services/githubSyncService.js";
import { logAuditEvent } from "../services/activityService.js";

export const githubRouter = Router();

// All routes require ClubPM auth. The Octokit client picked per-request is
// either App-installation (preferred, per-repo) or the caller's OAuth (fallback).
githubRouter.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────

/**
 * Resolve a `ProjectRepo` row (multi-repo, Workstream B) into an
 * owner/repo ref usable by githubService.ts. Replaces the old
 * project-scoped `loadProjectRepo` now that repos are looked up by id.
 */
async function loadRepo(
  repoId: string
): Promise<
  | { owner: string; repo: string; projectRepo: ProjectRepo }
  | { error: string; status: number }
> {
  const pr = await prisma.projectRepo.findUnique({ where: { id: repoId } });
  if (!pr) return { error: "Repo not linked", status: 404 };
  const ref = parseRepoUrl(pr.slug);
  if (!ref) return { error: "Invalid stored repo identifier", status: 400 };
  return { owner: ref.owner, repo: ref.repo, projectRepo: pr };
}

async function requireProjectAdmin(memberId: string | undefined): Promise<boolean> {
  if (!memberId) return false;
  const actor = await prisma.member.findUnique({
    where: { id: memberId },
    select: { isAdmin: true },
  });
  return Boolean(actor?.isAdmin);
}

// ── GET /api/github/repo?url=… — validate a repo URL before linking ──
// Used by AddRepoModal to confirm a URL resolves before POSTing.

githubRouter.get("/repo", async (req: Request, res: Response) => {
  const url = String(req.query.url ?? "");
  const ref = parseRepoUrl(url);
  if (!ref) {
    res.status(400).json({ error: "Could not parse repo URL" });
    return;
  }
  const o = await octokitForMember(req.memberId!);
  if (!o) {
    res.status(400).json({ error: "Connect your GitHub account first" });
    return;
  }
  const stats = await getRepoStats(o, ref);
  if (!stats) {
    res.status(404).json({ error: "Repo not found or access denied" });
    return;
  }
  res.json({ ...stats, slug: repoSlug(ref) });
});

// ── Repo CRUD (multi-repo, Workstream B) ─────────────────────

// GET /api/github/projects/:id/repos — list all repos linked to a project.
githubRouter.get("/projects/:id/repos", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const repos = await prisma.projectRepo.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ repos });
  } catch (err) {
    console.error("[github] list repos error:", err);
    res.status(500).json({ error: "Failed to list repos" });
  }
});

// POST /api/github/projects/:id/repos — append a new linked repo.
// Body: { url }. Admin-gated. Validates the repo is accessible via the
// caller's own GitHub OAuth before creating the row.
githubRouter.post("/projects/:id/repos", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { url } = req.body as { url?: string };
    if (!url) {
      res.status(400).json({ error: "url required" });
      return;
    }

    const memberId = req.memberId!;
    if (!(await requireProjectAdmin(memberId))) {
      res.status(403).json({ error: "Only admins can add a repo" });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const ref = parseRepoUrl(url);
    if (!ref) {
      res.status(400).json({ error: "Could not parse repo URL" });
      return;
    }

    const o = await octokitForMember(memberId);
    if (!o) {
      res.status(400).json({ error: "Connect your GitHub account first" });
      return;
    }
    const stats = await getRepoStats(o, ref);
    if (!stats) {
      res.status(404).json({ error: "Repo not found or access denied" });
      return;
    }

    const slug = repoSlug(ref);
    try {
      const created = await prisma.projectRepo.create({
        data: { projectId, slug, createdById: memberId },
      });
      logAuditEvent({
        projectId,
        memberId,
        source: "WEB",
        eventType: "GITHUB_REPO_LINKED",
        payload: { slug },
      }).catch(console.error);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === "P2002") {
        res.status(409).json({ error: "This repo is already linked to the project" });
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error("[github] add repo error:", err);
    res.status(500).json({ error: "Failed to add repo" });
  }
});

// PATCH /api/github/repos/:repoId — update CI gating / App installation.
// Body: { blockDoneOnCiFail?, installId? }. Admin-gated.
githubRouter.patch("/repos/:repoId", async (req: Request, res: Response) => {
  try {
    const repoId = req.params.repoId as string;
    const { blockDoneOnCiFail, installId } = req.body as {
      blockDoneOnCiFail?: boolean;
      installId?: number | null;
    };

    if (!(await requireProjectAdmin(req.memberId))) {
      res.status(403).json({ error: "Only admins can edit a linked repo" });
      return;
    }

    const existing = await prisma.projectRepo.findUnique({ where: { id: repoId } });
    if (!existing) {
      res.status(404).json({ error: "Repo not found" });
      return;
    }

    const updated = await prisma.projectRepo.update({
      where: { id: repoId },
      data: {
        blockDoneOnCiFail: blockDoneOnCiFail === undefined ? undefined : blockDoneOnCiFail,
        installId: installId === undefined ? undefined : installId,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("[github] update repo error:", err);
    res.status(500).json({ error: "Failed to update repo" });
  }
});

// DELETE /api/github/repos/:repoId — unlink a repo. Admin-gated.
githubRouter.delete("/repos/:repoId", async (req: Request, res: Response) => {
  try {
    const repoId = req.params.repoId as string;
    if (!(await requireProjectAdmin(req.memberId))) {
      res.status(403).json({ error: "Only admins can remove a linked repo" });
      return;
    }
    await prisma.projectRepo.delete({ where: { id: repoId } });
    res.json({ ok: true });
  } catch (err) {
    console.error("[github] delete repo error:", err);
    res.status(404).json({ error: "Repo not found" });
  }
});

// ── GET /api/github/repos/:repoId/repo — stats for a linked repo ─────

githubRouter.get("/repos/:repoId/repo", async (req: Request, res: Response) => {
  const repoId = req.params.repoId as string;
  const ref = await loadRepo(repoId);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForRepo(repoId, req.memberId!);
  if (!o) {
    res.status(400).json({ error: "GitHub auth required" });
    return;
  }
  const stats = await getRepoStats(o, ref);
  if (!stats) {
    res.status(502).json({ error: "GitHub API error" });
    return;
  }
  res.json(stats);
});

// ── GET /api/github/repos/:repoId/issues ─────────────────────

githubRouter.get("/repos/:repoId/issues", async (req: Request, res: Response) => {
  const repoId = req.params.repoId as string;
  const ref = await loadRepo(repoId);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForRepo(repoId, req.memberId!);
  if (!o) {
    res.status(400).json({ error: "GitHub auth required" });
    return;
  }
  const state = (req.query.state as "open" | "closed" | "all") ?? "open";
  const labels = req.query.labels as string | undefined;
  const assignee = req.query.assignee as string | undefined;
  const issues = await listIssues(o, ref, { state, labels, assignee });
  res.json({ issues });
});

// ── GET /api/github/repos/:repoId/issues/:number ─────────────

githubRouter.get(
  "/repos/:repoId/issues/:number",
  async (req: Request, res: Response) => {
    const repoId = req.params.repoId as string;
    const ref = await loadRepo(repoId);
    if ("error" in ref) {
      res.status(ref.status).json({ error: ref.error });
      return;
    }
    const o = await octokitForRepo(repoId, req.memberId!);
    if (!o) {
      res.status(400).json({ error: "GitHub auth required" });
      return;
    }
    const n = parseInt(req.params.number as string, 10);
    if (!Number.isFinite(n)) {
      res.status(400).json({ error: "Invalid issue number" });
      return;
    }
    const issue = await getIssue(o, ref, n);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    res.json(issue);
  }
);

// ── GET /api/github/repos/:repoId/pulls ──────────────────────

githubRouter.get("/repos/:repoId/pulls", async (req: Request, res: Response) => {
  const repoId = req.params.repoId as string;
  const ref = await loadRepo(repoId);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForRepo(repoId, req.memberId!);
  if (!o) {
    res.status(400).json({ error: "GitHub auth required" });
    return;
  }
  const state = (req.query.state as "open" | "closed" | "all") ?? "open";
  const pulls = await listPulls(o, ref, { state });
  res.json({ pulls });
});

// ── GET /api/github/repos/:repoId/pulls/:number ──────────────

githubRouter.get(
  "/repos/:repoId/pulls/:number",
  async (req: Request, res: Response) => {
    const repoId = req.params.repoId as string;
    const ref = await loadRepo(repoId);
    if ("error" in ref) {
      res.status(ref.status).json({ error: ref.error });
      return;
    }
    const o = await octokitForRepo(repoId, req.memberId!);
    if (!o) {
      res.status(400).json({ error: "GitHub auth required" });
      return;
    }
    const n = parseInt(req.params.number as string, 10);
    if (!Number.isFinite(n)) {
      res.status(400).json({ error: "Invalid PR number" });
      return;
    }
    const pr = await getPull(o, ref, n);
    if (!pr) {
      res.status(404).json({ error: "PR not found" });
      return;
    }
    res.json(pr);
  }
);

// ── GET /api/github/repos/:repoId/branches ───────────────────

githubRouter.get("/repos/:repoId/branches", async (req: Request, res: Response) => {
  const repoId = req.params.repoId as string;
  const ref = await loadRepo(repoId);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForRepo(repoId, req.memberId!);
  if (!o) {
    res.status(400).json({ error: "GitHub auth required" });
    return;
  }
  const branches = await listBranches(o, ref);
  res.json({ branches });
});

// ── GET /api/github/repos/:repoId/commits ────────────────────

githubRouter.get("/repos/:repoId/commits", async (req: Request, res: Response) => {
  const repoId = req.params.repoId as string;
  const ref = await loadRepo(repoId);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForRepo(repoId, req.memberId!);
  if (!o) {
    res.status(400).json({ error: "GitHub auth required" });
    return;
  }
  const sha = req.query.sha as string | undefined;
  const path = req.query.path as string | undefined;
  const commits = await listCommits(o, ref, { sha, path });
  res.json({ commits });
});

// ── GET /api/github/repos/:repoId/contents?path=… ────────────
// Returns a folder listing OR a file (with `kind`).

githubRouter.get("/repos/:repoId/contents", async (req: Request, res: Response) => {
  const repoId = req.params.repoId as string;
  const ref = await loadRepo(repoId);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForRepo(repoId, req.memberId!);
  if (!o) {
    res.status(400).json({ error: "GitHub auth required" });
    return;
  }
  const path = (req.query.path as string | undefined) ?? "";
  const entries = await listContents(o, ref, path);
  if (entries) {
    res.json({ kind: "dir", path, entries });
    return;
  }
  // Maybe it's a file
  const file = await getFile(o, ref, path);
  if (file) {
    res.json({ kind: "file", ...file });
    return;
  }
  res.status(404).json({ error: "Path not found" });
});

// ── Phase 2: write/sync routes ───────────────────────────────

// ── POST /api/github/tasks/:taskId/link ──────────────────────
// Body: { kind: "ISSUE", number, repoId } OR { kind: "PR", number, repoId }
// `repoId` selects which of the project's linked repos (ProjectRepo) to act
// on. Creates a GitHubLink and (for ISSUE) posts a back-link comment on GitHub.

githubRouter.post("/tasks/:taskId/link", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId as string;
    const { kind, number, repoId } = req.body as {
      kind?: "ISSUE" | "PR";
      number?: number;
      repoId?: string;
    };
    if (!kind || !["ISSUE", "PR"].includes(kind) || !Number.isFinite(number)) {
      res.status(400).json({ error: "kind and number required" });
      return;
    }
    if (!repoId) {
      res.status(400).json({ error: "repoId required" });
      return;
    }
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    const repo = await loadRepo(repoId);
    if ("error" in repo) {
      res.status(repo.status).json({ error: repo.error });
      return;
    }
    if (repo.projectRepo.projectId !== task.projectId) {
      res.status(400).json({ error: "Repo does not belong to this task's project" });
      return;
    }
    const { owner, repo: repoName } = repo;
    const repoFullName = `${owner}/${repoName}`;

    const o = await octokitForRepo(repoId, req.memberId!);
    if (!o) { res.status(400).json({ error: "GitHub auth required" }); return; }

    if (kind === "ISSUE") {
      const issue = await getIssue(o, { owner, repo: repoName }, number!);
      if (!issue) { res.status(404).json({ error: "Issue not found" }); return; }

      const existing = await linkExists(taskId, task.projectId, "ISSUE", {
        repoFullName,
        number: number!,
      });
      if (existing) {
        res.status(201).json({ ok: true, linkId: existing, alreadyLinked: true });
        return;
      }

      const link = await prisma.gitHubLink.create({
        data: {
          taskId,
          projectId: task.projectId,
          kind: "ISSUE",
          repoFullName,
          refNumber: number!,
          state: issue.state,
          title: issue.title,
          url: issue.url,
          createdById: req.memberId,
          lastSyncedAt: new Date(),
        },
      });

      // Mirror labels into project tags + attach to task
      if (issue.labels.length) {
        const tagIds = await ensureTagsForLabels(task.projectId, issue.labels);
        if (tagIds.length) {
          await prisma.task.update({
            where: { id: taskId },
            data: { tags: { connect: tagIds.map(id => ({ id })) } },
          });
        }
      }

      // Best-effort back-link comment on the issue
      try {
        const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
        const body = `🔗 Linked to ClubPM task: ${frontend}/clubpm/projects/${task.projectId}?task=${taskId}`;
        await o.issues.createComment({ owner, repo: repoName, issue_number: number!, body });
      } catch (err) {
        console.warn("[github] back-link comment failed:", err);
      }

      logAuditEvent({
        projectId: task.projectId,
        taskId,
        memberId:  req.memberId ?? null,
        source:    "WEB",
        eventType: "GITHUB_ISSUE_LINKED",
        payload:   { issueNumber: number, repoId, alreadyLinked: false },
      }).catch(console.error);
      res.status(201).json({ ok: true, linkId: link.id, alreadyLinked: false });
      return;
    }

    // PR linking (lightweight — same logic but no back-link comment)
    const pr = await getPull(o, { owner, repo: repoName }, number!);
    if (!pr) { res.status(404).json({ error: "PR not found" }); return; }

    const existing = await linkExists(taskId, task.projectId, "PR", {
      repoFullName,
      number: number!,
    });
    if (existing) {
      res.status(200).json({ ok: true, linkId: existing, alreadyLinked: true });
      return;
    }
    const link = await prisma.gitHubLink.create({
      data: {
        taskId,
        projectId: task.projectId,
        kind: "PR",
        repoFullName,
        refNumber: number!,
        state: pr.merged ? "merged" : pr.draft ? "draft" : pr.state,
        title: pr.title,
        url: pr.url,
        createdById: req.memberId,
        lastSyncedAt: new Date(),
      },
    });
    logAuditEvent({
      projectId: task.projectId,
      taskId,
      memberId:  req.memberId ?? null,
      source:    "WEB",
      eventType: "GITHUB_PR_LINKED",
      payload:   { prNumber: number, repoId },
    }).catch(console.error);
    res.status(201).json({ ok: true, linkId: link.id });
  } catch (err) {
    console.error("[github] link task error:", err);
    res.status(500).json({ error: "Failed to link" });
  }
});

// ── DELETE /api/github/links/:linkId ─────────────────────────

githubRouter.delete("/links/:linkId", async (req: Request, res: Response) => {
  try {
    await prisma.gitHubLink.delete({ where: { id: req.params.linkId as string } });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: "Link not found" });
  }
});

// ── GET /api/github/tasks/:taskId ────────────────────────────
// Returns the task's links with refreshed live status (PR review/CI).

githubRouter.get("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId as string;
    const links = await refreshTaskLinks({ taskId, actorMemberId: req.memberId! });
    res.json({ links });
  } catch (err) {
    console.error("[github] get task links error:", err);
    res.status(500).json({ error: "Failed to load links" });
  }
});

// ── POST /api/github/tasks/:taskId/issue ─────────────────────
// Body: { repoId }. Create a fresh GitHub issue (in the chosen repo) from a
// task and link them.

githubRouter.post("/tasks/:taskId/issue", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId as string;
    const { repoId } = req.body as { repoId?: string };
    if (!repoId) { res.status(400).json({ error: "repoId required" }); return; }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { tags: true },
    });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    const repo = await loadRepo(repoId);
    if ("error" in repo) { res.status(repo.status).json({ error: repo.error }); return; }
    if (repo.projectRepo.projectId !== task.projectId) {
      res.status(400).json({ error: "Repo does not belong to this task's project" });
      return;
    }
    const { owner, repo: repoName } = repo;

    const o = await octokitForRepo(repoId, req.memberId!);
    if (!o) { res.status(400).json({ error: "GitHub auth required" }); return; }

    let issue;
    try {
      const { data } = await o.issues.create({
        owner,
        repo: repoName,
        title: task.title,
        body: task.description ?? undefined,
        labels: task.tags.map(t => t.name),
      });
      issue = data;
    } catch (err) {
      console.error("[github] create issue from task error:", err);
      res.status(400).json({ error: "Failed to create issue" });
      return;
    }

    const link = await prisma.gitHubLink.create({
      data: {
        taskId,
        projectId: task.projectId,
        kind: "ISSUE",
        repoFullName: `${owner}/${repoName}`,
        refNumber: issue.number,
        state: issue.state,
        title: issue.title,
        url: issue.html_url,
        createdById: req.memberId,
        lastSyncedAt: new Date(),
      },
    });

    logAuditEvent({
      projectId: task.projectId,
      taskId,
      memberId:  req.memberId ?? null,
      source:    "WEB",
      eventType: "GITHUB_ISSUE_LINKED",
      payload:   { issueNumber: issue.number, repoId, created: true },
    }).catch(console.error);
    res.status(201).json({ id: link.id, number: issue.number, url: issue.html_url });
  } catch (err) {
    console.error("[github] create issue from task error:", err);
    res.status(500).json({ error: "Failed to create issue" });
  }
});

// ── POST /api/github/tasks/:taskId/sync ──────────────────────
// Push the task's current title/body/state/labels to its linked issue.

githubRouter.post("/tasks/:taskId/sync", async (req: Request, res: Response) => {
  try {
    const ok = await mirrorTaskToIssue({
      taskId: req.params.taskId as string,
      actorMemberId: req.memberId!,
    });
    if (!ok) { res.status(400).json({ error: "No linked issue or sync failed" }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error("[github] sync task error:", err);
    res.status(500).json({ error: "Failed to sync" });
  }
});

// ── POST /api/github/tasks/:taskId/branch ────────────────────
// Body: { name?, baseRef?, repoId }. If name omitted, server suggests one.

githubRouter.post("/tasks/:taskId/branch", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId as string;
    const { name, baseRef, repoId } = req.body as {
      name?: string;
      baseRef?: string;
      repoId?: string;
    };
    if (!repoId) { res.status(400).json({ error: "repoId required" }); return; }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, title: true, project: { select: { name: true } } },
    });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    const repo = await loadRepo(repoId);
    if ("error" in repo) { res.status(repo.status).json({ error: repo.error }); return; }
    if (repo.projectRepo.projectId !== task.projectId) {
      res.status(400).json({ error: "Repo does not belong to this task's project" });
      return;
    }
    const { owner, repo: repoName } = repo;

    const finalName = (name && name.trim()) || suggestBranchName({
      taskId,
      taskTitle: task.title,
      projectName: task.project.name,
    });

    const o = await octokitForRepo(repoId, req.memberId!);
    if (!o) { res.status(400).json({ error: "GitHub auth required" }); return; }

    try {
      let baseName = baseRef;
      if (!baseName) {
        const { data: repoData } = await o.repos.get({ owner, repo: repoName });
        baseName = repoData.default_branch;
      }
      const { data: baseRefData } = await o.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${baseName}`,
      });
      const baseSha = baseRefData.object.sha;

      await o.git.createRef({
        owner,
        repo: repoName,
        ref: `refs/heads/${finalName}`,
        sha: baseSha,
      });

      const url = `https://github.com/${owner}/${repoName}/tree/${encodeURIComponent(finalName)}`;
      const link = await prisma.gitHubLink.create({
        data: {
          taskId,
          projectId: task.projectId,
          kind: "BRANCH",
          repoFullName: `${owner}/${repoName}`,
          refPath: finalName,
          refSha: baseSha,
          state: "open",
          title: finalName,
          url,
          createdById: req.memberId,
          lastSyncedAt: new Date(),
        },
      });
      logAuditEvent({
        projectId: task.projectId,
        taskId,
        memberId:  req.memberId ?? null,
        source:    "WEB",
        eventType: "GITHUB_BRANCH_CREATED",
        payload:   { branchName: finalName, repoId },
      }).catch(console.error);
      res.status(201).json({ id: link.id, url, sha: baseSha, name: finalName });
    } catch (err: any) {
      // 422 — branch already exists
      const msg = err?.response?.data?.message ?? err?.message ?? "Failed to create branch";
      console.error("[github] create branch error:", msg);
      res.status(400).json({ error: msg });
    }
  } catch (err) {
    console.error("[github] create branch error:", err);
    res.status(500).json({ error: "Failed to create branch" });
  }
});

// ── GET /api/github/tasks/:taskId/branch-suggestion ─────────

githubRouter.get("/tasks/:taskId/branch-suggestion", async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, project: { select: { name: true } } },
  });
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json({
    name: suggestBranchName({
      taskId,
      taskTitle: task.title,
      projectName: task.project.name,
    }),
  });
});

// ── POST /api/github/projects/:id/import-issues ──────────────
// Body: { issueNumbers: number[] }

githubRouter.post("/projects/:id/import-issues", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { issueNumbers } = req.body as { issueNumbers?: number[] };
    if (!Array.isArray(issueNumbers) || issueNumbers.length === 0) {
      res.status(400).json({ error: "issueNumbers required" });
      return;
    }
    const result = await importIssuesAsTasks({
      projectId,
      issueNumbers,
      actorMemberId: req.memberId!,
    });
    logAuditEvent({
      projectId,
      memberId:  req.memberId ?? null,
      source:    "WEB",
      eventType: "GITHUB_ISSUE_IMPORTED",
      payload:   { count: result.created, skipped: result.skipped },
    }).catch(console.error);
    res.json(result);
  } catch (err) {
    console.error("[github] import error:", err);
    res.status(500).json({ error: "Failed to import" });
  }
});

// ── Phase 4: milestones ──────────────────────────────────────

// GET /api/github/repos/:repoId/milestones
// Returns GitHub milestones for the given repo, annotated with their
// ClubPM GitHubMilestoneMap row (if any). Used by MilestonePanel.
githubRouter.get("/repos/:repoId/milestones", async (req: Request, res: Response) => {
  try {
    const repoId = req.params.repoId as string;
    const ref = await loadRepo(repoId);
    if ("error" in ref) {
      res.status(ref.status).json({ error: ref.error });
      return;
    }
    const o = await octokitForRepo(repoId, req.memberId!);
    if (!o) {
      res.status(400).json({ error: "GitHub auth required" });
      return;
    }
    const [ghMilestones, maps] = await Promise.all([
      listMilestones(o, ref, "all"),
      prisma.gitHubMilestoneMap.findMany({
        where: { projectId: ref.projectRepo.projectId, projectRepoId: repoId },
        select: { milestoneId: true, githubMilestoneNumber: true, lastSyncedAt: true },
      }),
    ]);
    const byNumber = new Map(maps.map(m => [m.githubMilestoneNumber, m]));
    const annotated = ghMilestones.map(m => ({
      ...m,
      map: byNumber.get(m.number) ?? null,
    }));
    res.json({ milestones: annotated });
  } catch (err) {
    console.error("[github] list milestones error:", err);
    res.status(500).json({ error: "Failed to list milestones" });
  }
});

// POST /api/github/milestones/:milestoneId/sync
// Sync a ClubPM Milestone to a GitHub milestone (create or update).
// NOTE: syncMilestoneToGitHub is still project/repoFullName-scoped internally
// (Project.githubRepo-era); Phase B3 adds a repoId param to this service
// function and will update this call site to match.
githubRouter.post("/milestones/:milestoneId/sync", async (req: Request, res: Response) => {
  try {
    const result = await syncMilestoneToGitHub({
      milestoneId: req.params.milestoneId as string,
      actorMemberId: req.memberId!,
    });
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[github] sync milestone error:", err);
    res.status(500).json({ error: "Failed to sync milestone" });
  }
});

// GET /api/github/milestones/:milestoneId/progress
// Returns the live open/closed issue counts for a mapped ClubPM milestone.
githubRouter.get("/milestones/:milestoneId/progress", async (req: Request, res: Response) => {
  try {
    const progress = await getMappedMilestoneProgress({
      milestoneId: req.params.milestoneId as string,
      actorMemberId: req.memberId!,
    });
    if (!progress) {
      res.status(404).json({ error: "Milestone not mapped to GitHub" });
      return;
    }
    res.json(progress);
  } catch (err) {
    console.error("[github] milestone progress error:", err);
    res.status(500).json({ error: "Failed to load milestone progress" });
  }
});

// ── Phase 4: contributors / members ──────────────────────────

// GET /api/github/repos/:repoId/contributors
// Returns repo contributors annotated with matched ClubPM member (if any).
// NOTE: discoverContributors is still project-scoped internally (reads
// Project.githubRepo); this route already speaks the /repos/:repoId
// contract — Phase B3 threads repoId through to the service function itself.
githubRouter.get("/repos/:repoId/contributors", async (req: Request, res: Response) => {
  try {
    const repoId = req.params.repoId as string;
    const ref = await loadRepo(repoId);
    if ("error" in ref) {
      res.status(ref.status).json({ error: ref.error });
      return;
    }
    const result = await discoverContributors({
      projectId: ref.projectRepo.projectId,
      actorMemberId: req.memberId!,
    });
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[github] discover contributors error:", err);
    res.status(500).json({ error: "Failed to fetch contributors" });
  }
});

// POST /api/github/projects/:id/import-members
// Body: { links: [{ memberId, githubLogin }] }
// Adds matched contributors as ProjectMembers and sets githubLogin. Project
// membership bookkeeping only — no GitHub API call, so it stays project-scoped.
githubRouter.post("/projects/:id/import-members", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { links } = req.body as { links?: { memberId: string; githubLogin: string }[] };
    if (!Array.isArray(links) || links.length === 0) {
      res.status(400).json({ error: "links array required" });
      return;
    }
    const result = await addContributorsToProject({ projectId, links });
    res.json(result);
  } catch (err) {
    console.error("[github] import members error:", err);
    res.status(500).json({ error: "Failed to import members" });
  }
});

// GET /api/github/repos/:repoId/members/:memberId/stats
// Returns the member's 30-day commit/PR/review counts on this specific repo.
githubRouter.get("/repos/:repoId/members/:memberId/stats", async (req: Request, res: Response) => {
  try {
    const repoId = req.params.repoId as string;
    const memberId = req.params.memberId as string;
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { githubLogin: true },
    });
    if (!member?.githubLogin) {
      res.status(404).json({ error: "Member has no GitHub login" });
      return;
    }
    const ref = await loadRepo(repoId);
    if ("error" in ref) {
      res.status(ref.status).json({ error: ref.error });
      return;
    }
    const o = await octokitForRepo(repoId, req.memberId!);
    if (!o) {
      res.status(400).json({ error: "GitHub auth required" });
      return;
    }
    const stats = await getMemberRepoStats(o, ref, member.githubLogin);
    res.json(stats);
  } catch (err) {
    console.error("[github] member stats error:", err);
    res.status(500).json({ error: "Failed to load member stats" });
  }
});

// ── Phase 4: dashboard feed ──────────────────────────────────

// GET /api/github/dashboard/feed
// Returns the last 10 cross-project GitHub activity events for the caller.
githubRouter.get("/dashboard/feed", async (req: Request, res: Response) => {
  try {
    const events = await recentGithubActivityForMember({
      memberId: req.memberId!,
      limit: 10,
    });
    res.json({ events });
  } catch (err) {
    console.error("[github] dashboard feed error:", err);
    res.status(500).json({ error: "Failed to load GitHub feed" });
  }
});
