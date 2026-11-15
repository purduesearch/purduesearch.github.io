// Pure résumé rules: bullets, JSON Resume v1.0.0, plain text. No I/O, no database, no model calls.
// Numbers come only from impact snapshots and member-entered, admin-verified claims.
import {
  METRICS, renderBullet, shareable, validateMemberTemplate,
  type ImpactAttestationInput, type ImpactProof,
} from "./impactMetricCore.js";

export interface SnapshotInput {
  metricId: string;
  value: number;
  detail?: { tool?: string | null; projects?: readonly { id?: string; name: string }[] | null } | null;
}
export interface AttestationInput {
  id: string;
  kind: "CLAIM" | "CONFIRM";
  status: "PENDING" | "VERIFIED" | "DECLINED" | "NEEDS_PROOF";
  metricId?: string | null;
  label?: string | null;
  value: number;
  unit?: string | null;
}
/** Mirrors ResumeBullet rows. `position` is 1-based when the member ordered it; 0 means "not ordered". */
export interface BulletRowInput {
  sourceKind: "METRIC" | "ATTESTATION" | string;
  sourceId: string;
  template?: string | null;
  included: boolean;
  position: number;
}
export type MetricDefInput = {
  id: string; label?: string; proof: "RECORDS" | "CONFIRMED"; bulletTemplate: string;
};

