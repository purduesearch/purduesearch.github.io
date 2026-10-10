import { prisma } from "../db/prisma.js";
import { accessibleVaultProjectIds } from "./vaultSearchService.js";
import { vaultLink } from "./vaultSearchCore.js";
import { octokitForRepo, listPulls, listIssues, parseRepoUrl } from "./githubService.js";
import { extractFileId, listDriveFolderFiles } from "./driveService.js";
import { runJson } from "./ai/aiRouter.js";
import { fastIntent, tokenize, scoreCandidates, buildRecommendPrompt, normalizeAiPicks, lexicalFallback, type MentionCandidate, type NormalizedRecommendation } from "./slackMentionCore.js";

export interface Candidate extends MentionCandidate {}
export interface Recommendation extends NormalizedRecommendation {}
const TTL = 120_000;
const repoCache = new Map<string, { expires: number; items: Candidate[] }>();
const frontend = () => (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function gatherCandidates(memberId: string, projectIds: string[]): Promise<Candidate[]> {
  const ids = [...new Set(projectIds)];
  if (!ids.length) return [];
  const now = Date.now();
  const vaultProjects = (await accessibleVaultProjectIds(memberId)).filter(id => ids.includes(id));
  const [tasks, vault, links, repos, projects, milestones, attachmentTasks] = await Promise.all([
    prisma.task.findMany({ where: { projectId: { in: ids }, archivedAt: null, OR: [{ status: { not: "DONE" } }, { status: "DONE", completedAt: { gte: new Date(now - 14 * 86_400_000) } }] }, orderBy: { updatedAt: "desc" }, take: 300 }),
    prisma.vaultItem.findMany({ where: { projectId: { in: vaultProjects }, deletedAt: null }, include: { checkedOutBy: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { revision: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.gitHubLink.findMany({ where: { projectId: { in: ids }, createdAt: { gte: new Date(now - 90 * 86_400_000) } }, orderBy: { createdAt: "desc" } }),
    prisma.projectRepo.findMany({ where: { projectId: { in: ids } } }),
    prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, driveLink: true } }),
    prisma.milestone.findMany({ where: { projectId: { in: ids }, completedAt: null } }),
    prisma.task.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, attachments: true } }),
  ]);
  const out: Candidate[] = [];
  const add = (item: Omit<Candidate, "key">) => out.push({ ...item, key: "" });
  for (const t of tasks) add({ kind: "TASK", id: t.id, title: t.title, meta: `${t.status} · ${t.description ?? ""}`, projectId: t.projectId, updatedAt: t.updatedAt, url: `${frontend()}/clubpm/projects/${t.projectId}?task=${t.id}` });
  for (const v of vault) add({ kind: "VAULT_ITEM", id: v.id, title: v.name, meta: `${v.partNumber} · ${v.versions[0]?.revision ?? "Unreleased"} · ${v.checkedOutBy?.displayName ?? "Available"}`, projectId: v.projectId, updatedAt: v.updatedAt, url: `${frontend()}${vaultLink({ projectId: v.projectId, itemId: v.id })}` });
  for (const l of links) add({ kind: "GITHUB", id: l.id, title: l.title ?? l.url, meta: "GitHub link", projectId: l.projectId, url: l.url, updatedAt: l.createdAt });
  const repoItems = await Promise.all(repos.map(async r => {
    // A user-token fallback must never put another member's private results in cache.
    const key = `${memberId}:${r.id}`;
    const cached = repoCache.get(key);
    if (cached && cached.expires > now) return cached.items;
    repoCache.delete(key);
    try {
      const client = await octokitForRepo(r.id, memberId);
      if (!client) return [];
      const ref = parseRepoUrl(r.slug);
      if (!ref) return [];
      const [pulls, issues] = await Promise.all([listPulls(client, ref, { state: "open", perPage: 20 }), listIssues(client, ref, { state: "open", perPage: 20 })]);
      const items: Candidate[] = [...pulls.map(p => ({ ...p, type: "PR" })), ...issues.map(i => ({ ...i, type: "Issue" }))].slice(0, 20).map(x => ({ key: "", kind: "GITHUB", id: `${ref.owner}/${ref.repo}#${x.number}`, title: x.title, meta: `${x.type} #${x.number} · ${r.slug} · open`, projectId: r.projectId, url: x.url, updatedAt: new Date(x.updatedAt) }));
      repoCache.set(key, { expires: now + TTL, items });
      return items;
    } catch { return []; }
  }));
  out.push(...repoItems.flat());
  const seenDrive = new Set<string>();
  const addDrive = (projectId: string, id: string, title: string, url: string) => {
    const key = `${projectId}:${id}`;
    if (seenDrive.has(key)) return;
    seenDrive.add(key);
    add({ kind: "DRIVE_FILE", id, title, meta: "Drive file", projectId, url });
  };
  const driveFiles = await Promise.all(projects.map(async p => {
    const folder = p.driveLink && /\/folders\//.test(p.driveLink) ? extractFileId(p.driveLink) : null;
    try { return { projectId: p.id, files: folder ? await listDriveFolderFiles(folder) : [] }; }
    catch { return { projectId: p.id, files: [] }; }
  }));
  for (const p of driveFiles) for (const f of p.files) addDrive(p.projectId, f.id, f.name, f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`);
  for (const task of attachmentTasks) {
    for (const entry of Array.isArray(task.attachments) ? task.attachments : []) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const url = entry.url;
      if (typeof url !== "string") continue;
      try {
        if (!["drive.google.com", "docs.google.com"].includes(new URL(url).hostname)) continue;
        const id = extractFileId(url);
        if (id) addDrive(task.projectId, id, typeof entry.label === "string" ? entry.label : url, url);
      } catch { /* Malformed attachments cannot prevent recommendations. */ }
    }
  }
  for (const m of milestones) add({ kind: "MILESTONE", id: m.id, title: m.title, meta: "Open milestone", projectId: m.projectId, url: `${frontend()}/clubpm/projects/${m.projectId}` });
  return out.map((item, i) => ({ ...item, key: `c${i + 1}` }));
}

export async function recommend(opts: { memberId: string; projectIds: string[]; text: string; threadText?: string }): Promise<Recommendation> {
  const fast = fastIntent(opts.text);
  const candidates = await gatherCandidates(opts.memberId, opts.projectIds);
  const scored = scoreCandidates(tokenize(`${opts.text}\n${opts.threadText ?? ""}`), candidates, new Date());
  const byKey = new Map(candidates.map(c => [c.key, c]));
  const fallback = lexicalFallback(scored, byKey);
  if (fast && fast.intent !== "ATTACH") return { ...fallback, intent: fast.intent, intentArg: fast.arg };
  const top = scored.map(s => byKey.get(s.key)!).slice(0, 60);
  try {
    const raw = await runJson({ memberId: opts.memberId }, "medium", { prompt: buildRecommendPrompt({ text: opts.text, threadText: opts.threadText, candidates: top }), json: true, maxOutputTokens: 1024 });
    if (raw !== null) return normalizeAiPicks(raw, new Map(top.map(c => [c.key, c])));
  } catch { /* Keep the attach flow available without AI. */ }
  return fallback;
}
