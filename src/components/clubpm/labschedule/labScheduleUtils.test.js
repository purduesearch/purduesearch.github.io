import {
  addDays, mondayOf, weekdayOf, fmtMin, fmtMinShort, fmtRange, dayHeader, weekLabel, rowStarts,
  blockBox, heatLevel, rectFromIndices, ownCells, othersHeat, overlapNames, describeRect,
  collapsedDays, unmetRequirements, ROW_PX, overlapWindows, scoreWindow, draftLabMessage,
} from './labScheduleUtils';

const MON = '2026-09-28';
const WEEK = Array.from({ length: 7 }, (_, i) => addDays(MON, i));
const occ = (memberId, date, startMin, endMin) => ({ shiftId: `s-${memberId}`, memberId, date, startMin, endMin, buddyWanted: false });

test('date helpers', () => {
  expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  expect(weekdayOf(MON)).toBe(1);
  expect(mondayOf('2026-10-04')).toBe(MON);
  expect(dayHeader(MON)).toEqual({ dow: 'Mon', dom: 28, month: 'Sep' });
  expect(weekLabel(WEEK)).toBe('Sep 28 – Oct 4');
});

test('time formatting', () => {
  expect(fmtMin(840)).toBe('2:00 PM');
  expect(fmtMin(0)).toBe('12:00 AM');
  expect(fmtMinShort(840)).toBe('2 PM');
  expect(fmtMinShort(870)).toBe('2:30');
  expect(fmtRange(840, 1020)).toBe('2:00–5:00 PM');
  expect(fmtRange(660, 780)).toBe('11:00 AM–1:00 PM');
});

test('grid geometry', () => {
  expect(rowStarts(480, 600)).toEqual([480, 510, 540, 570]);
  expect(blockBox(540, 600, 480)).toEqual({ top: 2 * ROW_PX, height: 2 * ROW_PX });
  expect([0, 1, 2, 3, 9].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  expect(rectFromIndices({ d0: 1, d1: 2, t0: 0, t1: 1 }, WEEK, rowStarts(480, 600)))
    .toEqual({ dates: ['2026-09-29', '2026-09-30'], startMin: 480, endMin: 540 });
});

test('cells and heat', () => {
  const occurrences = [occ('me', MON, 480, 540), occ('b', MON, 510, 570), occ('c', MON, 510, 540)];
  const mine = ownCells(occurrences, 'me');
  expect([...mine].sort()).toEqual([`${MON}|480`, `${MON}|510`]);
  const heat = othersHeat(occurrences, 'me');
  expect(heat.get(`${MON}|510`)).toBe(2);
  expect(heat.get(`${MON}|540`)).toBe(1);
  expect(heat.has(`${MON}|480`)).toBe(false);
});

test('overlap names in a rectangle', () => {
  const members = new Map([['b', { id: 'b', displayName: 'Sam' }]]);
  const rect = { dates: [MON, '2026-09-30'], startMin: 840, endMin: 1020 };
  const names = overlapNames(rect, [occ('b', MON, 900, 960), occ('b', '2026-09-30', 1000, 1100), occ('me', MON, 840, 1020)], 'me', members);
  expect(names).toEqual([{ id: 'b', name: 'Sam', days: ['Mon', 'Wed'] }]);
  expect(describeRect(rect)).toBe('Mon–Wed · 2:00–5:00 PM');
  expect(describeRect({ ...rect, dates: [MON] })).toBe('Mon · 2:00–5:00 PM');
});

test('weekend columns collapse only when empty', () => {
  const blocks = [{ date: '2026-10-03', startMin: 600, endMin: 660 }];
  expect([...collapsedDays(WEEK, blocks, [])]).toEqual([6]);
  expect([...collapsedDays(WEEK, [], [])].sort()).toEqual([5, 6]);
});

test('unmet requirements', () => {
  const ws = { requirements: [{ id: 'r1', name: 'Lab Safety' }, { id: 'r2', name: 'Chem' }] };
  expect(unmetRequirements(ws, { r1: 'ok', r2: 'expired' })).toEqual([{ id: 'r2', name: 'Chem', state: 'expired' }]);
  expect(unmetRequirements(ws, undefined).map(r => r.state)).toEqual(['missing', 'missing']);
});

describe('overlap finder', () => {
  const o = (memberId, startMin, endMin, weekly = true, date = MON) =>
    ({ shiftId: `s-${memberId}-${startMin}`, memberId, date, startMin, endMin, buddyWanted: false, weekly });

  test('two-person overlap', () => {
    const w = overlapWindows([o('A', 780, 900), o('B', 840, 960)], ['A', 'B'], 2, WEEK);
    expect(w).toEqual([{ date: MON, startMin: 840, endMin: 900, memberIds: ['A', 'B'], weekly: true }]);
  });

  test('threshold N of M', () => {
    const occs = [o('A', 780, 900), o('B', 840, 960), o('C', 900, 960)];
    expect(overlapWindows(occs, ['A', 'B', 'C'], 3, WEEK)).toEqual([]);
    const w = overlapWindows(occs, ['A', 'B', 'C'], 2, WEEK);
    expect(w.map(x => [x.startMin, x.endMin, x.memberIds])).toEqual([
      [840, 900, ['A', 'B']],
      [900, 960, ['B', 'C']],
    ]);
  });

  test('differing member sets split windows; ranking by minutes x people', () => {
    const occs = [o('A', 780, 960), o('B', 780, 960), o('C', 840, 900)];
    const w = overlapWindows(occs, ['A', 'B', 'C'], 2, WEEK);
    expect(w.map(x => [x.startMin, x.endMin, x.memberIds.length])).toEqual([
      [840, 900, 3], // 60 min x 3 people = 180
      [780, 840, 2], // 120, earlier start wins the tie
      [900, 960, 2],
    ]);
    expect(scoreWindow(w[0])).toBe(180);
  });

  test('ignores members not chosen', () => {
    expect(overlapWindows([o('A', 780, 900), o('Z', 780, 900)], ['A', 'B'], 2, WEEK)).toEqual([]);
  });

  test('weekly flag false when any contributor is one-off', () => {
    const w = overlapWindows([o('A', 780, 900), o('B', 780, 900, false)], ['A', 'B'], 2, WEEK);
    expect(w[0].weekly).toBe(false);
    const w2 = overlapWindows([o('A', 780, 900), o('B', 780, 900)], ['A', 'B'], 2, WEEK);
    expect(w2[0].weekly).toBe(true);
  });

  test('message wording', () => {
    const window = { date: '2026-09-29', startMin: 780, endMin: 840, memberIds: ['A', 'B'], weekly: true };
    expect(draftLabMessage({ names: ['@Gram'], window, recurring: false }))
      .toBe('Hey @Gram, would you like to meet in the lab Tuesday 1:00–2:00 PM this week?');
    expect(draftLabMessage({ names: ['@Gram', '@Lily'], window, recurring: true }))
      .toBe('Hey @Gram and @Lily, would you like to meet in the lab every Tuesday 1:00–2:00 PM?');
    expect(draftLabMessage({ names: ['@Gram', 'Lily', '@Max'], window, recurring: false }))
      .toBe('Hey @Gram, Lily, and @Max, would you like to meet in the lab Tuesday 1:00–2:00 PM this week?');
    expect(draftLabMessage({ names: ['@Gram'], window, recurring: true, taskTitle: 'Wire harness' }))
      .toBe('Hey @Gram, would you like to meet in the lab every Tuesday 1:00–2:00 PM to work on "Wire harness"?');
  });
});
