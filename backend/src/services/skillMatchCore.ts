// Skills taxonomy matching (pure). No DB, no network.
//
// Gemini never creates skills: it picks from candidate keys, and any free-text
// name it proposes is first resolved against every skill name + alias here, so
// "React" / "ReactJS" / "React.js" collapse to one skill instead of a proposal.

export interface SkillLite {
  id: string;
  name: string;
  aliases: string[];
}

export interface AliasIndex {
  /** normalised name or alias -> skill id */
  byNorm: Map<string, string>;
  /** normalised forms claimed by more than one skill (taxonomy data bug; first wins) */
  collisions: { norm: string; skillIds: string[] }[];
}

/** Lowercase, strip diacritics/punctuation, fold a trailing "js", keep c++/c#. */
export function normalizeSkillName(raw: string): string {
  let s = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  s = s.replace(/c\+\+/g, "cplusplus").replace(/c#/g, "csharp").replace(/\.net\b/g, "dotnet");
  s = s.replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
  // react.js / reactjs / node.js -> react / node. Length guard keeps "js" itself intact.
  if (s.length > 4 && s.endsWith("js")) s = s.slice(0, -2);
  return s;
}

export function buildAliasIndex(skills: SkillLite[]): AliasIndex {
  const byNorm = new Map<string, string>();
  const claimed = new Map<string, Set<string>>();
  for (const skill of skills) {
    for (const form of [skill.name, ...skill.aliases]) {
      const norm = normalizeSkillName(form);
      if (!norm) continue;
      const set = claimed.get(norm) ?? new Set<string>();
      set.add(skill.id);
      claimed.set(norm, set);
      if (!byNorm.has(norm)) byNorm.set(norm, skill.id);
    }
  }
  const collisions = [...claimed.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([norm, ids]) => ({ norm, skillIds: [...ids] }));
  return { byNorm, collisions };
}

/** Exact match on the normalised form; null when the name is genuinely new. */
export function resolveSkillName(name: string, index: AliasIndex): string | null {
  const norm = normalizeSkillName(name);
  return norm ? index.byNorm.get(norm) ?? null : null;
}

/** Edit distance, bounded: returns max+1 as soon as the distance must exceed max. */
export function boundedLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Admin hint for the review queue: existing skills one typo away from a proposal. Never auto-merges. */
export function nearSkillMatches(name: string, index: AliasIndex, limit = 3): string[] {
  const norm = normalizeSkillName(name);
  if (norm.length < 5) return [];
  const hits: { id: string; d: number }[] = [];
  for (const [form, id] of index.byNorm) {
    const d = boundedLevenshtein(norm, form, 1);
    if (d <= 1 && !hits.some((h) => h.id === id)) hits.push({ id, d });
  }
  return hits.sort((x, y) => x.d - y.d).slice(0, limit).map((h) => h.id);
}

export interface EdgeLite {
  fromId: string;
  toId: string;
}

/**
 * Would adding from -> to close a loop? Used for PARENT and PREREQUISITE edges
 * (RELATED is symmetric and exempt). Edges are "from depends on / is child of to".
 */
export function wouldCreateCycle(edges: EdgeLite[], fromId: string, toId: string): boolean {
  if (fromId === toId) return true;
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.fromId, [...(out.get(e.fromId) ?? []), e.toId]);
  // A cycle appears iff `from` is already reachable from `to`.
  const seen = new Set<string>();
  const stack = [toId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === fromId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of out.get(cur) ?? []) stack.push(next);
  }
  return false;
}

// ── Candidate prefilter ──────────────────────────────────────

const STOP = new Set(["the", "and", "for", "with", "from", "into", "this", "that", "add", "fix", "use", "new", "update"]);

export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/c\+\+/g, "cplusplus")
    .replace(/c#/g, "csharp")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export interface ScoredSkill {
  id: string;
  score: number;
}

/**
 * Lexical prefilter: how many of a skill's name/alias tokens appear in the
 * artifact text. Cheap and deterministic; the embedding prefilter (later phase)
 * is merged with this, and the model only ever sees the resulting short list.
 */
export function rankSkillCandidates(text: string, skills: SkillLite[], limit: number): ScoredSkill[] {
  const textTokens = new Set(tokenizeText(text));
  const textNorm = normalizeSkillName(text);
  const scored: ScoredSkill[] = [];
  for (const skill of skills) {
    let best = 0;
    for (const form of [skill.name, ...skill.aliases]) {
      const toks = tokenizeText(form);
      if (!toks.length) continue;
      const hit = toks.filter((t) => textTokens.has(t)).length / toks.length;
      // Whole-form substring (e.g. "solidworks") beats partial token overlap.
      const norm = normalizeSkillName(form);
      const whole = norm.length >= 4 && textNorm.includes(norm) ? 1 : 0;
      best = Math.max(best, whole ? 1 + hit : hit);
    }
    if (best > 0) scored.push({ id: skill.id, score: best });
  }
  return scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
