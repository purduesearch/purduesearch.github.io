import { useState, useRef, useEffect, useCallback } from 'react';
import { monthGrid, toYmd, todayYmd, MONTHS_FULL, WEEKDAYS_ABBR } from './meetingPollUtils';

/**
 * when2meet-style multi-date picker: a month grid where clicking a day toggles
 * it, and click-dragging paints a run of days on or off. Past days are disabled.
 *
 * Props:
 *   selected: string[]           YYYY-MM-DD keys currently chosen
 *   onChange: (string[]) => void
 */
export default function MiniMonthCalendar({ selected = [], onChange }) {
  const today = todayYmd();
  // Always open on the current month.
  const [view, setView] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  const selectedSet = new Set(selected);
  const drag = useRef(null); // { mode: 'add' | 'remove' }

  const apply = useCallback((ymd, mode) => {
    const next = new Set(selected);
    if (mode === 'add') next.add(ymd); else next.delete(ymd);
    onChange([...next].sort());
  }, [selected, onChange]);

  useEffect(() => {
    const end = () => { drag.current = null; };
    window.addEventListener('mouseup', end);
    return () => window.removeEventListener('mouseup', end);
  }, []);

  const weeks = monthGrid(view.year, view.month);

  function shiftMonth(delta) {
    setView(v => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  }

  function cellDown(ymd, isSelected) {
    const mode = isSelected ? 'remove' : 'add';
    drag.current = { mode };
    apply(ymd, mode);
  }
  function cellEnter(ymd) {
    if (drag.current) apply(ymd, drag.current.mode);
  }

  return (
    <div className="pm-dpk">
      <div className="pm-dpk-head">
        <button type="button" className="pm-dpk-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <i className="fas fa-chevron-left" />
        </button>
        <span className="pm-dpk-month">{MONTHS_FULL[view.month]} {view.year}</span>
        <button type="button" className="pm-dpk-nav" onClick={() => shiftMonth(1)} aria-label="Next month">
          <i className="fas fa-chevron-right" />
        </button>
      </div>

      <div className="pm-dpk-grid" onDragStart={e => e.preventDefault()}>
        {WEEKDAYS_ABBR.map(w => <div key={w} className="pm-dpk-dow">{w}</div>)}
        {weeks.flat().map((day, i) => {
          if (day == null) return <div key={`pad-${i}`} className="pm-dpk-day pm-dpk-day-pad" />;
          // toYmd expects a 1-indexed month; view.month is 0-indexed.
          const ymd = toYmd(view.year, view.month + 1, day);
          const isSel = selectedSet.has(ymd);
          const isPast = ymd < today;
          const isToday = ymd === today;
          return (
            <button
              key={ymd}
              type="button"
              disabled={isPast}
              className={`pm-dpk-day${isSel ? ' is-sel' : ''}${isToday ? ' is-today' : ''}${isPast ? ' is-past' : ''}`}
              onMouseDown={() => { if (!isPast) cellDown(ymd, isSel); }}
              onMouseEnter={() => { if (!isPast) cellEnter(ymd); }}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="pm-dpk-foot">
        <span>{selected.length} date{selected.length === 1 ? '' : 's'} selected</span>
        {selected.length > 0 && (
          <button type="button" className="cpm-link-btn" onClick={() => onChange([])}>Clear</button>
        )}
      </div>
    </div>
  );
}
