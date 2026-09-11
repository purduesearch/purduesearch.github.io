import { useMemo } from 'react';
import { buildMonthGrid, monthLabel, formatDayKey, typeConfig, PUBLIC_EVENT_TYPES } from '../../lib/publicEvents';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function PublicEventsMonthGrid({
  month, canPrev, canNext, onPrev, onNext, eventsByDay, selectedKey, onSelectDay, todayKey,
}) {
  const cells = useMemo(() => buildMonthGrid(month.year, month.month), [month]);

  return (
    <div className="home-events-grid-wrap">
      <div className="home-events-grid-head">
        <button type="button" className="home-events-nav" onClick={onPrev} disabled={!canPrev} aria-label="Previous month">
          <i className="fas fa-chevron-left" aria-hidden="true" />
        </button>
        <h3 className="home-events-grid-title" aria-live="polite">{monthLabel(month)}</h3>
        <button type="button" className="home-events-nav" onClick={onNext} disabled={!canNext} aria-label="Next month">
          <i className="fas fa-chevron-right" aria-hidden="true" />
        </button>
      </div>

      <div className="home-events-grid">
        {WEEKDAYS.map((d, i) => (
          <span key={WEEKDAY_NAMES[i]} className="home-events-weekday" aria-hidden="true">{d}</span>
        ))}
        {cells.map(cell => {
          const dayEvents = eventsByDay.get(cell.key) ?? [];
          const classes = [
            'home-events-day',
            cell.inMonth ? '' : 'home-events-day--out',
            cell.key === todayKey ? 'home-events-day--today' : '',
          ].filter(Boolean).join(' ');

          if (dayEvents.length === 0) {
            return (
              <span key={cell.key} className={classes}>
                <span className="home-events-day-num">{cell.day}</span>
              </span>
            );
          }

          const colors = [...new Set(dayEvents.map(ev => typeConfig(ev.type).color))].slice(0, 3);
          const count = dayEvents.length;
          return (
            <button
              key={cell.key}
              type="button"
              className={classes}
              aria-pressed={selectedKey === cell.key}
              aria-label={`${formatDayKey(cell.key)}: ${count} event${count === 1 ? '' : 's'}`}
              onClick={() => onSelectDay(selectedKey === cell.key ? null : cell.key)}
            >
              <span className="home-events-day-num">{cell.day}</span>
              <span className="home-events-dots" aria-hidden="true">
                {colors.map(c => <span key={c} className="home-events-dot" style={{ background: c }} />)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="home-events-legend" aria-hidden="true">
        {Object.entries(PUBLIC_EVENT_TYPES).map(([key, cfg]) => (
          <span key={key}><span className="home-events-dot" style={{ background: cfg.color }} />{cfg.plural}</span>
        ))}
      </div>
    </div>
  );
}
