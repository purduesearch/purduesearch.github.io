import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { generatePressKitPlan, type PressKitPlanInput } from "./aiService.js";
import { buildDocFromPlan, type SectionPlan, type PlanData } from "./sectionPlan.js";
import { renderJsonToHtml, type PMDoc } from "./blogRender.js";

// ── Config ───────────────────────────────────────────────────

export type PressKitAudience = "SPONSORS" | "PRESS" | "RECRUITING" | "GENERAL";

export interface PressKitConfig {
  audience: PressKitAudience;
  includedSections: string[];
  accentColor: string;
  contactEmail: string;
  showContact: boolean;
}

export const SECTION_IDS = [
  "masthead", "about", "aboutSearch", "stats", "building",
  "timeline", "tech", "team", "highlights", "links", "contact", "sponsorship",
] as const;

const AUDIENCES: PressKitAudience[] = ["SPONSORS", "PRESS", "RECRUITING", "GENERAL"];

export const DEFAULT_PRESS_KIT_CONFIG: PressKitConfig = {
  audience: "GENERAL",
  includedSections: [...SECTION_IDS].filter((s) => s !== "sponsorship"),
  accentColor: "#00e5cc",
  contactEmail: "",
  showContact: true,
};

export function normalizePressKitConfig(raw: unknown): PressKitConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const audience = AUDIENCES.includes(r.audience as PressKitAudience)
    ? (r.audience as PressKitAudience) : DEFAULT_PRESS_KIT_CONFIG.audience;
  const sections = Array.isArray(r.includedSections)
    ? (r.includedSections as unknown[]).filter((s): s is string => typeof s === "string"
        && (SECTION_IDS as readonly string[]).includes(s))
    : DEFAULT_PRESS_KIT_CONFIG.includedSections;
  const accentColor = typeof r.accentColor === "string"
      && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(r.accentColor)
    ? r.accentColor : DEFAULT_PRESS_KIT_CONFIG.accentColor;
  const contactEmail = typeof r.contactEmail === "string" ? r.contactEmail : "";
  const showContact = typeof r.showContact === "boolean" ? r.showContact : true;
  return {
    audience,
    includedSections: sections.length ? sections : DEFAULT_PRESS_KIT_CONFIG.includedSections,
    accentColor, contactEmail, showContact,
  };
}

// ── Data snapshot ────────────────────────────────────────────

export interface PressKitContext {
  project: { name: string; type: string; status: string; description: string | null;
             startDate: Date | null; targetDate: Date | null; programTag: string | null;
             githubRepo: string | null; driveLink: string | null };
  stats: { teamSize: number; tasksDone: number; tasksTotal: number;
           milestonesHit: number; hoursLogged: number; durationDays: number | null;
           commentCount: number };
  /**
   * Up to 200 tasks, newest-completed first. Subtasks ARE included (they are real
   * work and the model should see them) — `isSubtask` / `parentTitle` disambiguate.
   * `description` is trimmed to 240 chars so a few essay-length tasks can't crowd
   * the model's context.
   */
  tasks: { title: string; description: string | null; status: string; priority: string;
           assignees: string[]; completedAt: Date | null;
           isSubtask: boolean; parentTitle: string | null }[];
  /**
   * ALL statuses (cap 25) — the model needs in-flight milestones to write about
   * where the project is headed. Anything that RENDERS a milestone into the
   * published kit must filter to `status === "COMPLETED"` itself; see
   * `completedMilestones()` below. `stats.milestonesHit` is counted separately in
   * the DB, so it is not capped by this 25.
   */
  milestones: { title: string; description: string | null; completedAt: Date | null;
                dueDate: Date | null; status: string;
                taskCount: number; doneCount: number }[];
  blockers: { label: string; resolved: boolean; taskCount: number }[];
  dependencies: { openCount: number; examples: { blocker: string; blocked: string }[] };
  github: { repo: string | null; mergedPrCount: number; openPrCount: number;
            recentMergedPrs: string[]; branchCount: number };
  updates: { kind: "update" | "standup"; text: string; author: string | null; at: Date }[];
  /** Logged hours bucketed by calendar month, oldest first, last 24 months. */
  timeByMonth: { month: string; hours: number }[];
  topTimeTasks: { title: string; hours: number }[];
  /** Completion throughput from `Task.completedAt`, last 12 months, oldest first. */
  velocity: { byMonth: { month: string; completed: number }[];
              pacePerMonth: number; daysToTarget: number | null };
  contributors: { displayName: string; tasksDone: number; hours: number }[];
  timeline: { title: string; date: Date | null; kind: "milestone" | "task" }[];
  team: { displayName: string; title: string | null; role: string | null;
          avatarUrl: string | null; isLead: boolean;
          rank: string | null; projectRole: string | null; joinedAt: Date | null }[];
  deliverables: { vaultItemCount: number; vaultItemNames: string[]; attachmentCount: number };
  tags: string[];
  /** Same tags as `tags`, with how many tasks carry each. */
  tagUsage: { name: string; count: number }[];
  links: { label: string; url: string }[];
}

