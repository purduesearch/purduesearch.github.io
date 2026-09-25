import { useCallback, useEffect, useState } from 'react';
import { getLabPresence } from '../../../api/clubPmClient';
import LabScheduleModal from './LabScheduleModal';
import LabAvatar from './LabAvatar';
import { useCompactLayout } from '../../../clubpm/layout/compactLayout';

const REFRESH_MS = 60000;

/** Polls /lab-visits/present every minute, but only while the tab is visible. */
function usePresence(projectId) {
  const [spaces, setSpaces] = useState(null);
  const load = useCallback(() => {
    getLabPresence({ projectId }).then(r => setSpaces(Array.isArray(r) ? r : [])).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    load();
    let timer = null;
    const start = () => { if (!timer) timer = setInterval(load, REFRESH_MS); };
    const stop = () => { clearInterval(timer); timer = null; };
    const onVis = () => {
      if (document.visibilityState === 'visible') { load(); start(); } else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  return [spaces, load];
}

/**
 * "Who's in the lab now". `card` lists every space with checked-in members
 * (solid) and scheduled-but-not-here members (outlined); `badge` is a compact
 * head-count that hides at zero. Either opens the lab modal on click.
 */
export default function LabPresenceCard({ projectId = null, variant = 'card' }) {
  const compact = useCompactLayout();
  const [spaces, reload] = usePresence(projectId);
  const [openSpace, setOpenSpace] = useState(undefined);   // undefined = closed

  if (!spaces || spaces.length === 0) return null;
  const hereCount = spaces.reduce((n, s) => n + s.checkedIn.length, 0);

  const modal = (
    <LabScheduleModal
      isOpen={openSpace !== undefined}
      onClose={() => { setOpenSpace(undefined); reload(); }}
      projectId={projectId} initialWorkspaceId={openSpace ?? null} compact={compact}
    />
  );

  if (variant === 'badge') {
    if (hereCount === 0) return null;
    const first = spaces.find(s => s.checkedIn.length > 0);
    return (
      <>
        <button type="button" className="pm-lab-presence-badge" onClick={() => setOpenSpace(first?.workspace.id ?? null)}
          title="Checked in to the lab right now" aria-label={`${hereCount} in the lab now`}>
          <i className="fas fa-flask" aria-hidden="true" /> {hereCount} here
        </button>
        {modal}
      </>
    );
  }

  return (
    <section className="pm-lab-presence" aria-labelledby="pm-lab-presence-title">
      <div className="pm-lab-presence-head">
        <h3 id="pm-lab-presence-title"><i className="fas fa-flask" aria-hidden="true" /> In the lab now</h3>
      </div>
      <ul className="pm-lab-presence-list">
        {spaces.map(s => {
          const people = s.checkedIn.length + s.scheduled.length;
          return (
            <li key={s.workspace.id}>
              <button type="button" className="pm-lab-presence-row" style={{ '--pm-lab-space': s.workspace.color }}
                onClick={() => setOpenSpace(s.workspace.id)}>
                <span className="pm-lab-space-dot" aria-hidden="true" />
                <span className="pm-lab-presence-name">{s.workspace.name}</span>
                {people === 0 ? (
                  <span className="pm-lab-presence-none">Nobody right now</span>
                ) : (
                  <span className="pm-lab-presence-people">
                    {s.checkedIn.map(c => (
                      <span key={c.member.id} className="pm-lab-presence-person is-here" title={`${c.member.displayName} · here`}>
                        <LabAvatar member={c.member} size={24} />
                      </span>
                    ))}
                    {s.scheduled.map(c => (
                      <span key={c.member.id} className="pm-lab-presence-person is-expected" title={`${c.member.displayName} · expected`}>
                        <LabAvatar member={c.member} size={24} />
                      </span>
                    ))}
                    <span className="pm-lab-presence-count">
                      {s.checkedIn.length} here{s.scheduled.length > 0 && ` · ${s.scheduled.length} expected`}
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {modal}
    </section>
  );
}
