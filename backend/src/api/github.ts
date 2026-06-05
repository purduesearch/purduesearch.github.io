import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import {
  octokitForMember,
  octokitForProject,
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
  linkTaskToIssue,
  createIssueFromTask,
  mirrorTaskToIssue,
  suggestBranchName,
  createBranchFromTask,
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
// either App-installation (preferred) or the caller's OAuth (fallback).
githubRouter.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────

async function loadProjectRepo(
  projectId: string
): Promise<{ owner: string; repo: string } | { error: string; status: number }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { githubRepo: true },
  });
  if (!project) return { error: "Project not found", status: 404 };
  if (!project.githubRepo) return { error: "No GitHub repo linked", status: 400 };
  const ref = parseRepoUrl(project.githubRepo);
  if (!ref) return { error: "Invalid stored repo identifier", status: 400 };
  return ref;
}

// ── GET /api/github/repo?url=… — validate a repo URL before linking ──
// Used by LinkRepoModal to confirm a URL resolves before PATCHing.

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

// ── GET /api/projects/:id/github/repo — stats for the linked repo ───

githubRouter.get("/projects/:id/repo", async (req: Request, res: Response) => {
  const ref = await loadProjectRepo(req.params.id as string);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForProject(req.params.id as string, req.memberId!);
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

// ── GET /api/projects/:id/github/issues ──────────────────────

githubRouter.get("/projects/:id/issues", async (req: Request, res: Response) => {
  const ref = await loadProjectRepo(req.params.id as string);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForProject(req.params.id as string, req.memberId!);
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

// ── GET /api/projects/:id/github/issues/:number ──────────────

githubRouter.get(
  "/projects/:id/issues/:number",
  async (req: Request, res: Response) => {
    const ref = await loadProjectRepo(req.params.id as string);
    if ("error" in ref) {
      res.status(ref.status).json({ error: ref.error });
      return;
    }
    const o = await octokitForProject(req.params.id as string, req.memberId!);
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

// ── GET /api/projects/:id/github/pulls ───────────────────────

githubRouter.get("/projects/:id/pulls", async (req: Request, res: Response) => {
  const ref = await loadProjectRepo(req.params.id as string);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForProject(req.params.id as string, req.memberId!);
  if (!o) {
    res.status(400).json({ error: "GitHub auth required" });
    return;
  }
  const state = (req.query.state as "open" | "closed" | "all") ?? "open";
  const pulls = await listPulls(o, ref, { state });
  res.json({ pulls });
});

// ── GET /api/projects/:id/github/pulls/:number ───────────────

githubRouter.get(
  "/projects/:id/pulls/:number",
  async (req: Request, res: Response) => {
    const ref = await loadProjectRepo(req.params.id as string);
    if ("error" in ref) {
      res.status(ref.status).json({ error: ref.error });
      return;
    }
    const o = await octokitForProject(req.params.id as string, req.memberId!);
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

// ── GET /api/projects/:id/github/branches ────────────────────

githubRouter.get("/projects/:id/branches", async (req: Request, res: Response) => {
  const ref = await loadProjectRepo(req.params.id as string);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForProject(req.params.id as string, req.memberId!);
  if (!o) {
    res.status(400).json({ error: "GitHub auth required" });
    return;
  }
  const branches = await listBranches(o, ref);
  res.json({ branches });
});

// ── GET /api/projects/:id/github/commits ─────────────────────

githubRouter.get("/projects/:id/commits", async (req: Request, res: Response) => {
  const ref = await loadProjectRepo(req.params.id as string);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForProject(req.params.id as string, req.memberId!);
  if (!o) {
    res.status(400).json({ error: "GitHub auth required" });
    return;
  }
  const sha = req.query.sha as string | undefined;
  const path = req.query.path as string | undefined;
  const commits = await listCommits(o, ref, { sha, path });
  res.json({ commits });
});

// ── GET /api/projects/:id/github/contents?path=… ─────────────
// Returns a folder listing OR a file (with `kind`).

githubRouter.get("/projects/:id/contents", async (req: Request, res: Response) => {
  const ref = await loadProjectRepo(req.params.id as string);
  if ("error" in ref) {
    res.status(ref.status).json({ error: ref.error });
    return;
  }
  const o = await octokitForProject(req.params.id as string, req.memberId!);
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
// Body: { kind: "ISSUE", number } OR { kind: "PR", number }
// Creates a GitHubLink and (for ISSUE) posts a back-link comment on GitHub.

githubRouter.post("/tasks/:taskId/link", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId as string;
    const { kind, number } = req.body as { kind?: "ISSUE" | "PR"; number?: number };
    if (!kind || !["ISSUE", "PR"].includes(kind) || !Number.isFinite(number)) {
      res.status(400).json({ error: "kind and number required" });
      return;
    }
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    if (kind === "ISSUE") {
      const result = await linkTaskToIssue({
        taskId,
        projectId: task.projectId,
        issueNumber: number!,
        actorMemberId: req.memberId!,
      });
      if (!result) {
        res.status(400).json({ error: "Failed to link issue (auth or repo)" });
        return;
      }
      logAuditEvent({
        projectId: task.projectId,
        taskId,
        memberId:  req.memberId ?? null,
        source:    "WEB",
        eventType: "GITHUB_ISSUE_LINKED",
        payload:   { issueNumber: number, alreadyLinked: result.alreadyLinked },
      }).catch(console.error);
      res.status(201).json({ ok: true, linkId: result.id, alreadyLinked: result.alreadyLinked });
      return;
    }

    // PR linking (lightweight — same logic but no back-link comment)
    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
      select: { githubRepo: true },
    });
    if (!project?.githubRepo) { res.status(400).json({ error: "Project has no repo" }); return; }
    const ref = parseRepoUrl(project.githubRepo);
    if (!ref) { res.status(400).json({ error: "Invalid repo" }); return; }
    const o = await octokitForProject(task.projectId, req.memberId!);
    if (!o) { res.status(400).json({ error: "GitHub auth required" }); return; }
    const pr = await getPull(o, ref, number!);
    if (!pr) { res.status(404).json({ error: "PR not found" }); return; }

    const repoFullName = `${ref.owner}/${ref.repo}`;
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
      payload:   { prNumber: number },
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
// Create a fresh GitHub issue from a task and link them.

githubRouter.post("/tasks/:taskId/issue", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId as string;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    const result = await createIssueFromTask({
      taskId,
      projectId: task.projectId,
      actorMemberId: req.memberId!,
    });
    if (!result) { res.status(400).json({ error: "Failed to create issue" }); return; }
    logAuditEvent({
      projectId: task.projectId,
      taskId,
      memberId:  req.memberId ?? null,
      source:    "WEB",
      eventType: "GITHUB_ISSUE_LINKED",
      payload:   { issueNumber: result.number, created: true },
    }).catch(console.error);
    res.status(201).json(result);
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
// Body: { name?, baseRef? }. If name omitted, server suggests one.

githubRouter.post("/tasks/:taskId/branch", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId as string;
    const { name, baseRef } = req.body as { name?: string; baseRef?: string };
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, title: true, project: { select: { name: true } } },
    });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    const finalName = (name && name.trim()) || suggestBranchName({
      taskId,
      taskTitle: task.title,
      projectName: task.project.name,
    });
    const result = await createBranchFromTask({
      taskId,
      projectId: task.projectId,
      name: finalName,
      baseRef,
      actorMemberId: req.memberId!,
    });
    if ("error" in result) { res.status(400).json(result); return; }
    logAuditEvent({
      projectId: task.projectId,
      taskId,
      memberId:  req.memberId ?? null,
      source:    "WEB",
      eventType: "GITHUB_BRANCH_CREATED",
      payload:   { branchName: finalName },
    }).catch(console.error);
    res.status(201).json({ ...result, name: finalName });
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

// GET /api/github/projects/:id/milestones
// Returns GitHub milestones for the linked repo, annotated with their
// ClubPM GitHubMilestoneMap row (if any). Used by MilestonePanel.
githubRouter.get("/projects/:id/milestones", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const ref = await loadProjectRepo(projectId);
    if ("error" in ref) {
      res.status(ref.status).json({ error: ref.error });
      return;
    }
    const o = await octokitForProject(projectId, req.memberId!);
    if (!o) {
      res.status(400).json({ error: "GitHub auth required" });
      return;
    }
    const [ghMilestones, maps] = await Promise.all([
      listMilestones(o, ref, "all"),
      prisma.gitHubMilestoneMap.findMany({
        where: { projectId },
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

// GET /api/github/projects/:id/contributors
// Returns repo contributors annotated with matched ClubPM member (if any).
githubRouter.get("/projects/:id/contributors", async (req: Request, res: Response) => {
  try {
    const result = await discoverContributors({
      projectId: req.params.id as string,
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
// Adds matched contributors as ProjectMembers and sets githubLogin.
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

// GET /api/github/members/:memberId/stats?projectId=…
// Returns the member's 30-day commit/PR/review counts on the project's repo.
githubRouter.get("/members/:memberId/stats", async (req: Request, res: Response) => {
  try {
    const memberId = req.params.memberId as string;
    const projectId = req.query.projectId as string | undefined;
    if (!projectId) {
      res.status(400).json({ error: "projectId query param required" });
      return;
    }
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { githubLogin: true },
    });
    if (!member?.githubLogin) {
      res.status(404).json({ error: "Member has no GitHub login" });
      return;
    }
    const ref = await loadProjectRepo(projectId);
    if ("error" in ref) {
      res.status(ref.status).json({ error: ref.error });
      return;
    }
    const o = await octokitForProject(projectId, req.memberId!);
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
