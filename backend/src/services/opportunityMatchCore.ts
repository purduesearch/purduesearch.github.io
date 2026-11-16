// Opportunity matching (pure, deterministic, no model calls). The indexes are passed in.

import { normalizeText } from "./onetCsvCore.js";
import { normalizeSkillName, type AliasIndex } from "./skillMatchCore.js";

export interface TitleIndex {
  /** O*NET titleNorm (normalizeText of the title) -> occupation codes, sorted */
  byTitle: Map<string, string[]>;
  occupations: { code: string; tokens: Set<string> }[];
}

export const MAX_OCCUPATION_MATCHES = 3;
export const TOKEN_OVERLAP_MIN = 0.6;

const stem = (t: string) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);
const tokensOf = (norm: string) => norm.split(" ").filter(Boolean).map(stem);

export function buildTitleIndex(
  jobTitles: { occupationCode: string; titleNorm: string }[],
  occupations: { code: string; title: string }[],
): TitleIndex {
  const sets = new Map<string, Set<string>>();
  for (const r of jobTitles) {
    if (!r.titleNorm) continue;
    const set = sets.get(r.titleNorm) ?? new Set<string>();
    set.add(r.occupationCode);
    sets.set(r.titleNorm, set);
  }
  const byTitle = new Map<string, string[]>();
  for (const [k, v] of sets) byTitle.set(k, [...v].sort());
  const occ = occupations
    .map((o) => ({ code: o.code, tokens: new Set(tokensOf(normalizeText(o.title))) }))
    .filter((o) => o.tokens.size > 0)
    .sort((a, b) => a.code.localeCompare(b.code));
  return { byTitle, occupations: occ };
}

const ROMAN = new Set(["i", "ii", "iii", "iv"]);
const SENIORITY_WORDS = new Set(["intern", "interns", "internship", "internships", "junior", "jr", "senior", "sr"]);

/** Takes a normalized title (normalizeText output); drops seniority/intern words and I-IV. */
export function stripSeniority(norm: string): string {
  const s = norm.replace(/\bstudent trainee\b/g, " ").replace(/\bco op\b/g, " ");
  return s.split(" ").filter((t) => t && !SENIORITY_WORDS.has(t) && !ROMAN.has(t)).join(" ");
}

export function matchOccupations(title: string, index: TitleIndex): string[] {
  const norm = normalizeText(title ?? "");
  if (!norm) return [];
  const exact = index.byTitle.get(norm);
  if (exact?.length) return exact.slice(0, MAX_OCCUPATION_MATCHES);

  const stripped = stripSeniority(norm);
  if (!stripped) return [];
  if (stripped !== norm) {
    const hit = index.byTitle.get(stripped);
    if (hit?.length) return hit.slice(0, MAX_OCCUPATION_MATCHES);
  }

  const q = new Set(tokensOf(stripped));
  if (q.size === 0) return [];
  const scored: { code: string; score: number }[] = [];
  for (const o of index.occupations) {
    let common = 0;
    for (const t of q) if (o.tokens.has(t)) common++;
    const score = common / Math.max(q.size, o.tokens.size);
    if (score >= TOKEN_OVERLAP_MIN) scored.push({ code: o.code, score });
  }
  scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return scored.slice(0, MAX_OCCUPATION_MATCHES).map((s) => s.code);
}

// Tokens keep internal + # . so "C++", "C#", ".NET", "Node.js" survive; everything else is a boundary.
// Trailing dots (sentence ends) are trimmed after the match.
const SKILL_TOKEN = /\.?[A-Za-z0-9][A-Za-z0-9+#.]*/g;
const MAX_NGRAM = 4;
const MAX_SKILL_TEXT = 50_000;

/** Word-boundary alias matching over the AliasIndex. Returns unique skill ids in first-appearance order. */
export function matchSkills(text: string, aliasIndex: AliasIndex): string[] {
  if (typeof text !== "string" || !text) return [];
  const tokens: string[] = [];
  for (const m of text.slice(0, MAX_SKILL_TEXT).matchAll(SKILL_TOKEN)) {
    const t = m[0].replace(/\.+$/, "");
    if (t) tokens.push(t);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 1; n--) {
      const norm = normalizeSkillName(tokens.slice(i, i + n).join(" "));
      // One-letter forms ("c", "r") are too ambiguous to match from prose.
      if (norm.length < 2) continue;
      const id = aliasIndex.byNorm.get(norm);
      if (id) {
        if (!seen.has(id)) { seen.add(id); out.push(id); }
        i += n - 1;
        break;
      }
    }
  }
  return out;
}

const INTERN_TITLE = /\b(intern|interns|internship|internships|co-?op|student trainee|apprentice(ship)?|pathways)\b/i;
const INTERN_BODY = /\b(summer internship|internship program|this internship|co-?op (position|program|student)|student trainee)\b/i;

/** Fixed keywords: a title hit is enough; the body needs a stronger phrase. */
export function isInternship(title: string, description?: string): boolean {
  if (INTERN_TITLE.test(title ?? "")) return true;
  return !!description && INTERN_BODY.test(description.slice(0, 5000));
}