/**
 * The COMPLETED subset of `ctx.milestones`. `ctx.milestones` deliberately carries
 * every status for the model's benefit, so every deterministic render path that
 * shows milestones as achievements goes through this.
 */
function completedMilestones(ctx: PressKitContext): PressKitContext["milestones"] {
  return ctx.milestones.filter((m) => m.status === "COMPLETED");
}

export interface PressKitProse { about: string; aboutSearch: string; building: string; sponsorship: string }

// ── Markdown assembly (pure) ─────────────────────────────────

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function buildPressKitMarkdown(
  ctx: PressKitContext, config: PressKitConfig, prose: PressKitProse,
): string {
  const has = (id: string) => config.includedSections.includes(id);
  const out: string[] = [];
  const p = ctx.project;

  if (has("masthead")) {
    out.push(`# ${p.name}`);
    const meta = [p.type, p.status, p.programTag ? `Program: ${p.programTag}` : ""]
      .filter(Boolean).join(" · ");
    if (meta) out.push(`*${meta}*`);
    out.push("");
  }
  if (has("about") && prose.about) { out.push("## About This Project", prose.about, ""); }
  if (has("aboutSearch") && prose.aboutSearch) { out.push("## About Purdue SEARCH", prose.aboutSearch, ""); }

  if (has("stats")) {
    out.push("## By the Numbers", "");
    out.push("| Metric | Value |", "| --- | --- |");
    out.push(`| Team members | ${ctx.stats.teamSize} |`);
    out.push(`| Tasks completed | ${ctx.stats.tasksDone} of ${ctx.stats.tasksTotal} |`);
    out.push(`| Milestones reached | ${ctx.stats.milestonesHit} |`);
    out.push(`| Hours logged | ${ctx.stats.hoursLogged} |`);
    if (ctx.stats.durationDays != null) out.push(`| Days active | ${ctx.stats.durationDays} |`);
    out.push(`| Comments | ${ctx.stats.commentCount} |`);
    out.push("");
  }
  if (has("building") && prose.building) { out.push("## What We're Building", prose.building, ""); }

  if (has("timeline") && (ctx.timeline.length || p.targetDate)) {
    out.push("## Timeline & Milestones", "");
    for (const e of ctx.timeline) {
      const when = e.date ? ` — ${fmtDate(e.date)}` : "";
      out.push(`- **${e.title}**${when}`);
    }
    if (p.targetDate) out.push(`- **Target completion** — ${fmtDate(p.targetDate)}`);
    out.push("");
  }
  if (has("tech") && ctx.tags.length) {
    out.push("## Tech & Tools", ctx.tags.join(" · "), "");
  }
  if (has("team") && (ctx.team.length || ctx.contributors.length)) {
    out.push("## Team & Leadership", "");
    for (const t of ctx.team) {
      const lead = t.isLead ? " *(Lead)*" : "";
      const title = t.title ? ` — ${t.title}` : "";
      out.push(`- **${t.displayName}**${title}${lead}`);
    }
    if (ctx.contributors.length) {
      out.push("", "**Top contributors**");
      for (const c of ctx.contributors.slice(0, 6)) {
        out.push(`- ${c.displayName} — ${c.tasksDone} tasks, ${c.hours} h`);
      }
    }
    out.push("");
  }
  // Highlights are achievements, so completed-only even though ctx.milestones
  // now carries every status for the model's benefit.
  const done = completedMilestones(ctx);
  if (has("highlights") && done.length) {
    out.push("## Highlights", "");
    for (const m of done.slice(0, 5)) out.push(`- ${m.title}`);
    out.push("");
  }
  if (has("links") && ctx.links.length) {
    out.push("## Links", "");
    for (const l of ctx.links) out.push(`- [${l.label}](${l.url})`);
    out.push("");
  }
  if (has("contact") && config.showContact && config.contactEmail) {
    out.push("## Contact", `For press or partnership inquiries: ${config.contactEmail}`, "");
  }
  if (has("sponsorship") && config.audience === "SPONSORS" && prose.sponsorship) {
    out.push("## Support This Project", prose.sponsorship, "");
  }

  return out.join("\n");
}

