// Pure counted-impact rules. No model, database, or sharing-preference dependencies.
export const METRIC_VERSION = "impact-v1";
export const PUBLIC_FLOOR = 3;

export type ImpactProof = "RECORDS" | "CONFIRMED" | "CLAIM";
export type MetricDefinition = {
  id: string;
  label: string;
  unitSingular: string;
  unitPlural: string;
  proof: "RECORDS" | "CONFIRMED";
  dwaId: string | null;
  /** O*NET software category element ids, matching OnetSoftware.categoryId. */
  softwareCategories: string[];
  bulletTemplate: string;
  achievement?: { id: string; threshold: number };
};

// Order is display order. Wording describes the counted records, not inferred outcomes.
export const METRICS: readonly MetricDefinition[] = [
  {
    id: "members_trained", label: "Members completing authored courses", unitSingular: "member", unitPlural: "members",
    proof: "RECORDS", dwaId: "4.A.4.b.3.d.1", softwareCategories: ["2.E.8.b"],
    bulletTemplate: "Courses I authored were completed by {n} other members.", achievement: { id: "trainer", threshold: 5 },
  },
  {
    id: "courses_authored", label: "Published courses authored", unitSingular: "course", unitPlural: "courses",
    proof: "RECORDS", dwaId: "4.A.3.b.6.l.10", softwareCategories: ["2.E.8.b", "2.E.4.f"],
    bulletTemplate: "Authored {n} published courses.",
  },
  {
    id: "cad_items_released", label: "Released CAD items contributed to", unitSingular: "item", unitPlural: "items",
    proof: "RECORDS", dwaId: "4.A.3.b.2.d.1", softwareCategories: ["2.E.9.c", "2.E.9.m"],
    bulletTemplate: "Contributed uploaded versions to {n} released CAD items using {tool}.", achievement: { id: "cad-release", threshold: 5 },
  },
  {
    id: "cad_revisions", label: "Vault versions uploaded", unitSingular: "version", unitPlural: "versions",
    proof: "RECORDS", dwaId: "4.A.2.b.2.o.18", softwareCategories: ["2.E.9.c", "2.E.9.m"],
    bulletTemplate: "Uploaded {n} Vault versions using {tool}.",
  },
  {
    id: "drawings_released", label: "Released drawings contributed to", unitSingular: "drawing", unitPlural: "drawings",
    proof: "RECORDS", dwaId: "4.A.3.b.6.i.2", softwareCategories: ["2.E.9.c"],
    bulletTemplate: "Contributed uploaded versions to {n} released drawings.",
  },
  {
    id: "design_reviews", label: "Design change requests reviewed", unitSingular: "change request", unitPlural: "change requests",
    proof: "RECORDS", dwaId: "4.A.2.a.4.e.3", softwareCategories: ["2.E.9.c"],
    bulletTemplate: "Reviewed or signed off on {n} design change requests.", achievement: { id: "design-reviewer", threshold: 5 },
  },
  {
    id: "prs_merged", label: "Authored pull requests merged", unitSingular: "pull request", unitPlural: "pull requests",
    proof: "RECORDS", dwaId: "4.A.2.b.2.b.1", softwareCategories: ["2.E.7.b", "2.E.7.e", "2.E.7.h"],
    bulletTemplate: "Authored {n} merged pull requests for {projects}.", achievement: { id: "software-contributor", threshold: 10 },
  },
  {
    id: "code_reviews", label: "Code reviews recorded", unitSingular: "review", unitPlural: "reviews",
    proof: "RECORDS", dwaId: "4.A.2.a.4.e.3", softwareCategories: ["2.E.7.b", "2.E.5.c"],
    bulletTemplate: "Recorded {n} code reviews for {projects}.",
  },
  {
    id: "tasks_completed", label: "Completed assigned tasks", unitSingular: "task", unitPlural: "tasks",
    proof: "RECORDS", dwaId: null, softwareCategories: [],
    bulletTemplate: "Was assigned to {n} completed tasks for {projects}.",
  },
  {
    id: "lab_hours", label: "Confirmed lab hours", unitSingular: "hour", unitPlural: "hours",
    proof: "RECORDS", dwaId: null, softwareCategories: [],
    bulletTemplate: "Recorded {n} confirmed lab hours.", achievement: { id: "lab-practitioner", threshold: 50 },
  },
  {
    id: "team_led", label: "Other task assignees on largest led project", unitSingular: "assignee", unitPlural: "assignees",
    proof: "CONFIRMED", dwaId: "4.A.4.b.4.a.2", softwareCategories: ["2.E.1.e"],
    bulletTemplate: "Led a project with {n} other task assignees.", achievement: { id: "team-lead", threshold: 3 },
  },
  {
    id: "events_organized", label: "Past events organized", unitSingular: "event", unitPlural: "events",
    proof: "RECORDS", dwaId: "4.A.4.b.4.j.20", softwareCategories: ["2.E.4.h"],
    bulletTemplate: "Organized {n} past events.",
  },
  {
    id: "outreach_attendees", label: "Public event attendances", unitSingular: "attendance", unitPlural: "attendances",
    proof: "RECORDS", dwaId: "4.A.4.b.4.j.20", softwareCategories: ["2.E.4.h"],
    bulletTemplate: "Recorded {n} attendances at public events I organized.", achievement: { id: "outreach-organizer", threshold: 50 },
  },
  {
    id: "outreach_published", label: "Published outreach submissions", unitSingular: "submission", unitPlural: "submissions",
    proof: "RECORDS", dwaId: "4.A.3.b.6.p.3", softwareCategories: ["2.E.4.d", "2.E.4.k"],
    bulletTemplate: "Authored {n} published outreach submissions.",
  },
  {
    id: "blog_posts_published", label: "Published blog posts", unitSingular: "post", unitPlural: "posts",
    proof: "RECORDS", dwaId: "4.A.3.b.6.l.5", softwareCategories: ["2.E.4.d", "2.E.4.g"],
    bulletTemplate: "Authored {n} published blog posts.",
  },
  {
    id: "milestones_delivered", label: "Completed owned milestones", unitSingular: "milestone", unitPlural: "milestones",
    proof: "RECORDS", dwaId: "4.A.4.b.4.j.12", softwareCategories: ["2.E.1.e"],
    bulletTemplate: "Owned {n} completed milestones for {projects}.",
  },
];

