// Turns raw records from GitHub / Vault / Tasks into compact SkillArtifacts (pure).
//
// Only a short representation leaves the source system: titles, a capped body,
// small facts. Raw diffs, file contents and CAD bytes are never read here. Every
// artifact is size-capped (SKILLS_MAX_ARTIFACT_CHARS) and carries a contentHash
// so an unchanged artifact is never analysed twice.

import { createHash } from "node:crypto";
import type { SkillArtifact } from "./skillPrompts.js";

export const DEFAULT_MAX_ARTIFACT_CHARS = 6000;

export function maxArtifactChars(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SKILLS_MAX_ARTIFACT_CHARS);
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : DEFAULT_MAX_ARTIFACT_CHARS;
}

export function capText(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 20)).trimEnd() + "\n[truncated]";
}

export function hashParts(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

const EXT_LANG: Record<string, string> = {
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", ts: "TypeScript", tsx: "TypeScript",
  py: "Python", c: "C", h: "C/C++ header", cpp: "C++", cc: "C++", hpp: "C++", ino: "Arduino", rs: "Rust", go: "Go", java: "Java",
  m: "MATLAB/Objective-C", cs: "C#", rb: "Ruby", sh: "Shell", ps1: "PowerShell", sql: "SQL", html: "HTML", css: "CSS", scss: "SCSS",
  v: "Verilog", sv: "SystemVerilog", vhd: "VHDL", ipynb: "Jupyter", md: "Markdown", yml: "YAML", yaml: "YAML", json: "JSON",
  kicad_pcb: "KiCad PCB", kicad_sch: "KiCad schematic", sldprt: "SolidWorks part", sldasm: "SolidWorks assembly", slddrw: "SolidWorks drawing",
  step: "STEP", stp: "STEP", stl: "STL", dxf: "DXF", gcode: "G-code", scad: "OpenSCAD", urdf: "URDF", launch: "ROS launch",
};

export function extOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Languages / file kinds by changed-line weight, strongest first. */
export function languagesFromFiles(files: { filename: string; additions: number; deletions: number }[], limit = 5): string[] {
  const weight = new Map<string, number>();
  for (const f of files) {
    const lang = EXT_LANG[extOf(f.filename)];
    if (lang) weight.set(lang, (weight.get(lang) ?? 0) + f.additions + f.deletions + 1);
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([l]) => l);
}

/** Top-level folders touched, so the model sees the shape of a change without reading it. */
export function topFolders(files: { filename: string }[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const parts = f.filename.split("/");
    const key = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : "(root)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([k]) => k);
}

export const isBotLogin = (login: string | null | undefined) => !login || /\[bot\]$|^dependabot|^github-actions|^renovate/i.test(login);

// ── GitHub ───────────────────────────────────────────────────

export interface PullInput {
  repo: string; // owner/repo
  number: number;
  title: string;
  body: string | null;
  url: string;
  merged: boolean;
  mergedAt: Date | null;
  closedAt: Date | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits?: number;
  files: { filename: string; additions: number; deletions: number }[];
  reviews: { login: string; state: string }[];
  authorLogin: string;
}

function pullBody(p: PullInput, max: number): string {
  const fileLines = [...p.files]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, 25)
    .map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`)
    .join("\n");
  const desc = capText(p.body, Math.min(1500, Math.floor(max / 3)));
  return capText(`${desc ? `Description:\n${desc}\n\n` : ""}Largest changed files:\n${fileLines || "none listed"}`, max);
}

function pullFacts(p: PullInput, extra: Record<string, string | number> = {}): Record<string, string | number> {
  const facts: Record<string, string | number> = {
    repo: p.repo,
    languages: languagesFromFiles(p.files).join(", ") || "unknown",
    folders: topFolders(p.files).join(", ") || "n/a",
    files_changed: p.changedFiles,
    lines_added: p.additions,
    lines_removed: p.deletions,
    review_count: p.reviews.length,
    changes_requested: p.reviews.filter((r) => r.state === "CHANGES_REQUESTED").length,
    result: p.merged ? "merged" : "closed without merging",
    ...extra,
  };
  if (p.commits !== undefined) facts.commits = p.commits;
  return facts;
}

export function pullAuthorArtifact(p: PullInput, ctx: { memberId: string; projectId?: string | null; projectName?: string | null }, max = DEFAULT_MAX_ARTIFACT_CHARS): SkillArtifact {
  const body = pullBody(p, max);
  const facts = pullFacts(p);
  const occurredAt = (p.merged ? p.mergedAt : p.closedAt) ?? new Date(0);
  return {
    memberId: ctx.memberId, source: "GITHUB", sourceRef: `${p.repo}#${p.number}`, sourceUrl: p.url,
    projectId: ctx.projectId ?? null, projectName: ctx.projectName ?? null, occurredAt,
    title: capText(p.title, 200),
    memberRole: p.merged ? "opened this pull request and it was merged" : "opened this pull request, which was closed without merging",
    body, facts,
    contentHash: hashParts(["pr-author", p.repo, p.number, p.title, p.mergedAt, p.closedAt, p.additions, p.deletions, p.changedFiles, p.reviews.length]),
  };
}