// ── Section-plan assembly ────────────────────────────────────

/** Deterministic stat tiles for the `stats` placeholder (never model-dependent). */
function buildStatTiles(ctx: PressKitContext): { label: string; value: string }[] {
  const s = ctx.stats;
  const tiles = [
    { label: "TEAM", value: String(s.teamSize) },
    { label: "TASKS DONE", value: `${s.tasksDone}/${s.tasksTotal}` },
    { label: "MILESTONES", value: String(s.milestonesHit) },
    { label: "HOURS", value: String(s.hoursLogged) },
  ];
  if (s.durationDays != null) tiles.push({ label: "DAYS ACTIVE", value: String(s.durationDays) });
  return tiles;
}

/** Deterministic dated entries for the `timeline` placeholder. */
function buildTimelineData(ctx: PressKitContext): { title: string; date: string | null }[] {
  const items = ctx.timeline.map((e) => ({ title: e.title, date: fmtDate(e.date) || null }));
  if (ctx.project.targetDate) items.push({ title: "Target completion", date: fmtDate(ctx.project.targetDate) || null });
  return items;
}

/**
 * A structured section plan built without the AI — used when the model is
 * unavailable or returns nothing, so generation still yields a designed,
 * section-based kit (not a flat block). Prose is limited to what live data
 * provides; placeholders are filled downstream from `PlanData`.
 */
export function fallbackPressKitPlan(ctx: PressKitContext, config: PressKitConfig): SectionPlan {
  const has = (id: string) => config.includedSections.includes(id);
  const p = ctx.project;
  const sections: SectionPlan["sections"] = [];

  if (has("masthead")) {
    sections.push({ type: "hero", heading: p.name, subheading: [p.type, p.status].filter(Boolean).join(" · "), align: "center" });
  }
  if (has("about") && p.description) {
    sections.push({ type: "richText", heading: "About This Project", markdown: p.description });
  }
  if (has("aboutSearch")) {
    sections.push({ type: "richText", heading: "About Purdue SEARCH",
      markdown: "Purdue SEARCH (Students for the Exploration and Research of Space) is a student engineering organization at Purdue University building hands-on space research and hardware projects." });
  }
  if (has("stats")) sections.push({ type: "stats", heading: "By the Numbers" });
  if (has("timeline")) sections.push({ type: "timeline", heading: "Timeline & Milestones" });
  if (has("tech") && ctx.tags.length) {
    sections.push({ type: "richText", heading: "Tech & Tools", markdown: ctx.tags.join(" · ") });
  }
  if (has("team")) sections.push({ type: "team", heading: "Team & Leadership" });
  const done = completedMilestones(ctx);
  if (has("highlights") && done.length) {
    sections.push({ type: "richText", heading: "Highlights",
      markdown: done.slice(0, 5).map((m) => `- ${m.title}`).join("\n") });
  }
  if (has("links")) sections.push({ type: "links", heading: "Links" });
  if (has("contact") && config.showContact && config.contactEmail) {
    sections.push({ type: "richText", heading: "Contact", markdown: `For press or partnership inquiries: ${config.contactEmail}` });
  }
  if (has("sponsorship") && config.audience === "SPONSORS") {
    sections.push({ type: "cta", label: "Become a sponsor",
      href: config.contactEmail ? `mailto:${config.contactEmail}` : "", style: "solid" });
  }
  return { sections };
}

// ── Token ────────────────────────────────────────────────────

export async function ensurePressKitToken(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId }, select: { pressKitToken: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.pressKitToken) return project.pressKitToken;
  const token = randomBytes(16).toString("hex");
  await prisma.project.update({ where: { id: projectId }, data: { pressKitToken: token } });
  return token;
}

// ── Gather live project data into a PressKitContext ──────────

/** UTC "YYYY-MM" bucket key. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

/** Bucket `{ at, n }` rows into ascending month keys, keeping the last `take`. */
function bucketByMonth(rows: { at: Date; n: number }[], take: number): { month: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = monthKey(new Date(r.at));
    m.set(k, (m.get(k) ?? 0) + r.n);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(-take)
    .map(([month, n]) => ({ month, n }));
}

