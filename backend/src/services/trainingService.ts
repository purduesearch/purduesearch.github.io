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
