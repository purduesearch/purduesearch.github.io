/**
 * Step navigation for the course player's Previous / Next controls.
 *
 * Pure so it can be tested: `CoursePlayerPage` imports TipTap, which Jest
 * cannot load, so anything defined there is untestable.
 *
 * `sections` is the server's flat list, already ordered by (module order,
 * section order) — which is what makes "the next one" work across a module
 * boundary. Locked sections are skipped rather than offered and refused: the
 * lock is a real server-side gate (locked sections arrive without their
 * content), so stepping onto one would show an empty lesson.
 */
export function stepNeighbours(sections, selectedId) {
  const list = Array.isArray(sections) ? sections : [];
  const index = list.findIndex((s) => s && s.id === selectedId);
  if (index === -1) return { index, previous: null, next: null };

  const previous = [...list.slice(0, index)].reverse().find((s) => s && !s.locked) ?? null;
  const next = list.slice(index + 1).find((s) => s && !s.locked) ?? null;
  return { index, previous, next };
}
