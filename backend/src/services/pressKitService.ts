import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { generatePressKitSections } from "./aiService.js";
import { renderJsonToHtml, markdownToTiptapJson, type PMDoc } from "./blogRender.js";

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
           milestonesHit: number; hoursLogged: number; durationDays: number | null };
  milestones: { title: string; description: string | null; completedAt: Date | null }[];
  team: { displayName: string; title: string | null; role: string | null;
          avatarUrl: string | null; isLead: boolean }[];
  tags: string[];
  links: { label: string; url: string }[];
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
    out.push("");
  }
  if (has("building") && prose.building) { out.push("## What We're Building", prose.building, ""); }

  if (has("timeline") && (ctx.milestones.length || p.targetDate)) {
    out.push("## Timeline & Milestones", "");
    for (const m of ctx.milestones) {
      const when = m.completedAt ? ` — ${fmtDate(m.completedAt)}` : "";
      out.push(`- **${m.title}**${when}${m.description ? `: ${m.description}` : ""}`);
    }
    if (p.targetDate) out.push(`- **Target completion** — ${fmtDate(p.targetDate)}`);
    out.push("");
  }
  if (has("tech") && ctx.tags.length) {
    out.push("## Tech & Tools", ctx.tags.join(" · "), "");
  }
  if (has("team") && ctx.team.length) {
    out.push("## Team & Leadership", "");
    for (const t of ctx.team) {
      const lead = t.isLead ? " *(Lead)*" : "";
      const title = t.title ? ` — ${t.title}` : "";
      out.push(`- **${t.displayName}**${title}${lead}`);
    }
    out.push("");
  }
  if (has("highlights") && ctx.milestones.length) {
    out.push("## Highlights", "");
    for (const m of ctx.milestones.slice(0, 5)) out.push(`- ${m.title}`);
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

export async function gatherPressKitData(projectId: string): Promise<PressKitContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tags: true,
      members: { include: { member: { select: {
        id: true, displayName: true, title: true, role: true, avatarUrl: true,
      } } } },
      milestones: { where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 8 },
    },
  });
  if (!project) return null;

  const [tasksTotal, tasksDone, hoursAgg] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.task.count({ where: { projectId, status: "DONE" } }),
    prisma.timeLog.aggregate({ where: { task: { projectId } }, _sum: { minutes: true } }),
  ]);

  const durationDays = project.startDate
    ? Math.max(0, Math.round((Date.now() - new Date(project.startDate).getTime()) / 86_400_000))
    : null;

  const team = project.members.map((pm) => ({
    displayName: pm.member.displayName,
    title: pm.member.title,
    role: pm.member.role,
    avatarUrl: pm.member.avatarUrl,
    isLead: (pm.projectRole ?? "").toUpperCase() === "LEAD",
  }));

  const links: { label: string; url: string }[] = [];
  if (project.githubRepo) links.push({ label: "GitHub", url: `https://github.com/${project.githubRepo}` });
  if (project.driveLink) links.push({ label: "Drive", url: project.driveLink });
  if (project.programTag) links.push({ label: "Program page", url: `https://purduesearch.github.io/${project.programTag}` });
  links.push({ label: "Purdue SEARCH", url: "https://purduesearch.github.io" });

  return {
    project: {
      name: project.name, type: project.type, status: project.status,
      description: project.description, startDate: project.startDate, targetDate: project.targetDate,
      programTag: project.programTag, githubRepo: project.githubRepo, driveLink: project.driveLink,
    },
    stats: {
      teamSize: project.members.length,
      tasksDone, tasksTotal,
      milestonesHit: project.milestones.length,
      hoursLogged: Math.round((hoursAgg._sum.minutes ?? 0) / 60),
      durationDays,
    },
    milestones: project.milestones.map((m) => ({
      title: m.title, description: m.description, completedAt: m.completedAt,
    })),
    team,
    tags: project.tags.map((t) => t.name),
    links,
  };
}

// ── Full generation: data + AI + markdown -> TipTap JSON ─────

export async function generatePressKitContent(
  projectId: string, config: PressKitConfig,
): Promise<PMDoc | null> {
  const ctx = await gatherPressKitData(projectId);
  if (!ctx) return null;

  const taskRows = await prisma.task.findMany({
    where: { projectId, parentTaskId: null },
    select: { title: true }, take: 40,
  });

  const prose = await generatePressKitSections(
    {
      name: ctx.project.name, type: ctx.project.type, status: ctx.project.status,
      description: ctx.project.description,
      milestones: ctx.milestones.map((m) => m.title),
      taskTitles: taskRows.map((t) => t.title),
      tags: ctx.tags,
    },
    config.audience,
  );

  const md = buildPressKitMarkdown(ctx, config, prose);
  return markdownToTiptapJson(md);
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

  const accent = config.accentColor;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  const title = project?.name ?? "Press Kit";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Press Kit — ${esc(title)}</title>
<style>:root{--accent:${esc(accent)};}${PRINT_STYLES}</style></head>
<body>
  <div class="print-hint">Press Ctrl/Cmd + P to save as PDF</div>
  <div class="pk-brand"><h2>Purdue SEARCH · Press Kit</h2><span class="sub">Generated ${generated}</span></div>
  ${inner}
  <div class="pk-footer">Purdue SEARCH · purduesearch.github.io</div>
</body></html>`;
}

/** Render the current doc to the inner HTML snapshot stored on publish. */
export function renderPressKitInnerHtml(doc: PMDoc | null | undefined): string {
  return renderJsonToHtml(doc ?? null, process.env.PUBLIC_API_BASE_URL ?? "");
}
