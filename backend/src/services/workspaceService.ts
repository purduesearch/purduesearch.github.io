/**
 * Lab spaces: CRUD, project assignment, requirements, and who may schedule.
 * Everything above the `── Persistence ──` divider is pure and unit-tested in
 * workspaceService.test.ts.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { deriveStatus, type CertLike } from "./trainingService.js";
import { isYmd, toDbDate, fromDbDate, SLOT_MINUTES, DAY_MINUTES, type Ymd } from "./labScheduleCore.js";

export type RequirementState = "ok" | "missing" | "expired" | "pending";

export function trainingState(certs: CertLike[], now: Date): RequirementState {
  const s = deriveStatus(certs, now);
  if (s === "UP_TO_DATE") return "ok";
  if (s === "PENDING_REVIEW") return "pending";
  if (s === "EXPIRED") return "expired";
  return "missing";
}
export function courseState(completedAt: Date | null | undefined): RequirementState {
  return completedAt ? "ok" : "missing";
}

export interface WorkspaceInput {
  name?: string;
  description?: string | null;
  location?: string | null;
  color?: string;
  capacity?: number | null;
  timezone?: string;
  openStartMin?: number;
  openEndMin?: number;
  defaultEndsOn?: Ymd | null;
}

function validTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s || "space";
}

export function sanitizeWorkspaceInput(body: unknown, partial: boolean):
  { ok: true; value: WorkspaceInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const has = (k: string) => b[k] !== undefined;
  const fail = (error: string) => ({ ok: false as const, error });
  const out: WorkspaceInput = {};

  if (!partial || has("name")) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name || name.length > 80) return fail("Name is required (up to 80 characters).");
    out.name = name;
  }
  for (const [k, max] of [["description", 2000], ["location", 200]] as const) {
    if (!has(k)) continue;
    const v = b[k];
    if (v === null || v === "") { out[k] = null; continue; }
    if (typeof v !== "string" || v.trim().length > max) return fail(`${k} must be text up to ${max} characters.`);
    out[k] = v.trim();
  }
  if (has("color")) {
    if (typeof b.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(b.color)) return fail("Colour must be a hex value like #00e5cc.");
    out.color = b.color.toLowerCase();
  }
  if (has("capacity")) {
    const c = b.capacity;
    if (c === null || c === "") out.capacity = null;
    else if (!Number.isInteger(c) || (c as number) < 1 || (c as number) > 500) return fail("Capacity must be a whole number from 1 to 500.");
    else out.capacity = c as number;
  }
  if (has("timezone")) {
    if (typeof b.timezone !== "string" || !validTimeZone(b.timezone)) return fail("Unknown time zone.");
    out.timezone = b.timezone;
  }
  for (const k of ["openStartMin", "openEndMin"] as const) {
    if (!has(k)) continue;
    const v = b[k];
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > DAY_MINUTES || (v as number) % SLOT_MINUTES !== 0) {
      return fail("Open hours must be on the half hour.");
    }
    out[k] = v as number;
  }
  if (out.openStartMin !== undefined && out.openEndMin !== undefined && out.openStartMin >= out.openEndMin) {
    return fail("Opening time must be before closing time.");
  }
  if (has("defaultEndsOn")) {
    const v = b.defaultEndsOn;
    if (v === null || v === "") out.defaultEndsOn = null;
    else if (!isYmd(v)) return fail("Term end must be YYYY-MM-DD.");
    else out.defaultEndsOn = v;
  }
  return { ok: true, value: out };
}

// ── Persistence ──────────────────────────────────────────────

const workspaceInclude = {
  projects: { include: { project: { select: { id: true, name: true } } } },
  requirements: {
    include: {
      training: { select: { id: true, name: true, courseUrl: true, registrationUrl: true } },
      course: { select: { id: true, title: true, slug: true } },
    },
  },
} satisfies Prisma.WorkspaceInclude;
type WorkspaceRow = Prisma.WorkspaceGetPayload<{ include: typeof workspaceInclude }>;

export interface RequirementRef { id: string; kind: "training" | "course"; refId: string; name: string; url: string | null; }
export interface WorkspaceDto {
  id: string; name: string; slug: string; description: string | null; location: string | null;
  color: string; capacity: number | null; timezone: string;
  openStartMin: number; openEndMin: number; defaultEndsOn: Ymd | null; archived: boolean;
  projects: { id: string; name: string }[];
  requirements: RequirementRef[];
}

function toDto(w: WorkspaceRow): WorkspaceDto {
  return {
    id: w.id, name: w.name, slug: w.slug, description: w.description, location: w.location,
    color: w.color, capacity: w.capacity, timezone: w.timezone,
    openStartMin: w.openStartMin, openEndMin: w.openEndMin,
    defaultEndsOn: w.defaultEndsOn ? fromDbDate(w.defaultEndsOn) : null,
    archived: !!w.archivedAt,
    projects: w.projects.map(p => p.project).sort((a, b) => a.name.localeCompare(b.name)),
    requirements: w.requirements.flatMap((r): RequirementRef[] => {
      if (r.training) return [{ id: r.id, kind: "training", refId: r.training.id, name: r.training.name, url: r.training.courseUrl ?? r.training.registrationUrl ?? null }];
      if (r.course) return [{ id: r.id, kind: "course", refId: r.course.id, name: r.course.title, url: `/clubpm/courses/${r.course.slug}/learn` }];
      return [];
    }),
  };
}

export async function listWorkspaces(opts: { projectId?: string; includeArchived?: boolean } = {}): Promise<WorkspaceDto[]> {
  const rows = await prisma.workspace.findMany({
    where: {
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(opts.projectId ? { projects: { some: { projectId: opts.projectId } } } : {}),
    },
    include: workspaceInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(toDto);
}

export async function getWorkspace(id: string): Promise<WorkspaceDto | null> {
  const w = await prisma.workspace.findUnique({ where: { id }, include: workspaceInclude });
  return w ? toDto(w) : null;
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await prisma.workspace.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  return slug;
}

export async function createWorkspace(input: WorkspaceInput, createdById: string): Promise<WorkspaceDto> {
  const w = await prisma.workspace.create({
    data: {
      name: input.name!,
      slug: await uniqueSlug(input.name!),
      description: input.description ?? null,
      location: input.location ?? null,
      ...(input.color ? { color: input.color } : {}),
      capacity: input.capacity ?? null,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.openStartMin !== undefined ? { openStartMin: input.openStartMin } : {}),
      ...(input.openEndMin !== undefined ? { openEndMin: input.openEndMin } : {}),
      defaultEndsOn: input.defaultEndsOn ? toDbDate(input.defaultEndsOn) : null,
      createdById,
    },
    include: workspaceInclude,
  });
  return toDto(w);
}

/** Returns null when not found; throws Error with a user message on invalid hours. */
export async function updateWorkspace(id: string, input: WorkspaceInput): Promise<WorkspaceDto | null> {
  const existing = await prisma.workspace.findUnique({ where: { id }, select: { openStartMin: true, openEndMin: true } });
  if (!existing) return null;
  const start = input.openStartMin ?? existing.openStartMin;
  const end = input.openEndMin ?? existing.openEndMin;
  if (start >= end) throw new Error("Opening time must be before closing time.");
  const { defaultEndsOn, ...rest } = input;
  const w = await prisma.workspace.update({
    where: { id },
    data: {
      ...rest,
      ...(defaultEndsOn !== undefined ? { defaultEndsOn: defaultEndsOn ? toDbDate(defaultEndsOn) : null } : {}),
    },
    include: workspaceInclude,
  });
  return toDto(w);
}

