// Sub-projects are one level deep (the API enforces it). The sidebar and phone
// picker want a flat, ordered list: each parent followed by its children.
// A child whose parent is not in the list (not loaded, or filtered out by a
// search) is shown as a root so it never disappears.

export function subProjectTagColor(project) {
  return project.rollup?.tagColor || '#6c5ce7';
}

/**
 * @param {Array<{id: string, parentId?: string|null}>} projects
 * @param {{ starredIds?: string[] }} [opts] starred roots sort first; order is otherwise preserved
 * @returns {Array<{ project: object, depth: 0 | 1 }>}
 */
export function buildProjectRows(projects, { starredIds = [] } = {}) {
  const ids = new Set(projects.map(p => p.id));
  const childrenOf = new Map();
  const roots = [];
  for (const p of projects) {
    if (p.parentId && ids.has(p.parentId)) {
      if (!childrenOf.has(p.parentId)) childrenOf.set(p.parentId, []);
      childrenOf.get(p.parentId).push(p);
    } else {
      roots.push(p);
    }
  }
  const starred = new Set(starredIds);
  const ordered = [
    ...roots.filter(p => starred.has(p.id)),
    ...roots.filter(p => !starred.has(p.id)),
  ];
  const rows = [];
  for (const root of ordered) {
    rows.push({ project: root, depth: 0 });
    const kids = [...(childrenOf.get(root.id) ?? [])].sort((a, b) =>
      (starred.has(a.id) ? 0 : 1) - (starred.has(b.id) ? 0 : 1)
    );
    for (const kid of kids) rows.push({ project: kid, depth: 1 });
  }
  return rows;
}
