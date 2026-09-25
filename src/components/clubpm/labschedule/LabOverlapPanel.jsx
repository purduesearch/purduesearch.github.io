import LabAvatar from './LabAvatar';
import { dayHeader, fmtRange } from './labScheduleUtils';

const firstName = (m) => m?.displayName?.split(' ')[0] ?? 'Someone';

// Overlap finder side panel: pick people, set the "at least N" threshold, and
// pick one of the ranked shared windows.
export default function LabOverlapPanel({
  people, meId, chosenIds, onToggle, minCount, maxCount, onMinCount, windows, selection, onSelect, membersById,
}) {
  const same = (w) => selection && w.date === selection.date && w.startMin === selection.startMin && w.endMin === selection.endMin;
  return (
    <aside className="pm-lab-overlap" aria-label="Find overlap">
      <h3><i className="fas fa-people-arrows" aria-hidden="true" /> Find overlap</h3>

      <div className="pm-lab-overlap-people" role="group" aria-label="People">
        {people.map(p => {
          const on = chosenIds.has(p.id);
          return (
            <button key={p.id} type="button" aria-pressed={on}
              className={`pm-lab-overlap-chip${on ? ' is-on' : ''}`} onClick={() => onToggle(p.id)}>
              <LabAvatar member={p} size={20} />
              {p.id === meId ? 'You' : firstName(p)}
            </button>
          );
        })}
      </div>

      {maxCount >= 3 && (
        <div className="pm-lab-overlap-min">
          <span>At least</span>
          <button type="button" className="cpm-icon-btn" aria-label="Fewer people"
            disabled={minCount <= 2} onClick={() => onMinCount(minCount - 1)}>
            <i className="fas fa-minus" aria-hidden="true" />
          </button>
          <strong aria-live="polite">{minCount}</strong>
          <button type="button" className="cpm-icon-btn" aria-label="More people"
            disabled={minCount >= maxCount} onClick={() => onMinCount(minCount + 1)}>
            <i className="fas fa-plus" aria-hidden="true" />
          </button>
          <span>of {maxCount}</span>
        </div>
      )}

      {chosenIds.size < 2 ? (
        <p className="pm-lab-overlap-empty">Pick at least two people.</p>
      ) : windows.length === 0 ? (
        <p className="pm-lab-overlap-empty">
          <strong>No shared lab time this week.</strong> Try another week, or lower the number of people.
        </p>
      ) : (
        <ul className="pm-lab-overlap-list">
          {windows.slice(0, 10).map(w => {
            const d = dayHeader(w.date);
            const names = w.memberIds.map(id => (id === meId ? 'You' : firstName(membersById.get(id)))).join(', ');
            return (
              <li key={`${w.date}|${w.startMin}|${w.memberIds.join(',')}`}>
                <button type="button" className={`pm-lab-overlap-row${same(w) ? ' is-selected' : ''}`}
                  onClick={(e) => onSelect(w, e.currentTarget.getBoundingClientRect())}>
                  <span className="pm-lab-overlap-when">
                    {d.dow} {fmtRange(w.startMin, w.endMin)}
                    {w.weekly && <span className="pm-lab-overlap-weekly">weekly</span>}
                  </span>
                  <span className="pm-lab-overlap-names">{names}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