export async function archiveWorkspace(id: string): Promise<boolean> {
  const r = await prisma.workspace.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
  return r.count > 0;
}

export async function setWorkspaceProjects(id: string, projectIds: string[]): Promise<void> {
  const ids = [...new Set(projectIds)];
  await prisma.$transaction([
    prisma.workspaceProject.deleteMany({ where: { workspaceId: id } }),
    prisma.workspaceProject.createMany({ data: ids.map(projectId => ({ workspaceId: id, projectId })), skipDuplicates: true }),
  ]);
}

export async function setWorkspaceRequirements(id: string, trainingIds: string[], courseIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.workspaceRequirement.deleteMany({ where: { workspaceId: id } }),
    prisma.workspaceRequirement.createMany({
      data: [
        ...[...new Set(trainingIds)].map(trainingId => ({ workspaceId: id, trainingId })),
        ...[...new Set(courseIds)].map(courseId => ({ workspaceId: id, courseId })),
      ],
      skipDuplicates: true,
    }),
  ]);
}

export async function isAdminMember(memberId: string): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true, role: true } });
  return !!m && (m.isAdmin || m.role === "ADMIN");
}

export async function canSchedule(memberId: string, workspaceId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const n = await prisma.projectMember.count({
    where: { memberId, project: { workspaces: { some: { workspaceId } } } },
  });
  return n > 0;
}

/** memberId → requirementId → state. */
export async function requirementStatus(
  ws: WorkspaceDto, memberIds: string[], now: Date = new Date(),
): Promise<Record<string, Record<string, RequirementState>>> {
  const ids = [...new Set(memberIds)];
  const out: Record<string, Record<string, RequirementState>> = Object.fromEntries(ids.map(id => [id, {}]));
  if (ids.length === 0 || ws.requirements.length === 0) return out;

  const trainingReqs = ws.requirements.filter(r => r.kind === "training");
  const courseReqs = ws.requirements.filter(r => r.kind === "course");
  const [certs, enrollments] = await Promise.all([
    trainingReqs.length
      ? prisma.trainingCertificate.findMany({
          where: { memberId: { in: ids }, trainingId: { in: trainingReqs.map(r => r.refId) } },
          select: { memberId: true, trainingId: true, status: true, expiresOn: true, createdAt: true },
        })
      : Promise.resolve([]),
    courseReqs.length
      ? prisma.courseEnrollment.findMany({
          where: { memberId: { in: ids }, courseId: { in: courseReqs.map(r => r.refId) } },
          select: { memberId: true, courseId: true, completedAt: true },
        })
      : Promise.resolve([]),
  ]);

  for (const id of ids) {
    for (const r of trainingReqs) {
      out[id][r.id] = trainingState(certs.filter(c => c.memberId === id && c.trainingId === r.refId), now);
    }
    for (const r of courseReqs) {
      out[id][r.id] = courseState(enrollments.find(e => e.memberId === id && e.courseId === r.refId)?.completedAt);
    }
  }
  return out;
}
