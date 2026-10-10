import type { Member as PrismaMember } from "@prisma/client";
type Member = Pick<PrismaMember, "id" | "isAdmin" | "displayName"> & { timezone?: string | null };
import { prisma } from "../db/prisma.js";
import { getUpcomingEvents } from "./eventService.js";
import { getMemberRsvps } from "./eventRsvpService.js";
import { canRespond, listPolls } from "./pollService.js";
import { getMyVisits } from "./labVisitService.js";
import { extractFileId, listDriveFolderFiles } from "./driveService.js";
import { octokitForRepo, parseRepoUrl, listPulls, listIssues } from "./githubService.js";
import { accessibleVaultProjectIds } from "./vaultSearchService.js";
import { vaultLink } from "./vaultSearchCore.js";
import type { HomeLink, MyWorkData, ProjectsData } from "../slack/views/home.js";
import type { FilesData, CalendarData } from "../slack/views/homeFilesCalendar.js";

const frontend = () => (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const repoCache = new Map<string, { expires: number; pulls: HomeLink[]; issues: HomeLink[] }>();

export async function loadHomeProjects(member: Member) {
  return prisma.project.findMany({
    where: { trainingForMemberId: null, ...(member.isAdmin ? {} : { members: { some: { memberId: member.id } } }) },
    include: {
      members: { where: { memberId: member.id }, select: { isLead: true } },
      tasks: { where: { archivedAt: null, parentTaskId: null }, select: { status: true } },
      milestones: { where: { completedAt: null }, orderBy: { dueDate: "asc" }, take: 1 },
    }, orderBy: { name: "asc" },
  });
}

export async function loadProjectsData(member: Member): Promise<ProjectsData> {
  const projects = await loadHomeProjects(member);
  return { frontendUrl: frontend(), projects: projects.map(p => ({ id: p.id, name: p.name,
    statusCounts: p.tasks.reduce<Record<string, number>>((counts, t) => { counts[t.status] = (counts[t.status] ?? 0) + 1; return counts; }, {}),
    nextMilestone: p.milestones[0] ?? null,
  })) };
}

async function unansweredPolls(member: Member) {
  // Preserve list visibility as well as response access; a link-only poll is not discoverable here.
  const [polls, memberships] = await Promise.all([
    listPolls({ status: "OPEN" }, { memberId: member.id, isAdmin: member.isAdmin }),
    prisma.projectMember.findMany({ where: { memberId: member.id }, select: { projectId: true } }),
  ]);
  const ids = new Set(memberships.map(p => p.projectId));
  return polls.filter(p => !p.responses.some(r => r.memberId === member.id) && canRespond({
    audience: p.audience, organizerId: p.organizerId, allowLinkResponses: p.allowLinkResponses,
    invitedMemberIds: p.invitedMembers.map(m => m.id),
  }, { memberId: member.id, isAdmin: member.isAdmin, isProjectMember: !!p.projectId && ids.has(p.projectId) }).ok)
    .map(p => ({ id: p.id, title: p.title, url: `${frontend()}/schedule/${encodeURIComponent(p.publicToken)}`, answered: false }));
}

async function reviewsFor(member: Member, projectIds: string[], leadIds: string[]) {
  const ids = (await accessibleVaultProjectIds(member.id)).filter(id => projectIds.includes(id));
  return prisma.changeRequest.findMany({
    where: { projectId: { in: ids }, status: "OPEN", OR: [{ reviewerId: member.id }, { projectId: { in: leadIds } }] },
    orderBy: { updatedAt: "desc" },
  });
}
const reviewLink = (r: { id: string; title: string; number: number; projectId: string }): HomeLink => ({
  id: r.id, title: `CR ${r.number}: ${r.title}`, url: `${frontend()}${vaultLink({ projectId: r.projectId, crId: r.id })}`,
});

export async function loadMyWorkData(member: Member): Promise<MyWorkData> {
  const projects = await loadHomeProjects(member);
  const ids = projects.map(p => p.id);
  const [tasks, reviews, polls, visits] = await Promise.all([
    prisma.task.findMany({ where: { assignees: { some: { id: member.id } }, projectId: { in: ids }, archivedAt: null, status: { not: "DONE" } }, include: { project: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
    reviewsFor(member, ids, projects.filter(p => p.members[0]?.isLead).map(p => p.id)),
    unansweredPolls(member), getMyVisits(member.id),
  ]);
  return { frontendUrl: frontend(), now: new Date(), displayName: member.displayName,
    tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, projectName: t.project.name, url: `${frontend()}/clubpm/projects/${t.projectId}?task=${t.id}` })),
    reviews: reviews.map(reviewLink), polls, checkedIn: !!visits.open };
}

export async function loadFilesData(member: Member, projectId?: string): Promise<FilesData> {
  const projects = await loadHomeProjects(member);
  const project = projects.find(p => p.id === projectId) ?? projects[0];
  const data: FilesData = { frontendUrl: frontend(), projects, projectId: project?.id };
  if (!project) return data;
  const folderId = project.driveLink && /\/folders\//.test(project.driveLink) ? extractFileId(project.driveLink) : null;
  const [files, repos, links, vaultIds] = await Promise.all([
    folderId ? listDriveFolderFiles(folderId) : Promise.resolve([]),
    prisma.projectRepo.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } }),
    prisma.gitHubLink.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    accessibleVaultProjectIds(member.id),
  ]);
  data.drive = { folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
    files: [...files].sort((a, b) => (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? "")).slice(0, 8).map(f => ({ id: f.id, title: f.name, url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view` })) };
  const results = await Promise.all(repos.map(async r => {
    const key = `${member.id}:${r.id}`; // OAuth fallback data never crosses member boundaries.
    const cached = repoCache.get(key);
    if (cached && cached.expires > Date.now()) return cached;
    repoCache.delete(key);
    try {
      const ref = parseRepoUrl(r.slug), client = await octokitForRepo(r.id, member.id);
      if (!ref || !client) return { pulls: [], issues: [] };
      const [pulls, issues] = await Promise.all([listPulls(client, ref, { state: "open", perPage: 5 }), listIssues(client, ref, { state: "open", perPage: 10 })]);
      const row = { expires: Date.now() + 120_000,
        pulls: pulls.slice(0, 5).map(p => ({ id: `${r.id}#${p.number}`, title: `${r.slug} #${p.number}: ${p.title}`, url: p.url })),
        issues: issues.slice(0, 5).map(i => ({ id: `${r.id}#${i.number}`, title: `${r.slug} #${i.number}: ${i.title}`, url: i.url })) };
      repoCache.set(key, row);
      return row;
    } catch { return { pulls: [], issues: [] }; }
  }));
  data.github = { repositories: repos.map(r => ({ id: r.id, title: r.slug, url: `https://github.com/${r.slug}` })),
    pullRequests: results.flatMap(r => r.pulls), issues: results.flatMap(r => r.issues),
    recentLinks: links.map(l => ({ id: l.id, title: l.title ?? l.url, url: l.url })) };
  if (vaultIds.includes(project.id)) {
    const [checkouts, reviews, release] = await Promise.all([
      prisma.vaultItem.findMany({ where: { projectId: project.id, checkedOutById: member.id, deletedAt: null }, orderBy: { checkedOutAt: "desc" } }),
      reviewsFor(member, [project.id], project.members[0]?.isLead ? [project.id] : []),
      prisma.vaultRelease.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, include: { changeRequest: { select: { title: true, number: true } } } }),
    ]);
    data.vault = { url: `${frontend()}${vaultLink({ projectId: project.id })}`,
      checkouts: checkouts.map(i => ({ id: i.id, title: `${i.partNumber ?? ""} ${i.name}`.trim(), url: `${frontend()}${vaultLink({ projectId: project.id, itemId: i.id })}` })),
      reviews: reviews.map(reviewLink), latestRelease: release ? { id: release.id, title: `CR ${release.changeRequest.number}: ${release.changeRequest.title}`, url: `${frontend()}${vaultLink({ projectId: project.id, crId: release.changeRequestId })}` } : null };
  }
  return data;
}

export async function loadCalendarData(member: Member): Promise<CalendarData> {
  const [upcoming, projects, polls] = await Promise.all([getUpcomingEvents(14), loadHomeProjects(member), unansweredPolls(member)]);
  const ids = new Set(projects.map(p => p.id));
  const events = upcoming.filter(e => !e.projectId || ids.has(e.projectId));
  const going = await getMemberRsvps(member.id, events.map(e => e.id));
  return { frontendUrl: frontend(), now: new Date(), timezone: member.timezone, polls, events: events.map(e => ({ id: e.id, title: e.title, startsAt: e.startTime, location: e.location, count: e._count.rsvps, going: going.has(e.id), url: `${frontend()}/clubpm/calendar?event=${e.id}` })) };
}