export function pullReviewArtifact(p: PullInput, reviewer: { memberId: string; login: string; states: string[] }, ctx: { projectId?: string | null; projectName?: string | null }, max = DEFAULT_MAX_ARTIFACT_CHARS): SkillArtifact {
  const verdicts = [...new Set(reviewer.states)].join(", ").toLowerCase().replace(/_/g, " ");
  return {
    memberId: reviewer.memberId, source: "REVIEW", sourceRef: `${p.repo}#${p.number}:review:${reviewer.login.toLowerCase()}`, sourceUrl: p.url,
    projectId: ctx.projectId ?? null, projectName: ctx.projectName ?? null,
    occurredAt: (p.merged ? p.mergedAt : p.closedAt) ?? new Date(0),
    title: capText(p.title, 200),
    memberRole: `reviewed someone else's pull request (${verdicts || "commented"}, ${reviewer.states.length} review event${reviewer.states.length === 1 ? "" : "s"})`,
    body: pullBody(p, max),
    facts: pullFacts(p),
    contentHash: hashParts(["pr-review", p.repo, p.number, reviewer.login, reviewer.states, p.mergedAt, p.closedAt]),
  };
}

// ── Tasks ────────────────────────────────────────────────────

export interface TaskInput {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  priority: string;
  milestoneTitle: string | null;
  projectName: string | null;
  projectId: string;
  completedAt: Date;
  estimatedHours: number | null;
  storyPoints: number | null;
  subtaskTotal: number;
  subtaskDone: number;
  assigneeCount: number;
  /** minutes logged by each member on this task */
  loggedMinutes: Record<string, number>;
  createdById: string | null;
  assigneeIds: string[];
  url?: string | null;
}

/** Titles like "fix" with no description say nothing about skill. */
export function isTooThin(t: Pick<TaskInput, "title" | "description" | "tags">): boolean {
  return t.title.trim().length < 8 && (t.description ?? "").trim().length < 20 && t.tags.length === 0;
}

function taskFacts(t: TaskInput, memberId: string): Record<string, string | number> {
  const facts: Record<string, string | number> = { priority: t.priority.toLowerCase() };
  if (t.tags.length) facts.tags = t.tags.slice(0, 10).join(", ");
  if (t.milestoneTitle) facts.milestone = t.milestoneTitle;
  if (t.storyPoints) facts.story_points = t.storyPoints;
  if (t.estimatedHours) facts.estimated_hours = t.estimatedHours;
  const mine = t.loggedMinutes[memberId];
  if (mine) facts.hours_logged_by_this_person = Math.round((mine / 60) * 10) / 10;
  if (t.subtaskTotal) facts.subtasks_done = `${t.subtaskDone}/${t.subtaskTotal}`;
  if (t.assigneeCount > 1) facts.assignees = t.assigneeCount;
  return facts;
}

/** One artifact per assignee; the creator also gets one when they split work for others. */
export function taskArtifacts(t: TaskInput, max = DEFAULT_MAX_ARTIFACT_CHARS): SkillArtifact[] {
  if (isTooThin(t)) return [];
  const out: SkillArtifact[] = [];
  const body = capText(t.description, max);
  const base = { source: "TASK" as const, sourceRef: t.id, sourceUrl: t.url ?? null, projectId: t.projectId, projectName: t.projectName, occurredAt: t.completedAt, title: capText(t.title, 200), body };
  for (const memberId of t.assigneeIds) {
    out.push({
      ...base, memberId,
      memberRole: t.assigneeCount > 1 ? "one of several assignees who completed this task" : "assignee who completed this task",
      facts: taskFacts(t, memberId),
      contentHash: hashParts(["task", t.id, memberId, t.title, t.description, t.tags, t.completedAt, t.subtaskDone]),
    });
  }
  const creator = t.createdById;
  if (creator && !t.assigneeIds.includes(creator) && t.subtaskTotal >= 2) {
    out.push({
      ...base, memberId: creator, sourceRef: `${t.id}:created`,
      memberRole: `created this task and broke it into ${t.subtaskTotal} subtasks that others carried out`,
      facts: taskFacts(t, creator),
      contentHash: hashParts(["task-creator", t.id, creator, t.title, t.description, t.completedAt, t.subtaskTotal]),
    });
  }
  return out;
}

// ── CAD / Vault ──────────────────────────────────────────────

export interface VaultVersionInput {
  versionId: string;
  itemId: string;
  itemName: string;
  partNumber: string | null;
  itemDescription: string | null;
  fileName: string;
  sizeBytes: number | null;
  versionNumber: number;
  versionCount: number;
  revision: string | null;
  released: boolean;
  note: string | null;
  uploadedAt: Date;
  uploadedById: string;
  projectId: string;
  projectName: string | null;
  parentNames: string[];
  childNames: string[];
  crTitles: string[];
  url?: string | null;
}

