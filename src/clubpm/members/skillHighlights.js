// Picks the skills a member card shows: the strongest few ("top"), then skills
// from other areas that the top ones do not cover ("distinct"), so a card reads
// as a range of abilities, not three near-duplicates. Input is the
// GET /api/skills/members/:id payload; hidden or empty payloads give no skills.

export const TOP_COUNT = 3;
export const DISTINCT_COUNT = 2;

export function pickSkillHighlights(data, { top = TOP_COUNT, distinct = DISTINCT_COUNT } = {}) {
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const all = groups.flatMap((g) => (g.skills ?? []).map((s) => ({ ...s, area: g.name ?? null })));
  const rank = (a, b) =>
    (b.level - a.level)
    || ((b.verifiedByLead ? 1 : 0) - (a.verifiedByLead ? 1 : 0))
    || ((b.endorsements ?? 0) - (a.endorsements ?? 0))
    || a.name.localeCompare(b.name);
  const sorted = [...all].sort(rank);
  const topSkills = sorted.slice(0, top);
  const usedAreas = new Set(topSkills.map((s) => s.area));
  const usedIds = new Set(topSkills.map((s) => s.skillId));

  // One skill per area not already shown, strongest area winners first.
  const distinctSkills = [];
  for (const s of sorted) {
    if (distinctSkills.length >= distinct) break;
    if (usedIds.has(s.skillId) || usedAreas.has(s.area)) continue;
    distinctSkills.push(s);
    usedAreas.add(s.area);
  }
  // Too few areas: fill with the next strongest unused skills.
  for (const s of sorted) {
    if (distinctSkills.length >= distinct) break;
    if (usedIds.has(s.skillId) || distinctSkills.includes(s)) continue;
    distinctSkills.push(s);
  }
  return { top: topSkills, distinct: distinctSkills, total: all.length };
}
