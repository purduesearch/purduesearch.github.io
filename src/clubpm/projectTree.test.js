import { buildProjectRows } from './projectTree';

const p = (id, parentId = null) => ({ id, parentId });
const ids = rows => rows.map(r => `${r.depth}:${r.project.id}`);

describe('buildProjectRows', () => {
  it('puts each child directly under its parent', () => {
    const rows = buildProjectRows([p('a'), p('b'), p('a1', 'a'), p('a2', 'a')]);
    expect(ids(rows)).toEqual(['0:a', '1:a1', '1:a2', '0:b']);
  });

  it('floats starred roots first and keeps their children attached', () => {
    const rows = buildProjectRows([p('a'), p('b'), p('b1', 'b')], { starredIds: ['b'] });
    expect(ids(rows)).toEqual(['0:b', '1:b1', '0:a']);
  });

  it('shows a child as a root when its parent is not in the list', () => {
    const rows = buildProjectRows([p('x1', 'missing'), p('a')]);
    expect(ids(rows)).toEqual(['0:x1', '0:a']);
  });

  it('keeps every project exactly once', () => {
    const list = [p('a'), p('a1', 'a'), p('b'), p('c', 'b')];
    expect(buildProjectRows(list)).toHaveLength(list.length);
  });
});