export async function gatherPressKitData(projectId: string): Promise<PressKitContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tags: { include: { _count: { select: { tasks: true } } } },
      members: { include: { member: { select: {
        id: true, displayName: true, title: true, role: true, avatarUrl: true, rank: true,
      } } } },
      // ALL statuses now — the model needs in-flight work, not just wins. Anything
      // that renders milestones as achievements filters with completedMilestones().
      milestones: {
        orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { dueDate: "asc" }],
        take: 25,
      },
    },
  });
  if (!project) return null;

  // Every query added here is `.catch`ed to an empty value: an unlinked GitHub
  // repo, an empty vault, or a project with no logged time must still produce a
  // press kit rather than 500 the whole generation.
  const [
    tasksTotal, tasksDone, hoursAgg, commentCount, timeLogsByMember,
    milestonesHit, doneAssigneeRows, taskRows, milestoneTaskCounts,
    blockerRows, depOpenCount, depExamples, ghLinkGroups, mergedPrLogs,
    updateRows, standupLogs, timeLogRows, topTimeGroups, completedTaskRows,
    vaultItemRows, vaultItemCount, attachmentRows,
  ] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.task.count({ where: { projectId, status: "DONE" } }),
    prisma.timeLog.aggregate({ where: { task: { projectId } }, _sum: { minutes: true } }),
    prisma.taskComment.count({ where: { task: { projectId } } }),
    prisma.timeLog.groupBy({ by: ["memberId"], where: { task: { projectId } }, _sum: { minutes: true } }).catch(() => [] as { memberId: string; _sum: { minutes: number | null } }[]),
    // Counted in the DB, not off `project.milestones`, so the take:25 cap above
    // can never undercount the headline stat.
    prisma.milestone.count({ where: { projectId, status: "COMPLETED" } }).catch(() => 0),
    // Replaces a per-member `task.count` loop (N+1) with one pass.
    prisma.task.findMany({
      where: { projectId, status: "DONE" },
      select: { assignees: { select: { id: true } } },
    }).catch(() => [] as { assignees: { id: string }[] }[]),
    // Subtasks included on purpose — the `parentTaskId: null` filter is gone.
    prisma.task.findMany({
      where: { projectId },
      select: {
        title: true, description: true, status: true, priority: true, completedAt: true,
        parentTaskId: true,
        parentTask: { select: { title: true } },
        assignees: { select: { displayName: true } },
      },
      orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    }).catch(() => [] as {
      title: string; description: string | null; status: string; priority: string;
      completedAt: Date | null; parentTaskId: string | null;
      parentTask: { title: string } | null; assignees: { displayName: string }[];
    }[]),
    prisma.task.groupBy({
      by: ["milestoneId", "status"],
      where: { projectId, milestoneId: { not: null } },
      _count: { _all: true },
    }).catch(() => [] as { milestoneId: string | null; status: string; _count: { _all: number } }[]),
    prisma.blocker.findMany({
      where: { projectId },
      select: { label: true, resolvedAt: true, _count: { select: { tasks: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }).catch(() => [] as { label: string; resolvedAt: Date | null; _count: { tasks: number } }[]),
    prisma.taskDependency.count({
      where: { blockedTask: { projectId }, blockingTask: { status: { not: "DONE" } } },
    }).catch(() => 0),
    prisma.taskDependency.findMany({
      where: { blockedTask: { projectId }, blockingTask: { status: { not: "DONE" } } },
      select: { blockingTask: { select: { title: true } }, blockedTask: { select: { title: true } } },
      take: 5,
    }).catch(() => [] as { blockingTask: { title: string }; blockedTask: { title: string } }[]),
    prisma.gitHubLink.groupBy({
      by: ["kind", "state"], where: { projectId }, _count: { _all: true },
    }).catch(() => [] as { kind: string; state: string | null; _count: { _all: number } }[]),
    prisma.activityLog.findMany({
      where: { projectId, eventType: "GITHUB_PR_MERGED" },
      select: { payload: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }).catch(() => [] as { payload: unknown }[]),
    prisma.projectUpdate.findMany({
      where: { projectId },
      select: { content: true, postedAt: true, author: { select: { displayName: true } } },
      orderBy: { postedAt: "desc" },
      take: 15,
    }).catch(() => [] as { content: string; postedAt: Date; author: { displayName: string } | null }[]),
    prisma.activityLog.findMany({
      where: { projectId, eventType: "STANDUP_POSTED" },
      select: { payload: true, createdAt: true, member: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }).catch(() => [] as { payload: unknown; createdAt: Date; member: { displayName: string } | null }[]),
    prisma.timeLog.findMany({
      where: { task: { projectId }, loggedAt: { gte: monthsAgo(24) } },
      select: { loggedAt: true, minutes: true },
    }).catch(() => [] as { loggedAt: Date; minutes: number }[]),
    prisma.timeLog.groupBy({
      by: ["taskId"], where: { task: { projectId } }, _sum: { minutes: true },
      orderBy: { _sum: { minutes: "desc" } }, take: 10,
    }).catch(() => [] as { taskId: string; _sum: { minutes: number | null } }[]),
    prisma.task.findMany({
      where: { projectId, completedAt: { gte: monthsAgo(12) } },
      select: { completedAt: true },
    }).catch(() => [] as { completedAt: Date | null }[]),
    prisma.vaultItem.findMany({
      where: { projectId, deletedAt: null },
      select: { name: true }, orderBy: { updatedAt: "desc" }, take: 20,
    }).catch(() => [] as { name: string }[]),
    prisma.vaultItem.count({ where: { projectId, deletedAt: null } }).catch(() => 0),
    prisma.task.findMany({ where: { projectId }, select: { attachments: true } })
      .catch(() => [] as { attachments: unknown }[]),
  ]);

  // Dependent on topTimeGroups, so it cannot join the batch above.
  const topTimeTaskRows = topTimeGroups.length
    ? await prisma.task.findMany({
        where: { id: { in: topTimeGroups.map((g) => g.taskId) } },
        select: { id: true, title: true },
      }).catch(() => [] as { id: string; title: string }[])
    : [];
  const topTimeTitles = new Map(topTimeTaskRows.map((t) => [t.id, t.title]));
  const topTimeTasks = topTimeGroups
    .map((g) => ({
      title: topTimeTitles.get(g.taskId) ?? "Untitled task",
      hours: Math.round((g._sum.minutes ?? 0) / 60),
    }))
    .filter((t) => t.hours > 0);

  const durationDays = project.startDate
    ? Math.max(0, Math.round((Date.now() - new Date(project.startDate).getTime()) / 86_400_000))
    : null;

  const hoursByMember = new Map<string, number>(
    timeLogsByMember.map((r) => [r.memberId, Math.round((r._sum.minutes ?? 0) / 60)])
  );
  const doneByMember = new Map<string, number>();
  for (const t of doneAssigneeRows) {
    for (const a of t.assignees) doneByMember.set(a.id, (doneByMember.get(a.id) ?? 0) + 1);
  }
  const contributors = project.members
    .map((pm) => ({
      displayName: pm.member.displayName,
      tasksDone: doneByMember.get(pm.member.id) ?? 0,
      hours: hoursByMember.get(pm.member.id) ?? 0,
    }))
    .filter((c) => c.tasksDone > 0 || c.hours > 0)
    .sort((a, b) => (b.tasksDone + b.hours) - (a.tasksDone + a.hours));

  // Milestone task rollups, keyed by milestone id.
  const msTotal = new Map<string, number>();
  const msDone = new Map<string, number>();
  for (const row of milestoneTaskCounts) {
    if (!row.milestoneId) continue;
    const n = row._count._all;
    msTotal.set(row.milestoneId, (msTotal.get(row.milestoneId) ?? 0) + n);
    if (row.status === "DONE") msDone.set(row.milestoneId, (msDone.get(row.milestoneId) ?? 0) + n);
  }

  // The public timeline stays completed-only — see completedMilestones().
  const timeline = project.milestones
    .filter((m) => m.status === "COMPLETED")
    .map((m) => ({ title: m.title, date: m.completedAt, kind: "milestone" as const }))
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  const team = project.members.map((pm) => ({
    displayName: pm.member.displayName,
    title: pm.member.title,
    role: pm.member.role,
    avatarUrl: pm.member.avatarUrl,
    isLead: (pm.projectRole ?? "").toUpperCase() === "LEAD",
    rank: pm.member.rank ?? null,
    projectRole: pm.projectRole ?? null,
    joinedAt: pm.joinedAt ?? null,
  }));

  let mergedPrCount = 0, openPrCount = 0, branchCount = 0;
  for (const g of ghLinkGroups) {
    const n = g._count._all;
    if (g.kind === "BRANCH") branchCount += n;
    else if (g.kind === "PR") {
      if (g.state === "merged") mergedPrCount += n;
      else if (g.state === "open" || g.state === "draft") openPrCount += n;
    }
  }
  const recentMergedPrs = mergedPrLogs
    .map((l) => String((l.payload as { title?: unknown } | null)?.title ?? "").trim())
    .filter(Boolean)
    .slice(0, 15);
  // The webhook writes one GITHUB_PR_MERGED audit row per merge, so it is the
  // better floor when GitHubLink rows were never created (unlinked PRs).
  mergedPrCount = Math.max(mergedPrCount, recentMergedPrs.length);

  const updates: PressKitContext["updates"] = [
    ...updateRows.map((u) => ({
      kind: "update" as const,
      text: (u.content ?? "").slice(0, 300),
      author: u.author?.displayName ?? null,
      at: u.postedAt,
    })),
    ...standupLogs.map((l) => ({
      kind: "standup" as const,
      text: String((l.payload as { preview?: unknown } | null)?.preview ?? "").slice(0, 300),
      author: l.member?.displayName ?? null,
      at: l.createdAt,
    })),
  ]
    .filter((u) => u.text.trim().length > 0)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 15);

  const timeByMonth = bucketByMonth(
    timeLogRows.map((r) => ({ at: r.loggedAt, n: r.minutes })), 24,
  ).map((r) => ({ month: r.month, hours: Math.round(r.n / 60) }));

  const velocityMonths = bucketByMonth(
    completedTaskRows
      .filter((t): t is { completedAt: Date } => t.completedAt != null)
      .map((t) => ({ at: t.completedAt, n: 1 })),
    12,
  ).map((r) => ({ month: r.month, completed: r.n }));
  const productiveMonths = velocityMonths.filter((m) => m.completed > 0);
  const pacePerMonth = productiveMonths.length
    ? Math.round((productiveMonths.reduce((s, m) => s + m.completed, 0) / productiveMonths.length) * 10) / 10
    : 0;
  const daysToTarget = project.targetDate
    ? Math.round((new Date(project.targetDate).getTime() - Date.now()) / 86_400_000)
    : null;

  let attachmentCount = 0;
  for (const r of attachmentRows) {
    if (Array.isArray(r.attachments)) attachmentCount += r.attachments.length;
  }

  const links: { label: string; url: string }[] = [];
  if (project.githubRepo) links.push({ label: "GitHub", url: `https://github.com/${project.githubRepo}` });
  if (project.driveLink) links.push({ label: "Drive", url: project.driveLink });
  if (project.programTag) links.push({ label: "Program page", url: `https://purduesearch.org/${project.programTag}` });
  links.push({ label: "Purdue SEARCH", url: "https://purduesearch.org" });

  return {
    project: {
      name: project.name, type: project.type, status: project.status,
      description: project.description, startDate: project.startDate, targetDate: project.targetDate,
      programTag: project.programTag, githubRepo: project.githubRepo, driveLink: project.driveLink,
    },
    stats: {
      teamSize: project.members.length,
      tasksDone, tasksTotal,
      milestonesHit,
      hoursLogged: Math.round((hoursAgg._sum.minutes ?? 0) / 60),
      durationDays,
      commentCount,
    },
    tasks: taskRows.map((t) => ({
      title: t.title,
      description: t.description ? t.description.slice(0, 240) : null,
      status: t.status,
      priority: t.priority,
      assignees: t.assignees.map((a) => a.displayName),
      completedAt: t.completedAt,
      isSubtask: t.parentTaskId != null,
      parentTitle: t.parentTask?.title ?? null,
    })),
    milestones: project.milestones.map((m) => ({
      title: m.title, description: m.description, completedAt: m.completedAt,
      dueDate: m.dueDate, status: m.status,
      taskCount: msTotal.get(m.id) ?? 0,
      doneCount: msDone.get(m.id) ?? 0,
    })),
    blockers: blockerRows.map((b) => ({
      label: b.label, resolved: b.resolvedAt != null, taskCount: b._count.tasks,
    })),
    dependencies: {
      openCount: depOpenCount,
      examples: depExamples.map((d) => ({
        blocker: d.blockingTask.title, blocked: d.blockedTask.title,
      })),
    },
    github: {
      repo: project.githubRepo, mergedPrCount, openPrCount, recentMergedPrs, branchCount,
    },
    updates,
    timeByMonth,
    topTimeTasks,
    velocity: { byMonth: velocityMonths, pacePerMonth, daysToTarget },
    contributors,
    timeline,
    team,
    deliverables: {
      vaultItemCount, vaultItemNames: vaultItemRows.map((v) => v.name), attachmentCount,
    },
    tags: project.tags.map((t) => t.name),
    tagUsage: project.tags.map((t) => ({ name: t.name, count: t._count.tasks })),
    links,
  };
}

// ── Full generation: data + AI + markdown -> TipTap JSON ─────

export async function generatePressKitContent(
  projectId: string, config: PressKitConfig, memberId?: string | null,
): Promise<PMDoc | null> {
  const ctx = await gatherPressKitData(projectId);
  if (!ctx) return null;

  // Deterministic data the placeholder sections render from — gated by config so a
  // disabled section stays empty even if the model references it.
  const has = (id: string) => config.includedSections.includes(id);
  const planData: PlanData = {
    stats: has("stats") ? buildStatTiles(ctx) : undefined,
    timeline: has("timeline") ? buildTimelineData(ctx) : undefined,
    team: has("team") ? ctx.team.map((t) => ({ displayName: t.displayName, title: t.title, isLead: t.isLead })) : undefined,
    contributors: has("team") ? ctx.contributors : undefined,
    links: has("links") ? ctx.links : undefined,
  };

  // Full live snapshot for the model — grounds every generated statement in real data.
  const input: PressKitPlanInput = {
    name: ctx.project.name, type: ctx.project.type, status: ctx.project.status,
    description: ctx.project.description,
    programTag: ctx.project.programTag, githubRepo: ctx.project.githubRepo,
    startDate: fmtDate(ctx.project.startDate) || null,
    targetDate: fmtDate(ctx.project.targetDate) || null,
    stats: ctx.stats,
    milestones: ctx.milestones.map((m) => ({
      title: m.title, date: fmtDate(m.completedAt) || null, description: m.description,
      dueDate: fmtDate(m.dueDate) || null, status: m.status,
      taskCount: m.taskCount, doneCount: m.doneCount,
    })),
    tasks: ctx.tasks.map((t) => ({
      title: t.title, description: t.description, status: t.status, priority: t.priority,
      assignees: t.assignees, completedAt: fmtDate(t.completedAt) || null,
      isSubtask: t.isSubtask, parentTitle: t.parentTitle,
    })),
    blockers: ctx.blockers,
    dependencies: ctx.dependencies,
    github: ctx.github,
    updates: ctx.updates.map((u) => ({
      kind: u.kind, text: u.text, author: u.author, at: fmtDate(u.at) || null,
    })),
    timeByMonth: ctx.timeByMonth,
    topTimeTasks: ctx.topTimeTasks,
    velocity: ctx.velocity,
    deliverables: ctx.deliverables,
    contributors: ctx.contributors,
    team: ctx.team.map((t) => ({
      displayName: t.displayName, title: t.title, role: t.role, isLead: t.isLead,
      rank: t.rank, projectRole: t.projectRole, joinedAt: fmtDate(t.joinedAt) || null,
    })),
    tags: ctx.tags,
    tagUsage: ctx.tagUsage,
    links: ctx.links,
    enabledSections: config.includedSections,
    showContact: config.showContact,
    contactEmail: config.contactEmail,
  };

  const plan = (await generatePressKitPlan(input, config.audience, memberId)) ?? fallbackPressKitPlan(ctx, config);
  return buildDocFromPlan(plan, planData);
}

// ── Public HTML render (print-styled shell around the doc) ───

const PRINT_STYLES = `
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1d29; line-height: 1.6;
    margin: 0; padding: 40px 52px; max-width: 8.5in; background: #fff; }
  h1 { font-size: 30px; margin: 0 0 4px; color: #0a1929; letter-spacing: -0.5px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--accent);
    border-bottom: 2px solid var(--accent); padding-bottom: 4px; margin: 26px 0 10px; }
  h3 { font-size: 14px; margin: 18px 0 6px; }
  p { font-size: 13.5px; margin: 6px 0; }
  ul, ol { font-size: 13.5px; margin: 6px 0 6px 20px; }
  li { margin: 3px 0; }
  a { color: var(--accent); text-decoration: none; }
  blockquote { border-left: 3px solid var(--accent); margin: 10px 0; padding: 2px 14px; color: #444; background: #f7fbfc; }
  hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
  table.cpm-blog-table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; }
  table.cpm-blog-table td, table.cpm-blog-table th { border: 1px solid #e2e6ea; padding: 6px 10px; text-align: left; }
  table.cpm-blog-table th { background: #f2f6f8; }
  figure.cpm-blog-figure { margin: 12px 0; text-align: center; }
  figure.cpm-blog-figure img { max-width: 100%; border-radius: 4px; }
  figure.cpm-blog-figure figcaption { font-size: 11px; color: #888; margin-top: 4px; }
  .cpm-blog-callout { border-left: 3px solid var(--accent); background: #f6fbfc; padding: 10px 14px; margin: 12px 0; border-radius: 4px; }
  nav.cpm-blog-toc { display: none; }
  .pk-brand { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 3px solid var(--accent); padding-bottom: 10px; margin-bottom: 24px; }
  .pk-brand h2 { border: none; margin: 0; padding: 0; color: var(--accent); }
  .pk-brand .sub { font-size: 11px; color: #666; }
  .pk-footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #ddd; font-size: 10px; color: #888; text-align: center; }
  @media screen { body { box-shadow: 0 0 24px rgba(0,0,0,0.08); margin: 20px auto; border-radius: 4px; }
    .print-hint { position: fixed; top: 10px; right: 10px; background: var(--accent); color: #fff; padding: 8px 14px;
      border-radius: 6px; font-size: 12px; z-index: 1000; } }
  @media print { .print-hint { display: none; } }
  .cpm-blog-section-inner { max-width: 100%; padding: 10px 0; }
  .cpm-blog-section--cols2 .cpm-blog-section-inner, .cpm-blog-section--cols3 .cpm-blog-section-inner,
  .cpm-blog-section--mediaText .cpm-blog-section-inner { display: grid; gap: 18px; }
  .cpm-blog-section--cols2 .cpm-blog-section-inner, .cpm-blog-section--mediaText .cpm-blog-section-inner { grid-template-columns: 1fr 1fr; }
  .cpm-blog-section--cols3 .cpm-blog-section-inner { grid-template-columns: 1fr 1fr 1fr; }
  .cpm-blog-hero { padding: 40px 10px; text-align: center; }
  .cpm-blog-hero h1 { font-size: 26px; }
  .cpm-blog-statband { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px,1fr)); gap: 12px; }
  .cpm-blog-stat { border: 1px solid #e2e6ea; border-radius: 8px; padding: 10px; text-align: center; }
  .cpm-blog-stat-value { font-size: 20px; font-weight: 800; color: var(--accent); }
  .cpm-blog-stat-label { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #666; }
  .cpm-blog-cta { text-align: center; margin: 14px 0; }
  .cpm-blog-cta-btn { display: inline-block; padding: 8px 18px; border-radius: 6px; background: var(--accent); color: #06231f; font-weight: 700; text-decoration: none; }
  .cpm-blog-section-toolbar, .cpm-blog-add-section { display: none; }
`;

/** Build the full public/print HTML for a project's press kit, or null if none/empty. */
export async function buildPressKitHtml(projectId: string): Promise<string | null> {
  const kit = await prisma.projectPressKit.findUnique({ where: { projectId } });
  if (!kit) return null;
  const config = normalizePressKitConfig(kit.config);
  const inner = kit.status === "PUBLISHED" && kit.renderedHtml
    ? kit.renderedHtml
    : renderJsonToHtml(kit.contentJson as unknown as PMDoc | null, process.env.PUBLIC_API_BASE_URL ?? "");
  if (!inner || !inner.trim()) return null;

  const theme = (kit.theme ?? null) as { accent?: string; fontPair?: string; width?: string } | null;
  const accentFinal = theme?.accent || config.accentColor;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  const title = project?.name ?? "Press Kit";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Press Kit — ${esc(title)}</title>
<style>:root{--accent:${esc(accentFinal)};}${PRINT_STYLES}</style></head>
<body>
  <div class="print-hint">Press Ctrl/Cmd + P to save as PDF</div>
  <div class="pk-brand"><h2>Purdue SEARCH · Press Kit</h2><span class="sub">Generated ${generated}</span></div>
  ${inner}
  <div class="pk-footer">Purdue SEARCH · purduesearch.org</div>
</body></html>`;
}

/** Render the current doc to the inner HTML snapshot stored on publish. */
export function renderPressKitInnerHtml(doc: PMDoc | null | undefined): string {
  return renderJsonToHtml(doc ?? null, process.env.PUBLIC_API_BASE_URL ?? "");
}
