import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { buildGrid, fmtDayLabel, fmtTimeLabel, fmtInstant } from './meetingPollUtils';

const norm = (iso) => new Date(iso).toISOString();

// Availability heatmap fill: teal, opacity scaled by how many of the total
// responders are free at a slot.
function heatColor(count, total) {
  if (!count || !total) return 'transparent';
  const t = count / total;
  return `rgba(0, 229, 204, ${(0.14 + 0.86 * t).toFixed(3)})`;
}

/**
 * Reusable when2meet board: editable "your availability" grid + aggregate
 * heatmap + organizer finalize controls. Renders no overlay — the parent
 * (Calendar modal or public page) supplies the container.
 */
export default function MeetingPollBoard({
  poll,
  onClose,
  onSaveAvailability,   // (slots: string[]) => Promise
  onFinalize,           // (startIso, endIso) => Promise
  onRemind,             // () => Promise
  onEdit,               // () => void
  onDelete,             // () => Promise
  onDownloadIcs,        // () => void
  googleUrl,            // string | null
  guestName,            // when responding as guest
}) {
  const tz = poll.timezone || 'America/New_York';
  const perms = poll.permissions ?? {};
  const canRespond = perms.canRespond ?? false;
  const canManage  = perms.canManage ?? false;
  const status = poll.status;
  const agg = poll.aggregate ?? { counts: {}, perSlot: {}, bestSlotStarts: [], maxCount: 0, totalResponders: 0 };
  const total = agg.totalResponders ?? 0;
  const bestSet = useMemo(() => new Set((agg.bestSlotStarts ?? []).map(norm)), [agg.bestSlotStarts]);

  const grid = useMemo(() => buildGrid(poll.slotStarts ?? [], tz), [poll.slotStarts, tz]);

  // My selection (editable left grid).
  const [selected, setSelected] = useState(() => new Set((poll.myResponse?.slots ?? []).map(norm)));
  const baselineRef = useRef(new Set((poll.myResponse?.slots ?? []).map(norm)));
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Re-sync when the poll's own myResponse changes (e.g. after refetch).
  useEffect(() => {
    const next = new Set((poll.myResponse?.slots ?? []).map(norm));
    baselineRef.current = next;
    setSelected(next);
  }, [poll.myResponse]);

  const [dragging, setDragging] = useState(null); // { mode: 'add' | 'remove' }
  const draggingRef = useRef(null);
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [hoverSlot, setHoverSlot] = useState(null);
  const [copied, setCopied] = useState(false);
  const [finalizeMode, setFinalizeMode] = useState(false);
  const [finalizeSlot, setFinalizeSlot] = useState(null);

  const applyCell = useCallback((iso, mode) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (mode === 'add') next.add(iso); else next.delete(iso);
      return next;
    });
  }, []);

  const doSave = useCallback(async () => {
    const cur = selectedRef.current;
    const base = baselineRef.current;
    const changed = cur.size !== base.size || [...cur].some(x => !base.has(x));
    if (!changed) return;
    setSaving(true);
    try {
      await onSaveAvailability([...cur]);
      baselineRef.current = new Set(cur);
    } finally {
      setSaving(false);
    }
  }, [onSaveAvailability]);

  // End a drag on mouseup anywhere → persist.
  useEffect(() => {
    function up() {
      if (draggingRef.current) {
        setDragging(null);
        doSave();
      }
    }
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [doSave]);

  function cellDown(iso) {
    if (!canRespond || status !== 'OPEN') return;
    const mode = selected.has(iso) ? 'remove' : 'add';
    setDragging({ mode });
    applyCell(iso, mode);
  }
  function cellEnter(iso) {
    if (dragging) applyCell(iso, dragging.mode);
  }

  async function run(key, fn) {
    setBusy(key);
    try { await fn(); } finally { setBusy(''); }
  }

  function copyLink() {
    if (!poll.shareUrl) return;
    navigator.clipboard?.writeText(poll.shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }

  const finalCount = finalizeSlot ? (agg.counts[norm(finalizeSlot)] ?? 0) : 0;
  const organizerName = poll.organizer?.displayName ?? poll.organizerName ?? null;
  const projectName   = poll.project?.name ?? poll.projectName ?? null;

  const hoverAvailable = hoverSlot ? (agg.perSlot[norm(hoverSlot)] ?? []) : [];
  const hoverNames = hoverSlot
    ? (poll.responders ?? []).map(r => r.name)
    : [];
  const hoverMissing = hoverSlot
    ? hoverNames.filter(n => !hoverAvailable.includes(n))
    : [];

  return (
    <div className="pm-poll-board">
      {/* Header */}
      <div className="pm-poll-board-head">
        <div style={{ minWidth: 0 }}>
          <div className="pm-poll-board-title">
            <span className={`pm-poll-status pm-poll-status-${status?.toLowerCase()}`}>{status}</span>
            {poll.title}
          </div>
          <div className="pm-poll-board-sub">
            {organizerName && <span><i className="fas fa-user" /> {organizerName}</span>}
            {projectName && <span><i className="fas fa-diagram-project" /> {projectName}</span>}
            <span><i className="fas fa-users" /> {total} responded</span>
            <span><i className="fas fa-clock" /> {tz}</span>
          </div>
        </div>
        {onClose && (
          <button type="button" className="cpm-icon-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" />
          </button>
        )}
      </div>

      {poll.description && <p className="pm-poll-board-desc">{poll.description}</p>}

      {(poll.priorityTasks?.length > 0) && (
        <div className="pm-poll-tasks">
          <span className="pm-poll-tasks-label">Priority tasks:</span>
          {poll.priorityTasks.map(t => <span key={t.id} className="pm-poll-task-chip">{t.title}</span>)}
        </div>
      )}

      {/* Toolbar */}
      <div className="pm-poll-toolbar">
        {poll.shareUrl && (
          <button type="button" className="cpm-btn cpm-btn-ghost" onClick={copyLink}>
            <i className={copied ? 'fas fa-check' : 'fas fa-link'} /> {copied ? 'Copied!' : 'Copy link'}
          </button>
        )}
        {canManage && status === 'OPEN' && (
          <>
            <button type="button" className="cpm-btn cpm-btn-ghost" disabled={busy === 'remind'}
              onClick={() => run('remind', onRemind)}>
              <i className="fas fa-bell" /> Remind non-responders
            </button>
            <button type="button" className="cpm-btn cpm-btn-ghost" onClick={onEdit}>
              <i className="fas fa-pen" /> Edit
            </button>
            <button type="button"
              className={`cpm-btn ${finalizeMode ? 'cpm-btn-primary' : 'cpm-btn-ghost'}`}
              onClick={() => { setFinalizeMode(m => !m); setFinalizeSlot(null); }}>
              <i className="fas fa-circle-check" /> {finalizeMode ? 'Pick a slot below…' : 'Finalize a time'}
            </button>
          </>
        )}
        {canManage && (
          <button type="button" className="cpm-btn cpm-btn-ghost pm-poll-danger" disabled={busy === 'delete'}
            onClick={() => run('delete', onDelete)}>
            <i className="fas fa-trash" /> Delete
          </button>
        )}
      </div>

      {/* Finalized banner */}
      {status === 'FINALIZED' && poll.finalStart && (
        <div className="pm-poll-final-banner">
          <div>
            <i className="fas fa-circle-check" /> Scheduled for <strong>{fmtInstant(poll.finalStart, tz)}</strong>
          </div>
          <div className="pm-poll-final-actions">
            {onDownloadIcs && (
              <button type="button" className="cpm-btn cpm-btn-ghost" onClick={onDownloadIcs}>
                <i className="fas fa-calendar-plus" /> .ics
              </button>
            )}
            {googleUrl && (
              <a className="cpm-btn cpm-btn-ghost" href={googleUrl} target="_blank" rel="noreferrer">
                <i className="fab fa-google" /> Google Calendar
              </a>
            )}
          </div>
        </div>
      )}

      {/* Finalize confirm bar */}
      {finalizeMode && finalizeSlot && (
        <div className="pm-poll-finalize-bar">
          <span>Schedule <strong>{fmtInstant(finalizeSlot, tz)}</strong> — {finalCount} available</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="cpm-btn cpm-btn-ghost" onClick={() => setFinalizeSlot(null)}>Cancel</button>
            <button type="button" className="cpm-btn cpm-btn-primary" disabled={busy === 'finalize'}
              onClick={() => run('finalize', async () => {
                const start = new Date(finalizeSlot);
                const end = new Date(start.getTime() + (poll.slotMinutes ?? 30) * 60000);
                await onFinalize(start.toISOString(), end.toISOString());
                setFinalizeMode(false); setFinalizeSlot(null);
              })}>
              <i className="fas fa-check" /> Schedule meeting
            </button>
          </div>
        </div>
      )}

      {/* Grids */}
      <div className="pm-poll-grids">
        {/* Your availability (editable) */}
        {status === 'OPEN' && canRespond && (
          <div className="pm-poll-grid-col">
            <div className="pm-poll-grid-heading">
              <i className="fas fa-hand-pointer" /> Your availability
              {saving && <span className="pm-poll-saving"><i className="fas fa-spinner fa-spin" /> saving</span>}
              {guestName && <span className="pm-poll-guest-tag">as {guestName}</span>}
            </div>
            <GridTable
              grid={grid}
              renderCell={(iso) => {
                const on = selected.has(norm(iso));
                return (
                  <td key={iso}
                    className={`pm-poll-cell pm-poll-cell-mine ${on ? 'is-on' : ''}`}
                    onMouseDown={() => cellDown(iso)}
                    onMouseEnter={() => cellEnter(iso)}
                  />
                );
              }}
            />
          </div>
        )}

        {/* Group heatmap */}
        <div className="pm-poll-grid-col">
          <div className="pm-poll-grid-heading">
            <i className="fas fa-fire" /> Group availability
            <span className="pm-poll-legend">
              <span className="pm-poll-legend-swatch" style={{ background: heatColor(1, 4) }} /> few
              <span className="pm-poll-legend-swatch" style={{ background: heatColor(4, 4) }} /> all
            </span>
          </div>
          <GridTable
            grid={grid}
            renderCell={(iso) => {
              const key = norm(iso);
              const count = agg.counts[key] ?? 0;
              const best = bestSet.has(key);
              const clickable = finalizeMode && canManage;
              const names = agg.perSlot[key] ?? [];
              return (
                <td key={iso}
                  className={`pm-poll-cell pm-poll-cell-heat ${best ? 'is-best' : ''} ${clickable ? 'is-clickable' : ''} ${finalizeSlot && norm(finalizeSlot) === key ? 'is-picked' : ''}`}
                  style={{ background: heatColor(count, total) }}
                  title={`${fmtInstant(iso, tz)}\n${count}/${total} available${names.length ? `: ${names.join(', ')}` : ''}`}
                  onMouseEnter={() => setHoverSlot(iso)}
                  onMouseLeave={() => setHoverSlot(prev => (prev === iso ? null : prev))}
                  onClick={() => { if (clickable) setFinalizeSlot(iso); }}
                >
                  {count > 0 && <span className="pm-poll-cell-count">{count}</span>}
                </td>
              );
            }}
          />
        </div>
      </div>

      {/* Hover detail */}
      {hoverSlot && total > 0 && (
        <div className="pm-poll-hover-detail">
          <strong>{fmtInstant(hoverSlot, tz)}</strong>
          <div className="pm-poll-hover-cols">
            <div>
              <span className="pm-poll-hover-h pm-poll-hover-yes">Available ({hoverAvailable.length})</span>
              {hoverAvailable.map(n => <span key={n} className="pm-poll-name yes">{n}</span>)}
            </div>
            {hoverMissing.length > 0 && (
              <div>
                <span className="pm-poll-hover-h pm-poll-hover-no">Not available</span>
                {hoverMissing.map(n => <span key={n} className="pm-poll-name no">{n}</span>)}
              </div>
            )}
          </div>
        </div>
      )}

      {!canRespond && status === 'OPEN' && (
        <p className="pm-poll-hint" style={{ marginTop: 12 }}>
          <i className="fas fa-lock" /> You can view this poll but aren't permitted to submit availability.
        </p>
      )}
    </div>
  );
}

// Shared day × time table. `renderCell(iso)` returns a <td> for a real slot.
function GridTable({ grid, renderCell }) {
  return (
    <div className="pm-poll-grid-scroll">
      <table className="pm-poll-grid-table">
        <thead>
          <tr>
            <th className="pm-poll-timecol" />
            {grid.days.map(d => <th key={d} className="pm-poll-dayhead">{fmtDayLabel(d)}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.times.map(hm => (
            <tr key={hm}>
              <td className="pm-poll-timecol">{fmtTimeLabel(hm)}</td>
              {grid.days.map(d => {
                const iso = grid.slotAt.get(`${d} ${hm}`);
                if (!iso) return <td key={`${d}-${hm}`} className="pm-poll-cell pm-poll-cell-empty" />;
                return renderCell(iso);
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