export function vaultVersionArtifact(v: VaultVersionInput, max = DEFAULT_MAX_ARTIFACT_CHARS): SkillArtifact {
  const ext = extOf(v.fileName);
  const facts: Record<string, string | number> = {
    file_name: v.fileName,
    file_kind: EXT_LANG[ext] ?? (ext || "unknown"),
    version: `${v.versionNumber} of ${v.versionCount}`,
    released: v.released ? "yes" : "no",
  };
  if (v.partNumber) facts.part_number = v.partNumber;
  if (v.revision) facts.revision = v.revision;
  if (v.sizeBytes) facts.size_kb = Math.round(v.sizeBytes / 1024);
  if (v.parentNames.length) facts.used_in_assemblies = v.parentNames.slice(0, 6).join(", ");
  if (v.childNames.length) facts.contains_parts = `${v.childNames.length}: ${v.childNames.slice(0, 10).join(", ")}`;
  if (v.crTitles.length) facts.change_requests = v.crTitles.slice(0, 4).join("; ");
  const lines = [
    v.itemDescription ? `Item description: ${v.itemDescription}` : "",
    v.note ? `Check-in note: ${v.note}` : "No check-in note.",
  ].filter(Boolean);
  return {
    memberId: v.uploadedById, source: "CAD", sourceRef: v.versionId, sourceUrl: v.url ?? null,
    projectId: v.projectId, projectName: v.projectName, occurredAt: v.uploadedAt,
    title: capText(v.itemName, 200),
    memberRole: v.versionNumber === 1 ? "created this CAD item and checked in its first version" : `checked in version ${v.versionNumber} of this CAD item`,
    body: capText(lines.join("\n"), max),
    facts,
    contentHash: hashParts(["cad", v.versionId, v.itemName, v.note, v.fileName, v.revision, v.released, v.parentNames.length, v.childNames.length, v.crTitles]),
  };
}

export interface CrReviewInput {
  crId: string;
  number: number;
  title: string;
  description: string | null;
  status: "APPROVED" | "REJECTED";
  decidedAt: Date;
  reviewNote: string | null;
  itemNames: string[];
  projectId: string;
  projectName: string | null;
  url?: string | null;
}

/** A reviewer or signer of a change request: reviewing is evidence even though they uploaded nothing. */
export function crReviewArtifact(c: CrReviewInput, memberId: string, how: "reviewer" | "signoff", max = DEFAULT_MAX_ARTIFACT_CHARS): SkillArtifact {
  return {
    memberId, source: "REVIEW", sourceRef: `cr:${c.crId}:${how}`, sourceUrl: c.url ?? null,
    projectId: c.projectId, projectName: c.projectName, occurredAt: c.decidedAt,
    title: capText(`CR-${c.number}: ${c.title}`, 200),
    memberRole: how === "reviewer" ? `reviewed and ${c.status === "APPROVED" ? "approved" : "rejected"} this engineering change request` : "signed off on this engineering change request",
    body: capText([c.description, c.reviewNote ? `Review note: ${c.reviewNote}` : ""].filter(Boolean).join("\n\n"), max),
    facts: { result: c.status.toLowerCase(), items_changed: c.itemNames.length, items: c.itemNames.slice(0, 12).join(", ") || "none" },
    contentHash: hashParts(["cr", c.crId, memberId, how, c.status, c.decidedAt, c.reviewNote]),
  };
}

// ── Manual ───────────────────────────────────────────────────

export interface ManualInput {
  id: string;
  memberId: string;
  title: string;
  description: string;
  link?: string | null;
  occurredAt: Date;
  projectId?: string | null;
  projectName?: string | null;
  enteredByOther: boolean;
}

/** Work with few digital traces (mentoring, testing, coordination). Same pipeline, flagged as self-reported unless an admin entered it. */
export function manualArtifact(m: ManualInput, max = DEFAULT_MAX_ARTIFACT_CHARS): SkillArtifact {
  return {
    memberId: m.memberId, source: "MANUAL", sourceRef: m.id, sourceUrl: m.link ?? null,
    projectId: m.projectId ?? null, projectName: m.projectName ?? null, occurredAt: m.occurredAt,
    title: capText(m.title, 200),
    memberRole: m.enteredByOther ? "did this work (entered by a team lead)" : "did this work (described by the person themselves)",
    body: capText(m.description, max),
    facts: {},
    contentHash: hashParts(["manual", m.id, m.title, m.description, m.link ?? null, m.enteredByOther]),
  };
}

/** Defensive final size check: collectors build within the cap, but a surprise field must not blow the prompt. */
export function enforceCap(a: SkillArtifact, max = DEFAULT_MAX_ARTIFACT_CHARS): SkillArtifact {
  const factsLen = Object.entries(a.facts).reduce((n, [k, v]) => n + k.length + String(v).length + 4, 0);
  const room = Math.max(500, max - factsLen - a.title.length - a.memberRole.length);
  return a.body.length <= room ? a : { ...a, body: capText(a.body, room) };
}
