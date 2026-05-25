import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Ensure a project has a press kit token, generating one if missing.
 */
export async function ensurePressKitToken(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where:  { id: projectId },
    select: { pressKitToken: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.pressKitToken) return project.pressKitToken;

  const token = randomBytes(16).toString("hex");
  await prisma.project.update({
    where: { id: projectId },
    data:  { pressKitToken: token },
  });
  return token;
}

/**
 * Build the press kit HTML for a project. Returns a self-contained HTML
 * document with print-friendly CSS — the browser's print dialog renders
 * the PDF.
 */
export async function buildPressKitHtml(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      milestones: {
        where:   { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take:    6,
      },
      members: {
        include: {
          member: {
            select: {
              id: true, displayName: true, title: true, role: true,
              avatarUrl: true, email: true,
            },
          },
        },
      },
    },
  });

  if (!project) return null;

  // Top 4 assets uploaded by anyone associated with this project
  const memberIds = project.members.map(m => m.member.id);
  const assets = memberIds.length > 0
    ? await prisma.outreachAsset.findMany({
        where: { kind: "IMAGE", uploadedById: { in: memberIds } },
        orderBy: { createdAt: "desc" },
        take: 4,
      })
    : [];

  // Top contributors = members with the most submissions for this project
  const contributorRows = await prisma.outreachSubmission.groupBy({
    by: ["authorId"],
    where:  { projectId },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });
  const contributorIds = contributorRows.map(c => c.authorId);
  const contributors = contributorIds.length > 0
    ? await prisma.member.findMany({
        where:  { id: { in: contributorIds } },
        select: { id: true, displayName: true, title: true, avatarUrl: true },
      })
    : [];

  const leads = project.members
    .filter(m => m.projectRole?.toUpperCase() === "LEAD")
    .map(m => m.member);

  const milestonesHtml = project.milestones.length > 0
    ? `<ul class="milestones">${project.milestones.map(m => `
        <li>
          <span class="ms-title">${escapeHtml(m.title)}</span>
          ${m.description ? `<span class="ms-desc">${escapeHtml(m.description)}</span>` : ""}
          ${m.completedAt ? `<span class="ms-date">${fmtDate(m.completedAt)}</span>` : ""}
        </li>`).join("")}</ul>`
    : `<p class="empty">No milestones recorded.</p>`;

  const assetsHtml = assets.length > 0
    ? `<div class="assets">${assets.map(a => `
        <figure>
          <img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.altText ?? a.name)}" />
          <figcaption>${escapeHtml(a.name)}</figcaption>
        </figure>`).join("")}</div>`
    : "";

  const leadsHtml = leads.length > 0
    ? `<div class="people-grid">${leads.map(p => `
        <div class="person">
          ${p.avatarUrl ? `<img class="person-avatar" src="${escapeHtml(p.avatarUrl)}" alt="" />` : `<div class="person-avatar person-avatar--initials">${escapeHtml((p.displayName ?? "?").slice(0, 2).toUpperCase())}</div>`}
          <div class="person-info">
            <div class="person-name">${escapeHtml(p.displayName)}</div>
            ${p.title ? `<div class="person-title">${escapeHtml(p.title)}</div>` : ""}
            ${p.email ? `<div class="person-email">${escapeHtml(p.email)}</div>` : ""}
          </div>
        </div>`).join("")}</div>`
    : "";

  const contributorsHtml = contributors.length > 0
    ? `<div class="contributors">${contributors.map(c => `
        <span class="contributor">${c.avatarUrl ? `<img src="${escapeHtml(c.avatarUrl)}" alt="" />` : ""}<span>${escapeHtml(c.displayName)}</span></span>
      `).join("")}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Press Kit — ${escapeHtml(project.name)}</title>
<style>
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1a1d29;
    line-height: 1.55;
    margin: 0;
    padding: 36px 48px;
    max-width: 8.5in;
    background: #fff;
  }
  .brand {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 3px solid #0096a8;
    padding-bottom: 10px;
    margin-bottom: 28px;
  }
  .brand h2 { margin: 0; font-size: 14px; letter-spacing: 1.5px; text-transform: uppercase; color: #0096a8; }
  .brand .sub { font-size: 11px; color: #666; }
  h1 { font-size: 32px; margin: 0 0 6px; color: #0a1929; letter-spacing: -0.5px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 24px; }
  .meta span { margin-right: 16px; }
  .section { margin: 24px 0; page-break-inside: avoid; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #0096a8; font-weight: 700; margin-bottom: 8px; }
  .description { font-size: 14px; color: #333; }
  .milestones { list-style: none; padding: 0; margin: 0; }
  .milestones li {
    padding: 8px 12px;
    border-left: 3px solid #0096a8;
    margin-bottom: 8px;
    background: #f6fbfc;
    display: flex;
    flex-direction: column;
  }
  .ms-title { font-weight: 700; font-size: 13px; color: #0a1929; }
  .ms-desc { font-size: 12px; color: #555; margin-top: 2px; }
  .ms-date { font-size: 11px; color: #888; margin-top: 3px; }
  .assets { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
  .assets figure { margin: 0; }
  .assets img { width: 100%; height: 160px; object-fit: cover; border-radius: 4px; }
  .assets figcaption { font-size: 10px; color: #888; margin-top: 3px; }
  .people-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .person { display: flex; gap: 10px; align-items: center; }
  .person-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }
  .person-avatar--initials {
    background: #0096a8; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 13px;
  }
  .person-name { font-weight: 700; font-size: 13px; }
  .person-title { font-size: 11px; color: #666; }
  .person-email { font-size: 11px; color: #0096a8; }
  .contributors { display: flex; flex-wrap: wrap; gap: 8px; }
  .contributor {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px 3px 3px;
    border-radius: 16px;
    background: #f0f4f6;
    font-size: 11px;
  }
  .contributor img { width: 20px; height: 20px; border-radius: 50%; }
  .empty { color: #999; font-style: italic; font-size: 12px; }
  .footer {
    margin-top: 40px;
    padding-top: 14px;
    border-top: 1px solid #ddd;
    font-size: 10px;
    color: #888;
    text-align: center;
  }
  @media screen {
    body { box-shadow: 0 0 24px rgba(0,0,0,0.08); margin: 20px auto; border-radius: 4px; }
    .print-hint {
      position: fixed; top: 10px; right: 10px;
      background: #0096a8; color: #fff; padding: 8px 14px;
      border-radius: 6px; font-size: 12px; font-family: sans-serif;
      z-index: 1000;
    }
  }
  @media print { .print-hint { display: none; } }
</style>
</head>
<body>
  <div class="print-hint">Press Ctrl/Cmd + P to save as PDF</div>
  <div class="brand">
    <h2>Purdue SEARCH · Press Kit</h2>
    <span class="sub">Generated ${fmtDate(new Date())}</span>
  </div>

  <h1>${escapeHtml(project.name)}</h1>
  <div class="meta">
    <span><strong>Type:</strong> ${escapeHtml(project.type)}</span>
    <span><strong>Status:</strong> ${escapeHtml(project.status)}</span>
    ${project.startDate ? `<span><strong>Started:</strong> ${fmtDate(project.startDate)}</span>` : ""}
    ${project.targetDate ? `<span><strong>Target:</strong> ${fmtDate(project.targetDate)}</span>` : ""}
  </div>

  ${project.description ? `<div class="section"><div class="section-title">Overview</div><p class="description">${escapeHtml(project.description)}</p></div>` : ""}

  <div class="section">
    <div class="section-title">Recent Milestones</div>
    ${milestonesHtml}
  </div>

  ${assets.length > 0 ? `<div class="section"><div class="section-title">Imagery</div>${assetsHtml}</div>` : ""}

  ${leads.length > 0 ? `<div class="section"><div class="section-title">Project Leads</div>${leadsHtml}</div>` : ""}

  ${contributors.length > 0 ? `<div class="section"><div class="section-title">Top Contributors</div>${contributorsHtml}</div>` : ""}

  <div class="footer">
    Purdue SEARCH · purduesearch.github.io · For press inquiries, contact a project lead listed above.
  </div>
</body>
</html>`;
}
