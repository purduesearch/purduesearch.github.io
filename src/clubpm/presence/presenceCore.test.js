import {
  shortName, memberColor, sampleAt, createSampleBuffer, pushSample, emptyPresence,
  reducePresence, lockInfo, encodeAnchor, decodeAnchor,
} from './presenceCore';

describe('shortName', () => {
  test('first word plus initial of last word', () => {
    expect(shortName('Maya Rodriguez')).toBe('Maya R.');
  });
  test('single word is kept as is', () => {
    expect(shortName('Maya')).toBe('Maya');
  });
  test('blank falls back to Someone', () => {
    expect(shortName('  ')).toBe('Someone');
  });
  test('multi-word surname uses the last word', () => {
    expect(shortName('ana de la cruz')).toBe('ana C.');
  });
});

describe('memberColor', () => {
  test('is stable for the same id and a hex colour', () => {
    expect(memberColor('m1')).toBe(memberColor('m1'));
    expect(memberColor('m1')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('sampleAt', () => {
  const decode = s => ({ x: s.fx, y: s.fy });
  const buf = () => {
    const b = createSampleBuffer();
    pushSample(b, { t: 0, fx: 0, fy: 0 });
    pushSample(b, { t: 100, fx: 100, fy: 100 });
    return b;
  };

  test('blends the two samples around the delayed moment', () => {
    expect(sampleAt(buf(), 150, 100, decode)).toEqual({ x: 50, y: 50 });
  });
  test('before the first sample returns the first sample', () => {
    expect(sampleAt(buf(), 50, 100, decode)).toEqual({ x: 0, y: 0 });
  });
  test('after the last sample returns the last sample', () => {
    expect(sampleAt(buf(), 300, 100, decode)).toEqual({ x: 100, y: 100 });
  });
  test('zero delay returns the latest sample', () => {
    expect(sampleAt(buf(), 50, 0, decode)).toEqual({ x: 100, y: 100 });
  });
  test('empty buffer returns null', () => {
    expect(sampleAt(createSampleBuffer(), 10, 0, decode)).toBeNull();
  });
});

describe('reducePresence', () => {
  const hiFrame = ['hi', {
    self: 's1', room: 'p1',
    projects: [['p1', 'Board A'], ['p2', 'Board B']],
    conns: [['s1', 'm1', 'Maya Rodriguez', null, 'p1'], ['s2', 'm2', 'Ana Lopez', null, 'p1']],
    locks: [['t1', 's1', 'm1']],
    drags: [['s1', ['t1'], 't1']],
    sel: [['s2', ['t9']]], cursors: [], carry: [], viewing: [],
  }];

  test('hi builds the full state', () => {
    const st = reducePresence(emptyPresence(), hiFrame);
    expect(st.self).toBe('s1');
    expect(st.conns.get('s2').name).toBe('Ana Lopez');
    expect(st.locks.get('t1')).toEqual({ sid: 's1', memberId: 'm1' });
    expect(st.drags.get('s1')).toEqual({ ids: ['t1'], grabbed: 't1', dropped: false });
  });

  test('join adds a connection', () => {
    const st = reducePresence(emptyPresence(), ['join', 's3', 'm3', 'Kim Park', null, 'p1']);
    expect(st.conns.get('s3')).toEqual({ sid: 's3', memberId: 'm3', name: 'Kim Park', avatarUrl: null, room: 'p1' });
  });

  test('bye drops the connection and that socket\'s locks', () => {
    const st = reducePresence(reducePresence(emptyPresence(), hiFrame), ['bye', 's1']);
    expect(st.conns.has('s1')).toBe(false);
    expect(st.locks.has('t1')).toBe(false);
    expect(st.drags.has('s1')).toBe(false);
  });

  test('room keeps locks but drops that socket\'s selection', () => {
    const st = reducePresence(reducePresence(emptyPresence(), hiFrame), ['room', 's2', 'p2']);
    expect(st.conns.get('s2').room).toBe('p2');
    expect(st.locks.has('t1')).toBe(true);
    expect(st.sel.has('s2')).toBe(false);
  });

  test('e/ds then p clears the lock and the drag', () => {
    let st = reducePresence(reducePresence(emptyPresence(), hiFrame), ['e', 's2', 'ds', ['t2', 't3'], 't2']);
    expect(st.locks.get('t2')).toEqual({ sid: 's2', memberId: 'm2' });
    expect(st.drags.has('s2')).toBe(true);
    st = reducePresence(st, ['p', [{ id: 't2' }, { id: 't3' }]]);
    expect(st.locks.has('t2')).toBe(false);
    expect(st.drags.has('s2')).toBe(false);
  });

  test('e/dc removes only that socket\'s locks', () => {
    let st = reducePresence(emptyPresence(), ['join', 's1', 'm1', 'Maya Rodriguez', null, 'p1']);
    st = reducePresence(st, ['join', 's2', 'm2', 'Ana Lopez', null, 'p1']);
    st = reducePresence(st, ['e', 's1', 'ds', ['t1'], 't1']);
    st = reducePresence(st, ['e', 's2', 'ds', ['t2'], 't2']);
    st = reducePresence(st, ['e', 's1', 'dc', ['t1', 't2']]);
    expect(st.locks.has('t1')).toBe(false);
    expect(st.locks.get('t2')).toEqual({ sid: 's2', memberId: 'm2' });
  });
});

describe('lockInfo', () => {
  const base = () => {
    const st = reducePresence(emptyPresence(), ['hi', {
      self: 's1', room: 'p1',
      projects: [['p1', 'Board A'], ['p2', 'Board B']],
      conns: [['s1', 'm1', 'Maya Rodriguez', null, 'p1'], ['s2', 'm2', 'Ana Lopez', null, 'p2']],
      locks: [['t1', 's1', 'm1'], ['t2', 's2', 'm2']],
      drags: [], sel: [], cursors: [], carry: [], viewing: [],
    }]);
    return st;
  };

  test('returns null for a card this tab holds', () => {
    expect(lockInfo(base(), 't1')).toBeNull();
  });

  test('describes another holder and names their board when it is another room', () => {
    const info = lockInfo(base(), 't2');
    expect(info.name).toBe('Ana L.');
    expect(info.board).toBe('Board B');
    expect(info.memberId).toBe('m2');
  });
});

describe('encodeAnchor / decodeAnchor', () => {
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

  test('round-trips a point through a task row', () => {
    const root = document.createElement('div');
    root.getBoundingClientRect = () => rect(0, 0, 1000, 1000);
    const row = document.createElement('div');
    row.setAttribute('data-completion-id', 't1');
    row.getBoundingClientRect = () => rect(100, 50, 200, 100);
    root.appendChild(row);

    const [anchor, fx, fy] = encodeAnchor(root, 200, 100, null);
    expect(anchor).toBe('k:t1');
    expect([fx, fy]).toEqual([500, 500]);
    expect(decodeAnchor(root, anchor, fx, fy)).toEqual({ x: 200, y: 100 });
  });

  test('skips rows being carried and falls back to the board', () => {
    const root = document.createElement('div');
    root.getBoundingClientRect = () => rect(0, 0, 1000, 1000);
    const row = document.createElement('div');
    row.setAttribute('data-completion-id', 't1');
    row.getBoundingClientRect = () => rect(100, 50, 200, 100);
    root.appendChild(row);

    const [anchor] = encodeAnchor(root, 200, 100, new Set(['t1']));
    expect(anchor).toBe('b');
  });
});
