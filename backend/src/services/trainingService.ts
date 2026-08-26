/**
 * Safety-training catalog logic.
 *
 * NOT the walkthrough "training project" (POST /api/training-project,
 * tourConfig.requiresTrainingProject). Unrelated concepts that share a word.
 *
 * Everything above the `── Persistence ──` divider is pure and unit-tested in
 * trainingService.test.ts. Keep it that way: the expiry arithmetic and the
 * status cascade are the two things worth testing, and neither needs a database.
 */

export type TrainingStatus =
  | "UP_TO_DATE"
  | "PENDING_REVIEW"
  | "EXPIRED"
  | "NOT_COMPLETED";

export interface CertLike {
  status: "PENDING" | "APPROVED" | "REJECTED";
  expiresOn: Date | null;
  createdAt: Date;
}

/** Longest renewal period an author may set, in months. */
const MAX_RENEWAL_MONTHS = 120;

/**
 * completedOn + renewalMonths, clamped to the last day of the target month and
 * pinned to end-of-day UTC.
 *
 * Clamping matters: naive month arithmetic turns 31 January + 1 month into
 * 3 March, which would hand someone two extra days of validity and produce a
 * date that does not exist on their certificate's renewal schedule.
 *
 * End-of-day matters: a certificate should be valid through the whole of its
 * expiry date, not expire at midnight as that day begins.
 */
export function computeExpiry(completedOn: Date, renewalMonths: number | null): Date | null {
  if (renewalMonths == null || renewalMonths <= 0) return null;

  const day = completedOn.getUTCDate();
  const target = new Date(Date.UTC(
    completedOn.getUTCFullYear(),
    completedOn.getUTCMonth() + renewalMonths,
    1
  ));
  // Day 0 of the following month is the last day of the target month.
  const lastDayOfTarget = new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    0
  )).getUTCDate();

  return new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    Math.min(day, lastDayOfTarget),
    23, 59, 59, 999
  ));
}

/**
 * A member's standing for one training, derived from their certificate rows.
 *
 * THE ORDER OF THESE FOUR TESTS IS THE SPECIFICATION, not an implementation
 * detail. It is what makes the two interesting cases come out right:
 *
 *   - Early renewal. An unexpired approval plus a newer pending resubmission is
 *     UP_TO_DATE, not PENDING_REVIEW — someone who renews a month early is
 *     still compliant today.
 *   - Lapsed and resubmitted. An expired approval plus a newer pending is
 *     PENDING_REVIEW, not EXPIRED — they have done their part, so the yellow
 *     warning should stop nagging them and the queue should show it is the
 *     admin's turn.
 */
export function deriveStatus(certs: CertLike[], now: Date): TrainingStatus {
  const approved = certs.filter((c) => c.status === "APPROVED");
  if (approved.some((c) => c.expiresOn == null || c.expiresOn.getTime() > now.getTime())) {
    return "UP_TO_DATE";
  }
  if (certs.some((c) => c.status === "PENDING")) return "PENDING_REVIEW";
  if (approved.length > 0) return "EXPIRED";
  return "NOT_COMPLETED";
}

export interface TrainingInput {
  slug: string;
  name: string;
  providerName: string;
  providerUrl: string | null;
  courseUrl: string | null;
  registrationUrl: string | null;
  description: string | null;
  renewalMonths: number | null;
}

export type SanitizeResult =
  | { ok: true; value: TrainingInput }
  | { ok: false; error: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Only http(s). A `javascript:` URL here would render as a link the learner is
 * told to click, which is the whole reason the scheme is checked rather than
 * the string merely being non-empty.
 */
function cleanUrl(v: unknown): string | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  return parsed.toString();
}

