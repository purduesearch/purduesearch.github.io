import { Link } from 'react-router-dom';
import { weekLabel } from './labScheduleUtils';

const REQ_ICON = {
  ok: 'fas fa-circle-check', pending: 'fas fa-hourglass-half',
  expired: 'fas fa-clock-rotate-left', missing: 'fas fa-triangle-exclamation',
};
const REQ_LABEL = { ok: 'Done', pending: 'In review', expired: 'Expired', missing: 'Needed' };

function RequirementChip({ req, state }) {
  const inner = (
    <>
      <i className={REQ_ICON[state]} aria-hidden="true" /> {req.name}
      <span className="pm-lab-req-state">{REQ_LABEL[state]}</span>
    </>
  );
  const cls = `pm-lab-req pm-lab-req--${state}`;
  if (req.url?.startsWith('/')) return <Link className={cls} to={req.url}>{inner}</Link>;
  if (req.url) return <a className={cls} href={req.url} target="_blank" rel="noreferrer">{inner}</a>;
  return <span className={cls}>{inner}</span>;
}

export default function LabSpaceHeader({ spaces, spaceId, onSpace, dates, onWeek, mode, onMode, canSchedule, space, myStatus }) {
  return (
    <div className="pm-lab-head">
      <div className="pm-lab-spaces" role="tablist" aria-label="Lab spaces">
        {spaces.map(s => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === spaceId}
            className={`pm-lab-space-pill${s.id === spaceId ? ' is-on' : ''}`}
            style={{ '--pm-lab-space': s.color }} onClick={() => onSpace(s.id)}>
            <span className="pm-lab-space-dot" aria-hidden="true" />
            {s.name}
          </button>
        ))}
      </div>

      <div className="pm-lab-toolbar">
        <div className="pm-lab-weeknav">
          <button type="button" className="cpm-icon-btn" onClick={() => onWeek(-1)} aria-label="Previous week">
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>
          <button type="button" className="cpm-btn cpm-btn-ghost" onClick={() => onWeek(0)}>Today</button>
          <button type="button" className="cpm-icon-btn" onClick={() => onWeek(1)} aria-label="Next week">
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
          {dates && <span className="pm-lab-weeklabel">{weekLabel(dates)}</span>}
        </div>
        {canSchedule ? (
          <div className="pm-lab-mode" role="radiogroup" aria-label="View">
            <button type="button" role="radio" aria-checked={mode === 'everyone'} className={mode === 'everyone' ? 'is-on' : ''} onClick={() => onMode('everyone')}>
              <i className="fas fa-users" aria-hidden="true" /> Everyone
            </button>
            <button type="button" role="radio" aria-checked={mode === 'edit'} className={mode === 'edit' ? 'is-on' : ''} onClick={() => onMode('edit')}>
              <i className="fas fa-pen" aria-hidden="true" /> Edit my time
            </button>
          </div>
        ) : space && dates && (
          <span className="pm-lab-viewonly">
            <i className="fas fa-eye" aria-hidden="true" /> View only — ask an admin to assign this space to your project
          </span>
        )}
      </div>

      {space && (
        <div className="pm-lab-info">
          {space.location && <span><i className="fas fa-location-dot" aria-hidden="true" /> {space.location}</span>}
          {space.capacity && <span><i className="fas fa-user-group" aria-hidden="true" /> Up to {space.capacity}</span>}
          {space.requirements.map(r => <RequirementChip key={r.id} req={r} state={myStatus?.[r.id] ?? 'missing'} />)}
          {space.description && <span className="pm-lab-desc">{space.description}</span>}
        </div>
      )}
    </div>
  );
}
