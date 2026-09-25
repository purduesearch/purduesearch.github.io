import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getMyLabVisits, labCheckIn, labCheckOut, labConfirm, labAllocate } from '../../../api/clubPmClient';

// Lab check-in/out on the web (plan decisions 5–9). Rendered by LabScheduleModal
// above the grid; the Slack `/lab` command is the other front door to the same
// endpoints, so this bar always re-reads /lab-visits/me instead of trusting local state.

function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function fmtClock(iso, timeZone) {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone }); }
  catch { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
}

/** "HH:MM" on the visit's (browser-local) check-in day → ISO instant. */
function endIsoFor(visit, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(visit.checkedInAt);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function toastClose(result) {
  if (!result) return;
  if (result.discarded) { toast('Visit was under 5 minutes, so no time was logged.'); return; }
  const parts = (result.allocations ?? []).map(a => `${a.minutes}m → ${a.title}`);
  if (result.unallocatedMinutes > 0) parts.push(`${result.unallocatedMinutes}m not logged to a task yet`);
  toast.success(parts.length ? `Checked out. ${parts.join(' · ')}` : 'Checked out.');
}

export default function LabVisitBar({ space, canSchedule, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editEnd, setEditEnd] = useState('');
  const [pick, setPick] = useState({});   // visitId -> taskId
  const [, setTick] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(() => {
    getMyLabVisits().then(setData).catch(() => setData(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Keep the "Checked in 1h 12m" label moving.
  useEffect(() => {
    if (!data?.open) return undefined;
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, [data?.open]);

  async function run(fn) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fn();
      load();
      onChanged?.();
    } catch (err) {
      toast.error(err?.message ?? 'Something went wrong.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!data || !space) return null;
  const { open, pending = [], unallocated = [], todoTasks = [] } = data;
  const rows = [];

  if (open) {
    const here = open.workspace?.id === space.id;
    rows.push(
      <div key="open" className="pm-lab-visit is-open">
        <i className="fas fa-door-open" aria-hidden="true" />
        <span>
          Checked in {here ? '' : <>at <strong>{open.workspace?.name}</strong> </>}
          <strong>{fmtDuration(Date.now() - new Date(open.checkedInAt).getTime())}</strong>
        </span>
        <button type="button" className="cpm-btn cpm-btn-primary" disabled={busy}
          onClick={() => run(async () => toastClose(await labCheckOut()))}>
          <i className="fas fa-arrow-right-from-bracket" aria-hidden="true" /> Check out
        </button>
      </div>,
    );
  } else if (canSchedule) {
    rows.push(
      <div key="in" className="pm-lab-visit">
        <i className="fas fa-location-dot" aria-hidden="true" />
        <span>In {space.name} now?</span>
        <button type="button" className="cpm-btn cpm-btn-primary" disabled={busy}
          onClick={() => run(async () => {
            const r = await labCheckIn(space.id);
            if (r?.closedPrevious) toastClose(r.closedPrevious);
            toast.success(`Checked in to ${space.name}`);
          })}>
          <i className="fas fa-right-to-bracket" aria-hidden="true" /> Check in here
        </button>
      </div>,
    );
  }

  const p = pending[0];
  if (p) {
    const tz = p.workspace?.timezone;
    rows.push(
      <div key="pending" className="pm-lab-visit is-pending">
        <i className="fas fa-clock-rotate-left" aria-hidden="true" />
        <span>
          We closed your {p.workspace?.name} visit at <strong>{fmtClock(p.checkedOutAt ?? p.checkedInAt, tz)}</strong>.
        </span>
        <button type="button" className="cpm-btn cpm-btn-primary" disabled={busy}
          onClick={() => run(async () => toastClose(await labConfirm()))}>
          Confirm
        </button>
        <label className="pm-lab-visit-time">
          <span className="sr-only">Actual end time</span>
          <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
        </label>
        <button type="button" className="cpm-btn cpm-btn-ghost" disabled={busy || !editEnd}
          onClick={() => run(async () => { toastClose(await labConfirm(endIsoFor(p, editEnd))); setEditEnd(''); })}>
          Change end time
        </button>
      </div>,
    );
  }

  for (const v of unallocated) {
    const taskId = pick[v.id] ?? todoTasks[0]?.id ?? '';
    rows.push(
      <div key={`u-${v.id}`} className="pm-lab-visit is-unallocated">
        <i className="fas fa-hourglass-half" aria-hidden="true" />
        <span><strong>{v.unallocatedMinutes} min</strong> in {v.workspace?.name} not logged to a task</span>
        {todoTasks.length > 0 ? (
          <>
            <select aria-label="Task to log this time to" value={taskId}
              onChange={e => setPick(prev => ({ ...prev, [v.id]: e.target.value }))}>
              {todoTasks.map(t => <option key={t.id} value={t.id}>{t.title} · {t.projectName}</option>)}
            </select>
            <button type="button" className="cpm-btn cpm-btn-primary" disabled={busy || !taskId}
              onClick={() => run(async () => {
                const r = await labAllocate(v.id, taskId);
                toast.success(`Logged ${r.minutes}m to ${r.title}`);
              })}>
              Log
            </button>
          </>
        ) : (
          <span className="pm-lab-visit-note">Pick up a task to log it to.</span>
        )}
      </div>,
    );
  }

  if (!rows.length) return null;
  return <div className="pm-lab-visits" aria-live="polite">{rows}</div>;
}
