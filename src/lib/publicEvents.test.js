import {
  PURDUE_TZ, typeConfig, purdueDayKey, formatPurdueTime, formatTimeRange, dateTile,
  formatDayKey, buildMonthGrid, groupByDay, upcomingEvents, filterByType,
  purdueMonthOf, shiftMonth, compareMonth, monthLabel,
} from './publicEvents';

// 2026-09-16 22:30Z = 6:30 PM EDT on Wed Sep 16 (Indianapolis observes DST).
const EV = (over = {}) => ({
  id: 'e1', title: 'GM', description: null, type: 'MEETING',
  startTime: '2026-09-16T22:30:00.000Z', endTime: '2026-09-16T23:30:00.000Z',
  location: 'ARMS 1010', isVirtual: false, ...over,
});

test('timezone constant', () => {
  expect(PURDUE_TZ).toBe('America/Indiana/Indianapolis');
});

test('typeConfig falls back to OTHER and uses literal FA classes', () => {
  expect(typeConfig('MEETING').icon).toBe('fas fa-users');
  expect(typeConfig('NOPE')).toBe(typeConfig('OTHER'));
});

test('purdueDayKey uses Purdue local date, not UTC', () => {
  // 02:00Z on the 17th is still 10 PM on the 16th in Indiana.
  expect(purdueDayKey('2026-09-17T02:00:00Z')).toBe('2026-09-16');
});

test('formatPurdueTime / formatTimeRange', () => {
  expect(formatPurdueTime('2026-09-16T22:30:00Z')).toBe('6:30 PM');
  expect(formatTimeRange(EV().startTime, EV().endTime)).toBe('6:30 PM – 7:30 PM ET');
  expect(formatTimeRange(EV().startTime, null)).toBe('6:30 PM ET');
  expect(formatTimeRange('2026-09-16T22:30:00Z', '2026-09-18T14:00:00Z')).toBe('6:30 PM – Sep 18, 10:00 AM ET');
});

test('dateTile', () => {
  expect(dateTile('2026-09-16T22:30:00Z')).toEqual({ month: 'Sep', day: '16', weekday: 'Wed' });
});

test('formatDayKey', () => {
  expect(formatDayKey('2026-09-16')).toBe('Wednesday, September 16');
});

test('buildMonthGrid pads to whole weeks', () => {
  const cells = buildMonthGrid(2026, 8); // September 2026 starts on a Tuesday
  expect(cells.length % 7).toBe(0);
  expect(cells[0]).toEqual({ key: '2026-08-30', day: 30, inMonth: false });
  expect(cells[2]).toEqual({ key: '2026-09-01', day: 1, inMonth: true });
  expect(cells.filter(c => c.inMonth)).toHaveLength(30);
});

test('groupByDay buckets by Purdue date and sorts', () => {
  const late = EV({ id: 'b', startTime: '2026-09-17T01:00:00Z' }); // 9 PM on the 16th
  const early = EV({ id: 'a' });
  const map = groupByDay([late, early]);
  expect(map.get('2026-09-16').map(e => e.id)).toEqual(['a', 'b']);
});

test('upcomingEvents keeps in-progress events and sorts', () => {
  const now = new Date('2026-09-16T23:00:00Z');
  const past = EV({ id: 'p', startTime: '2026-09-10T22:30:00Z', endTime: '2026-09-10T23:30:00Z' });
  const running = EV({ id: 'r' });
  const next = EV({ id: 'n', startTime: '2026-09-20T22:30:00Z', endTime: null });
  expect(upcomingEvents([next, past, running], now).map(e => e.id)).toEqual(['r', 'n']);
});

test('filterByType treats unknown types as OTHER', () => {
  const list = [EV({ id: 'm' }), EV({ id: 'x', type: 'WEIRD' }), EV({ id: 's', type: 'SOCIAL' })];
  expect(filterByType(list, 'ALL')).toHaveLength(3);
  expect(filterByType(list, 'OTHER').map(e => e.id)).toEqual(['x']);
  expect(filterByType(list, 'SOCIAL').map(e => e.id)).toEqual(['s']);
});

test('month helpers', () => {
  expect(purdueMonthOf('2026-10-01T02:00:00Z')).toEqual({ year: 2026, month: 8 }); // still Sep 30 in Indiana
  expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  expect(compareMonth({ year: 2026, month: 8 }, { year: 2026, month: 9 })).toBeLessThan(0);
  expect(compareMonth({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(0);
  expect(monthLabel({ year: 2026, month: 8 })).toBe('September 2026');
});
