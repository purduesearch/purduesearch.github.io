import { pickSkillHighlights } from './skillHighlights';

const s = (skillId, level, extra = {}) => ({ skillId, name: skillId, level, endorsements: 0, ...extra });

test('empty and hidden payloads give nothing', () => {
  expect(pickSkillHighlights(null)).toEqual({ top: [], distinct: [], total: 0 });
  expect(pickSkillHighlights({ hidden: true, groups: [] }).total).toBe(0);
});

test('top is strongest first; distinct comes from other areas', () => {
  const data = {
    groups: [
      { name: 'CAD', skills: [s('cad1', 5), s('cad2', 4), s('cad3', 4)] },
      { name: 'Electronics', skills: [s('pcb', 3), s('solder', 2)] },
      { name: 'Writing', skills: [s('docs', 2)] },
    ],
  };
  const out = pickSkillHighlights(data);
  expect(out.top.map((x) => x.skillId)).toEqual(['cad1', 'cad2', 'cad3']);
  expect(out.distinct.map((x) => x.skillId)).toEqual(['pcb', 'docs']);
  expect(out.total).toBe(6);
});

test('single area falls back to next strongest skills without repeats', () => {
  const data = { groups: [{ name: 'CAD', skills: [s('a', 5), s('b', 4), s('c', 3), s('d', 2), s('e', 1)] }] };
  const out = pickSkillHighlights(data);
  expect(out.distinct.map((x) => x.skillId)).toEqual(['d', 'e']);
});