export interface ResumeBulletOut {
  key: string; // "METRIC:<id>" | "ATTESTATION:<id>"
  sourceKind: "METRIC" | "ATTESTATION";
  sourceId: string;
  metricId: string | null;
  claimId: string | null;
  text: string;
  proof: ImpactProof;
  shareable: boolean;
  /** True while awaiting a lead/admin: unverified claims and unconfirmed CONFIRMED metrics. Member view only. */
  pending: boolean;
  selected: boolean;
  hidden: boolean;
  order: number;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function hasVerifiedConfirm(metricId: string, value: number, atts: readonly AttestationInput[]): boolean {
  return atts.some(a => a.kind === "CONFIRM" && a.metricId === metricId
    && shareable("CONFIRMED", a as ImpactAttestationInput, { metricId, value }));
}

export function buildBullets(
  snapshots: readonly SnapshotInput[],
  attestations: readonly AttestationInput[],
  bulletRows: readonly BulletRowInput[],
  metricDefs: readonly MetricDefInput[] = METRICS,
  disabledMetrics: ReadonlySet<string> | readonly string[] = [],
): ResumeBulletOut[] {
  const disabled = new Set(disabledMetrics);
  const rows = new Map(bulletRows.map(r => [`${r.sourceKind}:${r.sourceId}`, r]));
  const snapById = new Map(snapshots.map(s => [s.metricId, s]));
  const draft: (ResumeBulletOut & { rank: number })[] = [];

  metricDefs.forEach((def, rank) => {
    const snap = snapById.get(def.id);
    if (!snap || !Number.isFinite(snap.value) || !(snap.value > 0) || disabled.has(def.id)) return;
    const row = rows.get(`METRIC:${def.id}`);
    const ok = def.proof === "RECORDS" ? true : hasVerifiedConfirm(def.id, snap.value, attestations);
    const template = row?.template != null && validateMemberTemplate(row.template).valid ? row.template : def.bulletTemplate;
    const text = renderBullet(template, {
      n: snap.value, tool: snap.detail?.tool ?? null, projects: (snap.detail?.projects ?? []).map(p => p.name),
    });
    const included = row ? row.included : true;
    draft.push({
      key: `METRIC:${def.id}`, sourceKind: "METRIC", sourceId: def.id, metricId: def.id, claimId: null, text,
      proof: def.proof, shareable: ok, pending: !ok, selected: included, hidden: !included, order: 0, rank,
    });
  });

  for (const a of attestations) {
    if (a.kind !== "CLAIM" || a.status === "DECLINED") continue;
    if (!Number.isFinite(a.value) || a.value < 0 || !a.label?.trim()) continue;
    const row = rows.get(`ATTESTATION:${a.id}`);
    const unit = a.unit?.trim();
    const fallback = `${a.label.trim()}: ${a.value}${unit ? ` ${unit}` : ""}`;
    const text = row?.template != null && validateMemberTemplate(row.template).valid
      ? renderBullet(row.template, { n: a.value }) : fallback;
    const ok = shareable("CLAIM", a as ImpactAttestationInput);
    const included = row ? row.included : true;
    draft.push({
      key: `ATTESTATION:${a.id}`, sourceKind: "ATTESTATION", sourceId: a.id, metricId: null, claimId: a.id, text,
      proof: "CLAIM", shareable: ok, pending: !ok, selected: included, hidden: !included, order: 0,
      rank: metricDefs.length,
    });
  }

  // Explicit member order (position > 0) first, then registry order, then claims by id.
  const pos = (key: string) => { const p = rows.get(key)?.position ?? 0; return p > 0 ? p : Infinity; };
  draft.sort((a, b) => {
    const pa = pos(a.key), pb = pos(b.key);
    if (pa !== pb) return pa < pb ? -1 : 1;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return compare(a.key, b.key);
  });
  return draft.map(({ rank: _rank, ...b }, i) => ({ ...b, order: i }));
}

/** Only these ever leave the member's view. */
export const exportable = (b: ResumeBulletOut) => b.shareable && !b.pending && b.selected && !b.hidden;

export interface ResumeProfileInput {
  major?: string | null; gradTerm?: string | null; headline?: string | null; targetRoles?: readonly string[];
}
export interface ResumeMemberInput { name: string; email?: string | null }
export interface ResumeSkillInput { name: string; area: string }
export interface ResumeCertificationInput { name: string; issuer?: string | null; date?: string | null; url?: string | null }
export type ResumeBadgeInput = ResumeCertificationInput;

export interface JsonResume {
  $schema: string;
  basics: { name: string; label?: string; email?: string; summary?: string };
  work: { name: string; position: string; highlights: string[] }[];
  education?: { institution: string; area?: string; endDate?: string }[];
  skills: { name: string; keywords: string[] }[];
  certificates: { name: string; issuer?: string; date?: string; url?: string }[];
}

export const JSON_RESUME_SCHEMA = "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json";

/**
 * JSON Resume v1.0.0. This is the member's OWN download, so `basics.email` is included only when the caller
 * passes `options.includeEmail: true` AND supplies an email. Public/sponsor callers must never set it.
 * No photo/image, Slack id, skill level, pending claim or unconfirmed metric is ever emitted.
 */
export function buildJsonResume(
  profile: ResumeProfileInput,
  member: ResumeMemberInput,
  bullets: readonly ResumeBulletOut[],
  skills: readonly ResumeSkillInput[],
  certifications: readonly ResumeCertificationInput[],
  badges: readonly ResumeBadgeInput[] = [],
  options: { includeEmail?: boolean } = {},
): JsonResume {
  const roles = (profile.targetRoles ?? []).map(r => r.trim()).filter(Boolean);
  const label = roles[0] ?? profile.headline?.trim() ?? "";
  const basics: JsonResume["basics"] = { name: member.name };
  if (label) basics.label = label;
  if (options.includeEmail && member.email?.trim()) basics.email = member.email.trim();
  if (profile.headline?.trim()) basics.summary = profile.headline.trim();

  const byArea = new Map<string, Set<string>>();
  for (const s of skills) {
    const area = s.area.trim() || "Other";
    const name = s.name.trim();
    if (!name) continue;
    if (!byArea.has(area)) byArea.set(area, new Set());
    byArea.get(area)!.add(name);
  }
  const grouped = [...byArea.entries()].sort((a, b) => compare(a[0], b[0]))
    .map(([name, set]) => ({ name, keywords: [...set].sort(compare) }));

  const certificates = [...certifications, ...badges].map(c => ({
    name: c.name, ...(c.issuer ? { issuer: c.issuer } : {}), ...(c.date ? { date: c.date } : {}), ...(c.url ? { url: c.url } : {}),
  })).sort((a, b) => compare(a.name, b.name) || compare(a.date ?? "", b.date ?? ""));

  const out: JsonResume = {
    $schema: JSON_RESUME_SCHEMA,
    basics,
    work: [{
      name: "Purdue SEARCH", position: "Member",
      highlights: bullets.filter(exportable).sort((a, b) => a.order - b.order).map(b => b.text),
    }],
    skills: grouped,
    certificates,
  };
  if (profile.major?.trim()) {
    out.education = [{ institution: "Purdue University", area: profile.major.trim(), ...(profile.gradTerm ? { endDate: profile.gradTerm } : {}) }];
  }
  return out;
}

/** Plain text for copy, built from a JSON Resume so the same exclusions apply. */
export function buildPlainText(resume: JsonResume): string {
  const lines: string[] = [resume.basics.name];
  if (resume.basics.label) lines.push(resume.basics.label);
  if (resume.basics.email) lines.push(resume.basics.email);
  for (const e of resume.education ?? []) {
    lines.push("", "EDUCATION", `${e.institution}${e.area ? `, ${e.area}` : ""}${e.endDate ? ` (${e.endDate})` : ""}`);
  }
  const w = resume.work[0];
  if (w && w.highlights.length) lines.push("", w.name.toUpperCase(), ...w.highlights.map(h => `- ${h}`));
  if (resume.skills.length) lines.push("", "SKILLS", ...resume.skills.map(s => `${s.name}: ${s.keywords.join(", ")}`));
  if (resume.certificates.length) {
    lines.push("", "CERTIFICATIONS", ...resume.certificates.map(c => `- ${c.name}${c.issuer ? `, ${c.issuer}` : ""}${c.date ? ` (${c.date})` : ""}`));
  }
  return lines.join("\n") + "\n";
}
