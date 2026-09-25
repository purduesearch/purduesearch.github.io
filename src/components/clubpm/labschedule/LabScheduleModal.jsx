import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import MobileSheet from '../MobileSheet';
import { useClubPmAuth } from '../../../clubpm/ClubPmAuth';
import { listWorkspaces, getWorkspaceWeek, applyLabRect, listLabBuddyRequests } from '../../../api/clubPmClient';
import LabSpaceHeader from './LabSpaceHeader';
import LabWeekGrid from './LabWeekGrid';
import LabShiftPopover from './LabShiftPopover';
import BuddyRequestList from './BuddyRequestList';
import LabAvatar from './LabAvatar';
import { addDays, mondayOf, todayInZone, overlapNames, unmetRequirements, dayHeader, fmtRange } from './labScheduleUtils';

function BlockDetails({ block, box, week, meId, membersById, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => { if (!e.target.closest?.('.pm-lab-detail')) onClose(); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [onClose]);

  const W = 300;
  const left = Math.min(Math.max(12, box.right + 8), window.innerWidth - W - 12);
  const top = Math.min(Math.max(12, box.top), window.innerHeight - 320);
  const events = week.events.filter(ev => block.eventIds.includes(ev.eventId));
  const reqs = week.workspace.requirements;

  return createPortal(
    <div className="pm-lab-pop pm-lab-detail" role="dialog" aria-label="Who's here" style={{ left, top, width: W }}>
      <div className="pm-lab-pop-title">{dayHeader(block.date).dow} · {fmtRange(block.startMin, block.endMin)}</div>
      <ul className="pm-lab-detail-list">
        {block.memberIds.map(id => {
          const m = membersById.get(id);
          const missing = reqs.filter(r => (week.requirementStatus?.[id]?.[r.id] ?? 'missing') !== 'ok');
          return (
            <li key={id}>
              <LabAvatar member={m} size={28} />
              <div>
                <strong>{id === meId ? 'You' : (m?.displayName ?? 'Someone')}</strong>
                <span>{m?.projects?.map(p => p.name).join(', ') || 'Event attendee'}</span>
                {block.buddyMemberIds.includes(id) && <span className="pm-lab-buddy-tag"><i className="fas fa-user-group" aria-hidden="true" /> wants company</span>}
                {missing.length > 0 && (
                  <span className="pm-lab-detail-warn"><i className="fas fa-triangle-exclamation" aria-hidden="true" /> Missing {missing.map(r => r.name).join(', ')}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {events.length > 0 && (
        <div className="pm-lab-detail-events">
          {events.map(ev => <div key={ev.eventId}><i className="fas fa-flask" aria-hidden="true" /> {ev.title}</div>)}
        </div>
      )}
    </div>,
    document.body,
  );
}

export default function LabScheduleModal({ isOpen, onClose, projectId = null, initialWorkspaceId = null, compact = false }) {
  const { member } = useClubPmAuth();
  const meId = member?.id;
  const [spaces, setSpaces] = useState(null);     // null while loading
  const [spaceId, setSpaceId] = useState(null);
  const [monday, setMonday] = useState(null);
  const [week, setWeek] = useState(null);
  const [weekError, setWeekError] = useState('');
  const [mode, setMode] = useState('everyone');
  const [pending, setPending] = useState(null);   // { rect, op, point, saving }
  const [detail, setDetail] = useState(null);     // { block, box }
  const [buddies, setBuddies] = useState([]);
  const reqId = useRef(0);

  const refreshBuddies = useCallback(() => {
    listLabBuddyRequests(projectId).then(r => setBuddies(Array.isArray(r) ? r : [])).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    setSpaces(null); setWeek(null); setPending(null); setDetail(null); setMode('everyone');
    listWorkspaces(projectId ? { projectId } : {})
      .then(list => {
        if (!alive) return;
        const arr = Array.isArray(list) ? list : [];
        setSpaces(arr);
        const first = arr.find(s => s.id === initialWorkspaceId) ?? arr[0];
        setSpaceId(first?.id ?? null);
        setMonday(first ? mondayOf(todayInZone(first.timezone)) : null);
      })
      .catch(() => { if (alive) setSpaces([]); });
    refreshBuddies();
    return () => { alive = false; };
  }, [isOpen, projectId, initialWorkspaceId, refreshBuddies]);

  const loadWeek = useCallback(async () => {
    if (!spaceId || !monday) return;
    const id = ++reqId.current;
    setWeekError('');
    try {
      const w = await getWorkspaceWeek(spaceId, monday);
      if (id === reqId.current) setWeek(w);
    } catch (err) {
      if (id === reqId.current) setWeekError(err?.message ?? 'Could not load this week.');
    }
  }, [spaceId, monday]);
  useEffect(() => { if (isOpen) loadWeek(); }, [isOpen, loadWeek]);

  const membersById = useMemo(() => new Map((week?.members ?? []).map(m => [m.id, m])), [week]);
  const space = week?.workspace ?? spaces?.find(s => s.id === spaceId) ?? null;
  const myStatus = week?.requirementStatus?.[meId];
  const unmet = useMemo(() => (space && week ? unmetRequirements(space, myStatus) : []), [space, week, myStatus]);

  function selectSpace(id) {
    const s = spaces.find(x => x.id === id);
    setSpaceId(id); setWeek(null); setPending(null); setDetail(null);
    setMonday(mondayOf(todayInZone(s.timezone)));
  }
  function moveWeek(delta) {
    setPending(null); setDetail(null); setWeek(null);
    setMonday(m => (delta === 0 ? mondayOf(todayInZone(space.timezone)) : addDays(m, 7 * delta)));
  }
  function changeMode(m) { setPending(null); setDetail(null); setMode(m); }

  async function confirm({ scope, endsOn, buddyWanted }) {
    if (!pending) return;
    const { rect, op } = pending;
    setPending(p => ({ ...p, saving: true }));
    try {
      const next = await applyLabRect(spaceId, {
        op, scope, dates: rect.dates, startMin: rect.startMin, endMin: rect.endMin, endsOn, buddyWanted,
      });
      setWeek(next);
      setPending(null);
      toast.success(op === 'add' ? 'Lab time added' : 'Lab time removed');
      refreshBuddies();
    } catch (err) {
      setPending(null);
      toast.error(err?.message ?? 'Could not save your lab time.');
    }
  }

  function joinBuddy(req) {
    if (req.workspaceId !== spaceId) { setSpaceId(req.workspaceId); setWeek(null); }
    setMonday(mondayOf(req.date));
    setMode('edit');
    setDetail(null);
    setPending({
      rect: { dates: [req.date], startMin: req.startMin, endMin: req.endMin },
      op: 'add',
      point: { clientX: window.innerWidth / 2 - 145, clientY: window.innerHeight / 3 },
      saving: false,
    });
  }

  if (!isOpen) return null;

  let body;
  if (spaces === null) {
    body = <div className="pm-lab-empty"><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Loading spaces…</div>;
  } else if (spaces.length === 0) {
    body = (
      <div className="pm-lab-empty">
        <i className="fas fa-flask" aria-hidden="true" />
        <strong>No lab spaces yet</strong>
        {projectId ? 'No spaces are assigned to this project yet. Ask an admin to add one.' : 'Admins can add spaces from the Admin page.'}
      </div>
    );
  } else {
    body = (
      <>
        <LabSpaceHeader
          spaces={spaces} spaceId={spaceId} onSpace={selectSpace}
          dates={week?.dates} onWeek={moveWeek}
          mode={mode} onMode={changeMode}
          canSchedule={!!week?.canSchedule} space={space} myStatus={myStatus}
        />
        <div className="pm-lab-main">
          <div className="pm-lab-grid-wrap">
            {weekError ? (
              <div className="pm-lab-empty">
                <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {weekError}
                <button type="button" className="cpm-btn cpm-btn-ghost" onClick={loadWeek}>Retry</button>
              </div>
            ) : !week ? (
              <div className="pm-lab-empty"><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Loading week…</div>
            ) : (
              <>
                <LabWeekGrid
                  week={week} meId={meId} mode={mode} canEdit={week.canSchedule} pending={pending}
                  membersById={membersById}
                  onRect={(rect, op, point) => { setDetail(null); setPending({ rect, op, point, saving: false }); }}
                  onBlockClick={(block, box) => setDetail({ block, box })}
                />
                {mode === 'everyone' && week.blocks.length === 0 && week.events.length === 0 && (
                  <div className="pm-lab-empty-overlay">
                    No one scheduled here this week yet.
                    {week.canSchedule && (
                      <button type="button" className="cpm-btn cpm-btn-primary" onClick={() => changeMode('edit')}>
                        <i className="fas fa-plus" aria-hidden="true" /> Add my lab time
                      </button>
                    )}
                  </div>
                )}
                {mode === 'edit' && (
                  <p className="pm-lab-hint">
                    <i className="fas fa-vector-square" aria-hidden="true" /> Drag a box across days &amp; times. Start on your own time to remove it.
                  </p>
                )}
              </>
            )}
          </div>
          <BuddyRequestList requests={buddies} onJoin={joinBuddy} />
        </div>
      </>
    );
  }

  const content = (
    <div className="pm-lab">
      {body}
      {pending && week && (
        <LabShiftPopover
          rect={pending.rect} op={pending.op} point={pending.point}
          defaultEndsOn={space?.defaultEndsOn ?? ''}
          overlaps={overlapNames(pending.rect, week.occurrences, meId, membersById)}
          unmet={unmet} busy={pending.saving} compact={compact}
          onConfirm={confirm} onCancel={() => setPending(null)}
        />
      )}
      {detail && week && (
        <BlockDetails block={detail.block} box={detail.box} week={week} meId={meId} membersById={membersById} onClose={() => setDetail(null)} />
      )}
    </div>
  );

  if (compact) {
    return (
      <MobileSheet title="Lab schedule" onClose={onClose} variant="fullscreen" className="pm-m-calendar-layer">
        {content}
      </MobileSheet>
    );
  }
  return createPortal(
    <div className="cpm-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !pending) onClose(); }}>
      <div className="pm-lab-modal" role="dialog" aria-modal="true" aria-labelledby="pm-lab-title" onClick={e => e.stopPropagation()}>
        <div className="cpm-event-modal-header">
          <h2 id="pm-lab-title" className="cpm-event-modal-title">
            <span className="cpm-event-modal-icon" style={{ background: 'var(--pm-accent-teal)', color: '#04211f' }}>
              <i className="fas fa-flask" aria-hidden="true" />
            </span>
            Lab schedule
          </h2>
          <button type="button" className="cpm-icon-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>
        {content}
      </div>
    </div>,
    document.body,
  );
}