// Achievements inherit proof gates from their metric; no separate scoring or ranking.
export const ACHIEVEMENTS = METRICS.flatMap(metric => metric.achievement
  ? [{ ...metric.achievement, metricId: metric.id, proof: metric.proof }] : []);

export type ImpactAttestationInput = {
  kind: "CLAIM" | "CONFIRM";
  status: "PENDING" | "VERIFIED" | "DECLINED" | "NEEDS_PROOF";
  metricId?: string | null;
  value: number;
};

/** Proof eligibility only: callers must separately enforce ownership, reviewer authority and opt-in. */
export function shareable(
  proof: ImpactProof,
  attestation?: ImpactAttestationInput | null,
  expected?: { metricId?: string; value?: number },
): boolean {
  if (proof === "RECORDS") return true;
  if (proof !== "CONFIRMED" && proof !== "CLAIM") return false;
  if (!attestation || attestation.status !== "VERIFIED"
    || !Number.isFinite(attestation.value) || attestation.value < 0) return false;
  if (attestation.kind !== (proof === "CONFIRMED" ? "CONFIRM" : "CLAIM")) return false;
  if (proof === "CONFIRMED" && !attestation.metricId?.trim()) return false;
  if (expected?.metricId !== undefined && attestation.metricId !== expected.metricId) return false;
  return expected?.value === undefined || (Number.isFinite(expected.value) && expected.value === attestation.value);
}

/** Callers exclude bots and apply sharing permissions before passing contributor rows. */
export function publicAggregate(values: readonly { memberId: string; value: number }[]): { sum: number; contributors: number } | null {
  const rows = values.filter(row => row.memberId.trim() && Number.isFinite(row.value) && row.value > 0);
  const contributors = new Set(rows.map(row => row.memberId)).size;
  if (contributors < PUBLIC_FLOOR) return null;
  // Stable addition order also makes fractional totals independent of input ordering.
  const sum = rows.map(row => row.value).sort((a, b) => a - b).reduce((total, value) => total + value, 0);
  return Number.isFinite(sum) ? { sum, contributors } : null;
}

/** Plain-text output; consumers must escape it for their rendering context. Values never recurse into templates. */
export function renderBullet(template: string, input: { n: number; tool?: string | null; projects?: readonly string[] | null }): string {
  if (!Number.isFinite(input.n) || input.n < 0) throw new RangeError("Impact value must be finite and nonnegative.");
  const remainder = template.replace(/\{(?:n|tool|projects)\}/g, "");
  if (/[{}]/.test(remainder)) throw new Error("Unsupported impact template placeholder.");
  const projects = [...new Set((input.projects ?? []).map(name => name.trim()).filter(Boolean))].slice(0, 2);
  const replacements = {
    n: String(input.n), // Exact JS number representation, without locale-dependent rounding.
    tool: input.tool?.trim() || "project tools",
    projects: projects.join(" and ") || "club projects",
  };
  return template.replace(/\{(n|tool|projects)\}/g, (_, key: keyof typeof replacements) => replacements[key]);
}

export type MemberTemplateValidation = { valid: true } | { valid: false; error: string };

export function validateMemberTemplate(template: unknown): MemberTemplateValidation {
  if (typeof template !== "string") return { valid: false, error: "Template must be text." };
  if (template.length > 300) return { valid: false, error: "Template must be at most 300 characters." };
  if ((template.match(/\{n\}/g) ?? []).length !== 1) return { valid: false, error: "Template must contain {n} exactly once." };
  if (/[{}]/.test(template.replace("{n}", ""))) return { valid: false, error: "Only the {n} placeholder is allowed; remove other braces." };
  return { valid: true };
}
