import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MobileSheet from '../MobileSheet';
import { describeRect } from './labScheduleUtils';

const STATE_LABEL = { missing: 'needed', expired: 'expired', pending: 'in review' };

// Confirmation after a rectangle drag. Desktop: a floating card near the
// pointer. Phone: a bottom sheet.
export default function LabShiftPopover({ rect, op, point, defaultEndsOn, overlaps, unmet, busy, compact, onConfirm, onCancel }) {
  const adding = op === 'add';
  const initialEnds = defaultEndsOn && defaultEndsOn >= rect.dates[0] ? defaultEndsOn : '';
  const [scope, setScope] = useState('weekly');
  const [endsOn, setEndsOn] = useState(initialEnds);
  const [buddy, setBuddy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => { setScope('weekly'); setEndsOn(initialEnds); setBuddy(false); }, [rect, initialEnds]);

  useEffect(() => {
    if (compact) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact, onCancel]);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await onConfirm({
        scope,
        endsOn: adding && scope === 'weekly' ? (endsOn || null) : null,
        buddyWanted: adding && buddy,
      });
    } finally {
      inFlight.current = false;
    }
  }

  const body = (
    <div className="pm-lab-pop-body">
      <div className="pm-lab-pop-title">
        <i className={adding ? 'fas fa-plus' : 'fas fa-eraser'} aria-hidden="true" /> {adding ? 'Add' : 'Remove'} · {describeRect(rect)}
      </div>
      <div className="pm-lab-seg" role="radiogroup" aria-label="Repeat">
        <button type="button" role="radio" aria-checked={scope === 'weekly'} className={scope === 'weekly' ? 'is-on' : ''} onClick={() => setScope('weekly')}>
          Every week
        </button>
        <button type="button" role="radio" aria-checked={scope === 'dates'} className={scope === 'dates' ? 'is-on' : ''} onClick={() => setScope('dates')}>
          {adding ? 'Just these days' : 'Just this week'}
        </button>
      </div>
      {adding && scope === 'weekly' && (
        <label className="pm-lab-pop-field">
          <span>Until</span>
          <input type="date" className="cpm-form-input" value={endsOn} min={rect.dates[0]} onChange={e => setEndsOn(e.target.value)} />
          {!endsOn && <small>term end</small>}
        </label>
      )}
      {adding && (
        <label className="pm-lab-buddy-toggle">
          <input type="checkbox" checked={buddy} onChange={e => setBuddy(e.target.checked)} />
          <span><i className="fas fa-user-group" aria-hidden="true" /> Looking for company</span>
          <small>Teammates get a heads-up, and you hear when someone joins.</small>
        </label>
      )}
      {adding && overlaps.length > 0 && (
        <div className="pm-lab-pop-overlap">
          <i className="fas fa-circle" aria-hidden="true" /> You&apos;ll overlap {overlaps.map(o => `${o.name} (${o.days.join(', ')})`).join(', ')}
        </div>
      )}
      {adding && overlaps.length === 0 && (
        <div className="pm-lab-pop-alone"><i className="fas fa-moon" aria-hidden="true" /> No one else here yet this week.</div>
      )}
      {adding && unmet.length > 0 && (
        <div className="pm-lab-pop-warn">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {unmet.map(r => `${r.name} (${STATE_LABEL[r.state] ?? r.state})`).join(', ')} — you can still schedule.
        </div>
      )}
    </div>
  );
  const actions = (
    <div className="pm-lab-pop-actions">
      <button type="button" className="cpm-btn cpm-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className={adding ? 'cpm-btn cpm-btn-primary' : 'cpm-btn pm-lab-btn-danger'} onClick={submit} disabled={busy}>
        {busy ? 'Saving…' : adding ? 'Add' : 'Remove'}
      </button>
    </div>
  );

  if (compact) {
    return (
      <MobileSheet title={adding ? 'Add lab time' : 'Remove lab time'} onClose={onCancel} footer={actions} className="pm-m-calendar-layer">
        {body}
      </MobileSheet>
    );
  }
  const W = 290;
  const left = Math.min(Math.max(12, (point?.clientX ?? 0) + 14), window.innerWidth - W - 12);
  const top = Math.min(Math.max(12, (point?.clientY ?? 0) - 40), window.innerHeight - 380);
  return createPortal(
    <div className="pm-lab-pop" role="dialog" aria-label={adding ? 'Add lab time' : 'Remove lab time'} style={{ left, top, width: W }}>
      {body}
      {actions}
    </div>,
    document.body,
  );
}
