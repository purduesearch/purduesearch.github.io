import { useMemo, useRef, useState } from 'react';
import useRectMarquee from '../../../hooks/useRectMarquee';
import LabAvatar from './LabAvatar';
import {
  ROW_PX, SLOT, rowStarts, blockBox, heatLevel, dayHeader, fmtMin, fmtMinShort, fmtRange,
  cellKey, ownCells, othersHeat, rectFromIndices, collapsedDays, todayInZone,
} from './labScheduleUtils';

// Week grid for one lab space.
//  - Everyone: merged presence blocks (avatar stack, depth = headcount, amber =
//    solo, coral ring = over capacity) plus violet event bands.
//  - Edit: 30-minute cells; drag a rectangle (useRectMarquee). Starting on your
//    own time erases instead of adds. Release hands the rectangle to onRect.
//  - Overlap: blocks dimmed; each shared window from the overlap finder is a
//    button that hands (window, rect) to onWindowClick.
//  - Coverage (admins, Everyone mode): striped bands over solo / untrained gaps.
const COVERAGE_TEXT = {
  solo: 'someone is scheduled alone',
  untrained: 'nobody present has every requirement',
};

export default function LabWeekGrid({
  week, meId, mode, canEdit, pending, onRect, onBlockClick, membersById,
  overlapWindows = [], selection = null, onWindowClick, coverage = null,
}) {
  const { workspace, dates, blocks, events, occurrences } = week;
  const rows = useMemo(() => rowStarts(workspace.openStartMin, workspace.openEndMin), [workspace.openStartMin, workspace.openEndMin]);
  const editing = mode === 'edit' && canEdit;
  const overlapping = mode === 'overlap';
  const collapsed = useMemo(() => (editing ? new Set() : collapsedDays(dates, blocks, events)), [editing, dates, blocks, events]);
  const mine = useMemo(() => ownCells(occurrences, meId), [occurrences, meId]);
  const heat = useMemo(() => othersHeat(occurrences, meId), [occurrences, meId]);
  const today = todayInZone(workspace.timezone);
  const height = rows.length * ROW_PX;

  const opRef = useRef('add');
  const [live, setLive] = useState(null);
  const begin = useRectMarquee({
    onChange: (r) => setLive(r ? { ...r, op: opRef.current } : null),
    onEnd: (r, info) => {
      setLive(null);
      if (!info.cancelled) onRect(rectFromIndices(r, dates, rows), opRef.current, info);
    },
  });

  function cellDown(e, di, ti, key) {
    e.preventDefault();
    opRef.current = mine.has(key) ? 'erase' : 'add';
    begin(di, ti, e);
  }

  function selectionOp(date, di, min, ti) {
    if (live) return di >= live.d0 && di <= live.d1 && ti >= live.t0 && ti <= live.t1 ? live.op : null;
    if (pending && pending.rect.dates.includes(date) && min >= pending.rect.startMin && min < pending.rect.endMin) return pending.op;
    return null;
  }

  const cols = `52px ${dates.map((_, i) => (collapsed.has(i) ? '28px' : 'minmax(0, 1fr)')).join(' ')}`;
  const hourLines = rows.filter(m => m % 60 === 0);

  function renderCells(date, di) {
    return rows.map((m, ti) => {
      const key = cellKey(date, m);
      const own = mine.has(key);
      const sel = selectionOp(date, di, m, ti);
      const cls = [
        'pm-lab-cell', `pm-lab-heat-${heatLevel(heat.get(key) ?? 0)}`,
        own && 'is-mine', m % 60 === 0 && 'is-hour',
        sel && `is-sel is-sel-${sel}`, pending?.saving && sel && 'is-saving',
      ].filter(Boolean).join(' ');
      return (
        <div key={m} className={cls} data-mq="1" data-di={di} data-ti={ti}
          aria-label={`${dayHeader(date).dow} ${fmtMin(m)}${own ? ', your time' : ''}`}
          onPointerDown={(e) => cellDown(e, di, ti, key)} />
      );
    });
  }

  function renderBlocks(date) {
    const dayEvents = events.filter(ev => ev.date === date);
    const right = dayEvents.length ? '38%' : '4px';
    return (
      <>
        {hourLines.map(m => (
          <div key={`h${m}`} className="pm-lab-hour-line" style={{ top: ((m - workspace.openStartMin) / SLOT) * ROW_PX }} />
        ))}
        {blocks.filter(b => b.date === date).map(b => {
          const { top, height: h } = blockBox(b.startMin, b.endMin, workspace.openStartMin);
          const n = b.memberIds.length;
          const over = workspace.capacity && n > workspace.capacity;
          const soloName = membersById.get(b.memberIds[0])?.displayName?.split(' ')[0] ?? 'Someone';
          const label = b.solo ? (b.memberIds[0] === meId ? 'Just you' : `${soloName} alone`) : `${n} here`;
          const cls = ['pm-lab-block', `pm-lab-heat-${heatLevel(n)}`, b.solo && 'is-solo', over && 'is-over', b.memberIds.includes(meId) && 'is-with-me']
            .filter(Boolean).join(' ');
          return (
            <button key={`${b.startMin}-${b.endMin}`} type="button" className={cls} style={{ top, height: h, right }}
              aria-label={`${fmtRange(b.startMin, b.endMin)}: ${n === 0 ? 'event' : `${n} ${n === 1 ? 'person' : 'people'}`}`}
              onClick={(e) => onBlockClick(b, e.currentTarget.getBoundingClientRect())}>
              {n > 0 && (
                <span className="pm-lab-avatars">
                  {b.memberIds.slice(0, 4).map(id => <LabAvatar key={id} member={membersById.get(id)} />)}
                  {n > 4 && <span className="pm-lab-avatar-more">+{n - 4}</span>}
                </span>
              )}
              {h >= 40 && n > 0 && <span className="pm-lab-block-label">{label}</span>}
              {h >= 62 && <span className="pm-lab-block-time">{fmtRange(b.startMin, b.endMin)}</span>}
              {b.buddyMemberIds.length > 0 && h >= 40 && (
                <span className="pm-lab-buddy-tag"><i className="fas fa-user-group" aria-hidden="true" /> wants company</span>
              )}
            </button>
          );
        })}
        {overlapping && overlapWindows.filter(w => w.date === date).map(w => {
          const { top, height: h } = blockBox(w.startMin, w.endMin, workspace.openStartMin);
          const selected = selection && selection.date === w.date && selection.startMin === w.startMin && selection.endMin === w.endMin;
          const cls = ['pm-lab-overlap-win', w.weekly && 'is-weekly', selected && 'is-selected'].filter(Boolean).join(' ');
          return (
            <button key={`w${w.startMin}-${w.memberIds.join(',')}`} type="button" className={cls} style={{ top, height: h }}
              aria-pressed={!!selected}
              aria-label={`${fmtRange(w.startMin, w.endMin)}: ${w.memberIds.length} of you overlap${w.weekly ? ', weekly' : ''}`}
              onClick={(e) => onWindowClick?.(w, e.currentTarget.getBoundingClientRect())}>
              {h >= 22 && <span>{w.memberIds.length} overlap</span>}
              {h >= 40 && <span className="pm-lab-block-time">{fmtRange(w.startMin, w.endMin)}</span>}
            </button>
          );
        })}
        {mode === 'everyone' && coverage?.filter(g => g.date === date).map(g => {
          const { top, height: h } = blockBox(g.startMin, g.endMin, workspace.openStartMin);
          const text = `${fmtRange(g.startMin, g.endMin)}: ${COVERAGE_TEXT[g.kind]}`;
          return (
            <div key={`c${g.startMin}-${g.kind}`} className={`pm-lab-coverage is-${g.kind}`} style={{ top, height: h }}>
              <span className="pm-lab-coverage-tab" title={text} role="img" aria-label={text} />
            </div>
          );
        })}
        {dayEvents.map(ev => {
          const { top, height: h } = blockBox(ev.startMin, ev.endMin, workspace.openStartMin);
          return (
            <div key={ev.eventId} className="pm-lab-event" style={{ top, height: h }} title={ev.title}>
              <span className="pm-lab-event-title"><i className="fas fa-flask" aria-hidden="true" /> {ev.title}</span>
              {h >= 40 && <span className="pm-lab-block-time">{fmtRange(ev.startMin, ev.endMin)} · {ev.attendeeIds.length} going</span>}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className={`pm-lab-grid${editing ? ' is-editing' : ''}`} style={{ '--pm-lab-row': `${ROW_PX}px` }}>
      <div className="pm-lab-grid-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {dates.map((d, i) => {
          const h = dayHeader(d);
          return (
            <div key={d} className={`pm-lab-day-head${d === today ? ' is-today' : ''}${collapsed.has(i) ? ' is-collapsed' : ''}`}>
              <span className="pm-lab-dow">{collapsed.has(i) ? h.dow[0] : h.dow}</span>
              {!collapsed.has(i) && <span className="pm-lab-dom">{h.dom}</span>}
            </div>
          );
        })}
      </div>
      <div className="pm-lab-grid-body" style={{ gridTemplateColumns: cols }}>
        <div className="pm-lab-gutter" style={{ height }}>
          {hourLines.map(m => (
            <span key={m} className="pm-lab-gutter-label" style={{ top: ((m - workspace.openStartMin) / SLOT) * ROW_PX }}>{fmtMinShort(m)}</span>
          ))}
        </div>
        {dates.map((d, di) => (
          <div key={d} className={`pm-lab-col${collapsed.has(di) ? ' is-collapsed' : ''}${overlapping ? ' is-overlap-dim' : ''}`} style={{ height }}>
            {editing ? renderCells(d, di) : !collapsed.has(di) && renderBlocks(d)}
          </div>
        ))}
      </div>
    </div>
  );
}