export function sanitizeTrainingInput(body: unknown): SanitizeResult {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "A training needs a name" };

  const providerName = typeof b.providerName === "string" ? b.providerName.trim() : "";
  if (!providerName) return { ok: false, error: "A training needs a provider" };

  const urls: Record<string, string | null> = {};
  for (const key of ["providerUrl", "courseUrl", "registrationUrl"] as const) {
    const cleaned = cleanUrl(b[key]);
    if (cleaned === undefined) {
      return { ok: false, error: `${key} must be an http(s) URL` };
    }
    urls[key] = cleaned;
  }

  let renewalMonths: number | null = null;
  if (b.renewalMonths != null && b.renewalMonths !== "") {
    const n = Number(b.renewalMonths);
    if (!Number.isInteger(n) || n < 0 || n > MAX_RENEWAL_MONTHS) {
      return { ok: false, error: `renewalMonths must be a whole number of months, 0–${MAX_RENEWAL_MONTHS}` };
    }
    // 0 and null both mean "never expires"; normalize to null so the rest of the
    // code has one representation to reason about.
    renewalMonths = n === 0 ? null : n;
  }

  const slugSource = typeof b.slug === "string" && b.slug.trim() ? b.slug : name;

  return {
    ok: true,
    value: {
      slug: slugify(slugSource),
      name,
      providerName,
      providerUrl: urls.providerUrl,
      courseUrl: urls.courseUrl,
      registrationUrl: urls.registrationUrl,
      description: typeof b.description === "string" ? b.description.trim() || null : null,
      renewalMonths,
    },
  };
}

export type ExpiryThreshold = "T30" | "T7" | "LAPSED";

/**
 * Which reminder, if any, this certificate is due for.
 *
 * Pure so the threshold arithmetic can be reasoned about without a database.
 * `lastRemindedAt` is compared against the moment the threshold was CROSSED, not
 * against "now": that is what makes each threshold fire exactly once, rather
 * than every morning for thirty days running.
 */
export function dueReminder(
  expiresOn: Date,
  lastRemindedAt: Date | null,
  now: Date
): ExpiryThreshold | null {
  const DAY = 86_400_000;
  const msLeft = expiresOn.getTime() - now.getTime();

  let threshold: ExpiryThreshold;
  let crossedAt: number;
  if (msLeft <= 0) {
    threshold = "LAPSED";
    crossedAt = expiresOn.getTime();
  } else if (msLeft <= 7 * DAY) {
    threshold = "T7";
    crossedAt = expiresOn.getTime() - 7 * DAY;
  } else if (msLeft <= 30 * DAY) {
    threshold = "T30";
    crossedAt = expiresOn.getTime() - 30 * DAY;
  } else {
    return null;
  }

  if (lastRemindedAt && lastRemindedAt.getTime() >= crossedAt) return null;
  return threshold;
}

// ── Persistence ──────────────────────────────────────────────
//
// Everything below touches Prisma and is therefore not unit-tested. Keep the
// logic here thin — anything worth testing belongs above the divider.

import { prisma } from "../db/prisma.js";

/** Live registry entries, alphabetical. Archived entries are excluded. */
export async function listTrainings() {
  return prisma.training.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function createTraining(input: TrainingInput, createdById: string) {
  // Slug collisions are real: "Laser Safety Training" and "Laser Safety
  // Training " slugify identically. Suffix rather than fail, so an author is
  // never blocked by an invisible duplicate.
  let slug = input.slug || "training";
  const existing = await prisma.training.findMany({
    where: { slug: { startsWith: slug } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((t) => t.slug));
  if (taken.has(slug)) {
    let n = 2;
    while (taken.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  return prisma.training.create({ data: { ...input, slug, createdById } });
}

export async function updateTraining(id: string, input: TrainingInput) {
  // The slug is identity once created — a course section points at the row by
  // id, but the seed script matches on slug, so churning it would make reseeding
  // create duplicates.
  const { slug: _ignored, ...rest } = input;
  return prisma.training.update({ where: { id }, data: rest });
}

export interface CertificateInput {
  driveFileId: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number;
  completedOn: Date;
}

/**
 * Write one certificate row.
 *
 * `expiresOn` is SNAPSHOTTED from the registry's renewalMonths at submission
 * time. Deriving it on read instead would mean an author editing renewalMonths
 * silently re-dates every certificate ever issued under the old period.
 */
export async function recordCertificate(
  trainingId: string,
  memberId: string,
  sectionId: string | null,
  input: CertificateInput
) {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { renewalMonths: true },
  });
  return prisma.trainingCertificate.create({
    data: {
      trainingId,
      memberId,
      sectionId,
      driveFileId: input.driveFileId,
      fileName: input.fileName,
      fileMimeType: input.fileMimeType,
      fileSize: input.fileSize,
      completedOn: input.completedOn,
      expiresOn: computeExpiry(input.completedOn, training?.renewalMonths ?? null),
    },
  });
}

/** This member's attempts for one training, newest first. */
export async function listCertificates(trainingId: string, memberId: string) {
  return prisma.trainingCertificate.findMany({
    where: { trainingId, memberId },
    orderBy: { createdAt: "desc" },
    include: { reviewedBy: { select: { id: true, displayName: true } } },
  });
}

/** Everything awaiting review, oldest first — a queue, not a feed. */
export async function listPendingCertificates() {
  return prisma.trainingCertificate.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      training: { select: { id: true, name: true, providerName: true, renewalMonths: true } },
      member: { select: { id: true, displayName: true, avatarUrl: true } },
      section: { select: { id: true, title: true, courseId: true } },
    },
  });
}

