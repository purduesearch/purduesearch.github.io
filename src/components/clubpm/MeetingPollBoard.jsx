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

// Small avatar (image or initial fallback).
function AvatarBit({ name, url, guest, size = 24 }) {
  return (
    <span className="pm-poll-avatar" title={guest ? `${name} (guest)` : name} style={{ width: size, height: size }}>
      {url
        ? <img src={url} alt="" />
        : <span className="pm-poll-avatar-initial">{(name ?? '?')[0].toUpperCase()}</span>}
      {guest && <span className="pm-poll-avatar-guest"><i className="fas fa-user" /></span>}
    </span>
  );
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
  suggestion,           // { slots: string[], sampleSize, summary } | null
}) {
  const tz = poll.timezone || 'America/New_York';
  const perms = poll.permissions ?? {};
  const canRespond = perms.canRespond ?? false;
  const canManage  = perms.canManage ?? false;
  const status = poll.status;
  const agg = poll.aggregate ?? { counts: {}, perSlot: {}, bestSlotStarts: [], maxCount: 0, totalResponders: 0 };
  const total = agg.totalResponders ?? 0;
  const bestSet = useMemo(() => new Set((agg.bestSlotStarts ?? []).map(norm)), [agg.bestSlotStarts]);
  const respByName = useMemo(() => {
    const m = new Map();
    for (const r of (poll.responders ?? [])) if (!m.has(r.name)) m.set(r.name, r);
    return m;
  }, [poll.responders]);

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

  // Rectangle-marquee drag: anchor cell + a snapshot of the selection at drag
  // start; the live rectangle from the anchor to the pointer is added/removed
  // on top of that snapshot.
  const dragRef = useRef(null); // { anchorDi, anchorTi, mode, baseline: Set }

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [hoverSlot, setHoverSlot] = useState(null);
  // Touch has no hover, so a tapped slot is "pinned" open instead.
  const [pinnedSlot, setPinnedSlot] = useState(null);
  const [copied, setCopied] = useState(false);
  const [finalizeMode, setFinalizeMode] = useState(false);
  const [finalizeSlot, setFinalizeSlot] = useState(null);
  const [ghostDismissed, setGhostDismissed] = useState(false);

  const detailSlot = pinnedSlot ?? hoverSlot;

  // The two grids are separate scrolling tables; mirror them so a sideways drag
  // can never leave "your availability" and the heatmap showing different days.
  const mineScrollRef = useRef(null);
  const heatScrollRef = useRef(null);
  const syncingRef = useRef(false);
  const syncScroll = useCallback((fromRef, toRef) => {
    if (syncingRef.current) return;
    const from = fromRef.current;
    const to = toRef.current;
    if (!from || !to || from.scrollLeft === to.scrollLeft) return;
    syncingRef.current = true;
    to.scrollLeft = from.scrollLeft;
    // Release after the mirrored element has fired its own scroll event.
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  // All real slot keys inside the rectangle spanning two (day,time) cells.
  const rectIsos = useCallback((di1, ti1, di2, ti2) => {
    const d0 = Math.min(di1, di2), d1 = Math.max(di1, di2);
    const t0 = Math.min(ti1, ti2), t1 = Math.max(ti1, ti2);
    const out = [];
    for (let d = d0; d <= d1; d++) {
      for (let t = t0; t <= t1; t++) {
        const iso = grid.slotAt.get(`${grid.days[d]} ${grid.times[t]}`);
        if (iso) out.push(norm(iso));
      }
    }
    return out;
  }, [grid]);

  // Preview the current rectangle over the drag-start snapshot.
  const applyRect = useCallback((di, ti) => {
    const dr = dragRef.current;
    if (!dr) return;
    const isos = rectIsos(dr.anchorDi, dr.anchorTi, di, ti);
    const next = new Set(dr.baseline);
    if (dr.mode === 'add') for (const k of isos) next.add(k);
    else for (const k of isos) next.delete(k);
    setSelected(next);
  }, [rectIsos]);

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

  // Unified pointer marquee (mouse + touch). While dragging, the cell under the
  // pointer is resolved via elementFromPoint so touch-drag works, and the whole
  // rectangle from the anchor to it is selected.
  useEffect(() => {
    function move(e) {
      if (!dragRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.getAttribute('data-mine') !== '1') return;
      const di = Number(el.getAttribute('data-di'));
      const ti = Number(el.getAttribute('data-ti'));
      if (Number.isNaN(di) || Number.isNaN(ti)) return;
      applyRect(di, ti);
    }
    function up() {
      if (dragRef.current) { dragRef.current = null; doSave(); }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [applyRect, doSave]);

  function cellDown(di, ti, key) {
    if (!canRespond || status !== 'OPEN') return;
    setGhostDismissed(true);
    const mode = selectedRef.current.has(key) ? 'remove' : 'add';
    dragRef.current = { anchorDi: di, anchorTi: ti, mode, baseline: new Set(selectedRef.current) };
    applyRect(di, ti);
  }

  // ── Suggested availability ─────────────────────────────────
  // Suggested slots render as a dashed "ghost" over the editable grid. Nothing
  // is stored until the member accepts; the ghost clears on accept or on the
  // first grid click, since from then on the selection is theirs.
  const suggestedSet = useMemo(
    () => new Set((suggestion?.slots ?? []).map(norm)),
    [suggestion]
  );
  const hasSavedResponse = (poll.myResponse?.slots?.length ?? 0) > 0;
  const showGhost =
    !ghostDismissed &&
    suggestedSet.size > 0 &&
    status === 'OPEN' &&
    canRespond &&
    !hasSavedResponse;

  useEffect(() => { setGhostDismissed(false); }, [poll.id]);

  async function useSuggestion() {
    const next = new Set(suggestedSet);
    setSelected(next);
    selectedRef.current = next;
    setGhostDismissed(true);
    setSaving(true);
    try {
      await onSaveAvailability([...next]);
      baselineRef.current = new Set(next);
    } finally {
      setSaving(false);
    }
  }

  async function clearMine() {
    const empty = new Set();
    setSelected(empty);
    selectedRef.current = empty;
    setSaving(true);
    try { await onSaveAvailability([]); baselineRef.current = empty; }
    finally { setSaving(false); }
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

  function toggleFinalize() {
    setFinalizeMode(m => {
      const nm = !m;
      setFinalizeSlot(nm ? (agg.bestSlotStarts?.[0] ?? null) : null);
      return nm;
    });
  }

  const finalCount = finalizeSlot ? (agg.counts[norm(finalizeSlot)] ?? 0) : 0;
  const organizerName = poll.organizer?.displayName ?? poll.organizerName ?? null;
  const projectName   = poll.project?.name ?? poll.projectName ?? null;

  const hoverAvailable = detailSlot ? (agg.perSlot[norm(detailSlot)] ?? []) : [];
  const hoverMissing = detailSlot
    ? (poll.responders ?? []).map(r => r.name).filter(n => !hoverAvailable.includes(n))
    : [];
  const mineCount = selected.size;

  // Who the share link actually admits, given audience + the link override.
  const linkOpen = poll.allowLinkResponses || poll.audience === 'ANYONE';
  const audienceNoun = poll.audience === 'PROJECT' ? 'the project team' : 'invited members';

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

      {/* Responder avatars */}
      {(poll.responders?.length > 0) && (
        <div className="pm-poll-responders">
          {poll.responders.slice(0, 14).map((r, i) => (
            <AvatarBit key={i} name={r.name} url={r.avatarUrl} guest={r.isGuest} />
          ))}
          {poll.responders.length > 14 && <span className="pm-poll-resp-more">+{poll.responders.length - 14}</span>}
        </div>
      )}

      {(poll.priorityTasks?.length > 0) && (
        <div className="pm-poll-tasks">
          <span className="pm-poll-tasks-label">Priority tasks:</span>
          {poll.priorityTasks.map(t => <span key={t.id} className="pm-poll-task-chip">{t.title}</span>)}
        </div>
      )}

      {/* Best time so far */}
      {status === 'OPEN' && agg.maxCount > 0 && (
        <div className="pm-poll-best-banner">
          <i className="fas fa-star" />
          <span>Best so far: <strong>{fmtInstant(agg.bestSlotStarts[0], tz)}</strong></span>
          <span className="pm-poll-best-count">{agg.maxCount}/{total} free</span>
          {agg.bestSlotStarts.length > 1 && <span className="pm-poll-best-tied">+{agg.bestSlotStarts.length - 1} tied</span>}
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
              onClick={toggleFinalize}>
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

      {poll.shareUrl && (
        <p className="pm-poll-hint pm-poll-link-note">
          {linkOpen ? (
            <><i className="fas fa-link" /> Anyone with this link can submit availability — no sign-in needed.</>
          ) : (
            <><i className="fas fa-lock" /> Link-holders can see the results, but only {audienceNoun} can respond.</>
          )}
        </p>
      )}

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
              {mineCount > 0 && <span className="pm-poll-mine-count">{mineCount}</span>}
              {saving && <span className="pm-poll-saving"><i className="fas fa-spinner fa-spin" /> saving</span>}
              {guestName && <span className="pm-poll-guest-tag">as {guestName}</span>}
              {mineCount > 0 && !saving && (
                <button type="button" className="cpm-link-btn pm-poll-clear" onClick={clearMine}>Clear</button>
              )}
            </div>
            {showGhost && (
              <div className="pm-poll-suggest-banner">
                <i className="fas fa-wand-magic-sparkles" />
                <span className="pm-poll-suggest-text">
                  From your last {suggestion.sampleSize} poll{suggestion.sampleSize === 1 ? '' : 's'},
                  {' '}{suggestion.summary || 'these are your usual times'}. Previewed below.
                </span>
                <button type="button" className="cpm-btn cpm-btn-primary" disabled={saving}
                  onClick={useSuggestion}>
                  <i className="fas fa-check" /> Use suggestion
                </button>
                <button type="button" className="cpm-btn cpm-btn-ghost"
                  onClick={() => setGhostDismissed(true)}>
                  Dismiss
                </button>
              </div>
            )}
            <GridTable
              className="pm-poll-grid-mine"
              grid={grid}
              scrollRef={mineScrollRef}
              onScroll={() => syncScroll(mineScrollRef, heatScrollRef)}
              renderCell={(iso, di, ti) => {
                const key = norm(iso);
                const on = selected.has(key);
                const ghost = showGhost && !on && suggestedSet.has(key);
                return (
                  <td key={iso}
                    data-iso={key}
                    data-mine="1"
                    data-di={di}
                    data-ti={ti}
                    className={`pm-poll-cell pm-poll-cell-mine ${on ? 'is-on' : ''} ${ghost ? 'is-ghost' : ''}`}
                    onPointerDown={(e) => { e.preventDefault(); cellDown(di, ti, key); }}
                  />
                );
              }}
            />
            <div className="pm-poll-grid-hint"><i className="fas fa-vector-square" /> Click a slot, or drag a box across days &amp; times to select a block.</div>
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
            scrollRef={heatScrollRef}
            onScroll={() => syncScroll(heatScrollRef, mineScrollRef)}
            renderCell={(iso) => {
              const key = norm(iso);
              const count = agg.counts[key] ?? 0;
              const best = bestSet.has(key);
              const clickable = finalizeMode && canManage;
              const names = agg.perSlot[key] ?? [];
              const pinned = pinnedSlot && norm(pinnedSlot) === key;
              return (
                <td key={iso}
                  className={`pm-poll-cell pm-poll-cell-heat ${best ? 'is-best' : ''} ${clickable ? 'is-clickable' : ''} ${pinned ? 'is-pinned' : ''} ${finalizeSlot && norm(finalizeSlot) === key ? 'is-picked' : ''}`}
                  style={{ background: heatColor(count, total) }}
                  title={`${fmtInstant(iso, tz)}\n${count}/${total} available${names.length ? `: ${names.join(', ')}` : ''}`}
                  // Gated to a real mouse: a tap synthesises enter/leave too,
                  // which would fight the pin toggle below.
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHoverSlot(iso); }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === 'mouse') setHoverSlot(prev => (prev === iso ? null : prev));
                  }}
                  onClick={() => {
                    if (clickable) setFinalizeSlot(iso);
                    else setPinnedSlot(prev => (prev && norm(prev) === key ? null : iso));
                  }}
                >
                  {count > 0 && <span className="pm-poll-cell-count">{count}</span>}
                </td>
              );
            }}
          />
          <div className="pm-poll-grid-hint">
            <i className="fas fa-hand-pointer" /> Tap a slot to see who&apos;s free. On a phone,
            swipe this grid sideways — both grids move together.
          </div>
        </div>
      </div>

      {/* Hover detail */}
      {/* Always mounted, empty until a slot is chosen. Rendering it on demand
          made the page jump every time the pointer entered or left a cell. */}
      <div className={`pm-poll-hover-detail ${detailSlot && total > 0 ? '' : 'is-empty'}`}>
        {!(detailSlot && total > 0) ? (
          <span className="pm-poll-hover-placeholder">
            <i className="fas fa-hand-pointer" />
            {total > 0
              ? ' Hover or tap a slot to see who is available.'
              : ' No availability submitted yet.'}
          </span>
        ) : (
        <>
          <strong>{fmtInstant(detailSlot, tz)}</strong>
          {pinnedSlot && (
            <button type="button" className="cpm-icon-btn pm-poll-hover-close"
              onClick={() => setPinnedSlot(null)} aria-label="Close slot details">
              <i className="fas fa-times" />
            </button>
          )}
          <div className="pm-poll-hover-cols">
            <div>
              <span className="pm-poll-hover-h pm-poll-hover-yes">Available ({hoverAvailable.length})</span>
              <div className="pm-poll-hover-names">
                {hoverAvailable.map(n => {
                  const r = respByName.get(n);
                  return <span key={n} className="pm-poll-name-row"><AvatarBit name={n} url={r?.avatarUrl} guest={r?.isGuest} size={18} /> {n}</span>;
                })}
              </div>
            </div>
            {hoverMissing.length > 0 && (
              <div>
                <span className="pm-poll-hover-h pm-poll-hover-no">Not available</span>
                <div className="pm-poll-hover-names">
                  {hoverMissing.map(n => {
                    const r = respByName.get(n);
                    return <span key={n} className="pm-poll-name-row muted"><AvatarBit name={n} url={r?.avatarUrl} guest={r?.isGuest} size={18} /> {n}</span>;
                  })}
                </div>
              </div>
            )}
          </div>
        </>
        )}
      </div>

      {!canRespond && status === 'OPEN' && (
        <p className="pm-poll-hint" style={{ marginTop: 12 }}>
          <i className="fas fa-lock" /> You can view this poll but aren't permitted to submit availability.
        </p>
      )}
    </div>
  );
}

// Shared day × time table. `renderCell(iso)` returns a <td> for a real slot.
// `scrollRef`/`onScroll` let the caller mirror horizontal scroll between the two
// grids so they never show different days.
function GridTable({ grid, renderCell, className = '', scrollRef, onScroll }) {
  return (
    <div className={`pm-poll-grid-scroll ${className}`} ref={scrollRef} onScroll={onScroll}>
      <table className="pm-poll-grid-table">
        <thead>
          <tr>
            <th className="pm-poll-timecol" />
            {grid.days.map(d => <th key={d} className="pm-poll-dayhead">{fmtDayLabel(d)}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.times.map((hm, ti) => (
            <tr key={hm}>
              <td className="pm-poll-timecol">{fmtTimeLabel(hm)}</td>
              {grid.days.map((d, di) => {
                const iso = grid.slotAt.get(`${d} ${hm}`);
                if (!iso) return <td key={`${d}-${hm}`} className="pm-poll-cell pm-poll-cell-empty" />;
                return renderCell(iso, di, ti);
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