export async function countPendingCertificates() {
  return prisma.trainingCertificate.count({ where: { status: "PENDING" } });
}

/**
 * Approve or reject one certificate.
 *
 * On APPROVE the admin may correct `completedOn` — the member typed it off a
 * scan and the admin is looking at the same scan. Correcting it recomputes
 * `expiresOn` from the registry's CURRENT renewalMonths, which is the one place
 * a re-derivation is right: someone is deliberately re-deciding this row.
 */
export async function reviewCertificate(
  certificateId: string,
  reviewerId: string,
  decision: "APPROVED" | "REJECTED",
  note: string | null,
  correctedCompletedOn: Date | null
) {
  const cert = await prisma.trainingCertificate.findUnique({
    where: { id: certificateId },
    include: { training: { select: { renewalMonths: true, name: true } } },
  });
  if (!cert) return { error: "Certificate not found", status: 404 } as const;
  if (cert.status !== "PENDING") {
    return { error: "That certificate has already been reviewed", status: 409 } as const;
  }
  if (decision === "REJECTED" && !note) {
    return { error: "Say why you are rejecting it — the member sees this", status: 400 } as const;
  }

  const completedOn = correctedCompletedOn ?? cert.completedOn;
  const updated = await prisma.trainingCertificate.update({
    where: { id: certificateId },
    data: {
      status: decision,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNote: note,
      completedOn,
      expiresOn:
        decision === "APPROVED"
          ? computeExpiry(completedOn, cert.training.renewalMonths)
          : cert.expiresOn,
      // A fresh decision starts a fresh reminder cycle.
      lastRemindedAt: null,
    },
  });
  return { certificate: updated, trainingName: cert.training.name };
}

/** Every live training with this member's derived standing. */
export async function getMemberTrainingStatuses(memberId: string) {
  const [trainings, certs] = await Promise.all([
    prisma.training.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.trainingCertificate.findMany({
      where: { memberId },
      select: { trainingId: true, status: true, expiresOn: true, createdAt: true },
    }),
  ]);
  const now = new Date();
  const byTraining = new Map<string, CertLike[]>();
  for (const c of certs) {
    const list = byTraining.get(c.trainingId) ?? [];
    list.push(c);
    byTraining.set(c.trainingId, list);
  }
  return trainings.map((t) => {
    const mine = byTraining.get(t.id) ?? [];
    const newestApproved = mine
      .filter((c) => c.status === "APPROVED")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return {
      trainingId: t.id,
      name: t.name,
      providerName: t.providerName,
      renewalMonths: t.renewalMonths,
      status: deriveStatus(mine, now),
      expiresOn: newestApproved?.expiresOn ?? null,
    };
  });
}

/**
 * Approved certificates inside the 30-day window, one per (member, training).
 *
 * The newest-per-pair filter is not cosmetic: a member who has renewed four
 * years running has four approved rows, three of them long expired, and without
 * it every one of them would generate a "lapsed" DM every single morning.
 */
export async function findExpiringCertificates(now: Date) {
  const horizon = new Date(now.getTime() + 30 * 86_400_000);
  const rows = await prisma.trainingCertificate.findMany({
    where: { status: "APPROVED", expiresOn: { not: null, lte: horizon } },
    orderBy: { createdAt: "desc" },
    include: {
      training: { select: { id: true, name: true } },
      member: { select: { id: true, slackId: true } },
    },
  });

  const newestPerPair = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.memberId}:${r.trainingId}`;
    // rows are newest-first, so the first one wins.
    if (!newestPerPair.has(key)) newestPerPair.set(key, r);
  }
  return [...newestPerPair.values()];
}
