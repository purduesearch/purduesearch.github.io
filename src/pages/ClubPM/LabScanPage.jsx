import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  listWorkspaces, getMyLabVisits, getLabPresence, labCheckIn, labCheckOut,
} from '../../api/clubPmClient';

// Landing page for the check-in QR code posted in each lab space
// (/clubpm/lab/:workspaceId). Scanning opens this page; one tap checks in or out.
// The action is a button, never automatic on load: link previewers and
// re-scans must not toggle a visit.

function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function closeSummary(result) {
  if (!result) return '';
  if (result.discarded) return 'Visit was under 5 minutes, so no time was logged.';
  const parts = (result.allocations ?? []).map(a => `${a.minutes}m → ${a.title}`);
  if (result.unallocatedMinutes > 0) parts.push(`${result.unallocatedMinutes}m not logged to a task yet`);
  return parts.join(' · ');
}

export default function LabScanPage() {
  const { workspaceId } = useParams();
  const [space, setSpace] = useState(undefined); // undefined = loading, null = not found
  const [visits, setVisits] = useState(null);
  const [presentCount, setPresentCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { kind: 'in' | 'out', detail }
  const [, setTick] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(() => {
    getMyLabVisits().then(setVisits).catch(() => setVisits({ open: null }));
    getLabPresence({ workspaceId })
      .then(rows => setPresentCount(rows?.[0]?.checkedIn?.length ?? 0))
      .catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    listWorkspaces()
      .then(list => setSpace((Array.isArray(list) ? list : []).find(w => w.id === workspaceId) ?? null))
      .catch(() => setSpace(null));
    load();
  }, [workspaceId, load]);

  const open = visits?.open;
  useEffect(() => {
    if (!open) return undefined;
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, [open]);

  async function run(fn) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      setDone(await fn());
      load();
    } catch (err) {
      toast.error(err?.message ?? 'Something went wrong.');
      load();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const checkIn = () => run(async () => {
    const r = await labCheckIn(workspaceId);
    const prev = r?.closedPrevious;
    return {
      kind: 'in',
      detail: prev ? `Checked out of ${prev.workspaceName} first. ${closeSummary(prev)}`.trim() : '',
    };
  });
  const checkOut = () => run(async () => ({ kind: 'out', detail: closeSummary(await labCheckOut()) }));

  if (space === undefined || visits === null) {
    return <div className="pm-lab-scan"><div className="pm-lab-scan-card"><div className="cpm-spinner" aria-label="Loading" /></div></div>;
  }

  if (space === null) {
    return (
      <div className="pm-lab-scan">
        <div className="pm-lab-scan-card">
          <i className="fas fa-circle-question pm-lab-scan-icon" aria-hidden="true" />
          <h1>Lab space not found</h1>
          <p>This QR code points to a space that no longer exists or was archived. Ask an admin for a new code.</p>
          <Link className="cpm-btn cpm-btn-ghost" to="/clubpm">Go to dashboard</Link>
        </div>
      </div>
    );
  }

  const hereOpen = open && open.workspace?.id === space.id;
  const elsewhere = open && !hereOpen;

  return (
    <div className="pm-lab-scan" style={{ '--pm-lab-space': space.color }}>
      <div className="pm-lab-scan-card" aria-live="polite">
        <span className="pm-lab-scan-space">
          <span className="pm-lab-space-dot" aria-hidden="true" /> {space.name}
        </span>
        {space.location && <span className="pm-lab-scan-meta"><i className="fas fa-location-dot" aria-hidden="true" /> {space.location}</span>}

        {done && (
          <div className={`pm-lab-scan-done is-${done.kind}`} role="status">
            <i className={done.kind === 'in' ? 'fas fa-circle-check' : 'fas fa-door-closed'} aria-hidden="true" />
            <strong>{done.kind === 'in' ? `Checked in to ${space.name}` : 'Checked out'}</strong>
            {done.detail && <span>{done.detail}</span>}
          </div>
        )}

        {hereOpen ? (
          <>
            <p className="pm-lab-scan-status">
              You're checked in here — <strong>{fmtDuration(Date.now() - new Date(open.checkedInAt).getTime())}</strong>
            </p>
            <button type="button" className="cpm-btn cpm-btn-primary pm-lab-scan-btn" disabled={busy} onClick={checkOut}>
              <i className="fas fa-arrow-right-from-bracket" aria-hidden="true" /> Check out
            </button>
          </>
        ) : (
          <>
            <p className="pm-lab-scan-status">
              {elsewhere
                ? <>You're checked in at <strong>{open.workspace?.name}</strong>. Checking in here checks you out there.</>
                : 'You are not checked in.'}
            </p>
            <button type="button" className="cpm-btn cpm-btn-primary pm-lab-scan-btn" disabled={busy} onClick={checkIn}>
              <i className="fas fa-right-to-bracket" aria-hidden="true" /> Check in here
            </button>
            {elsewhere && (
              <button type="button" className="cpm-btn cpm-btn-ghost pm-lab-scan-btn" disabled={busy} onClick={checkOut}>
                Check out of {open.workspace?.name}
              </button>
            )}
          </>
        )}

        <span className="pm-lab-scan-meta">
          <i className="fas fa-user-group" aria-hidden="true" /> {presentCount} checked in here now
        </span>
        {(visits.pending?.length > 0 || visits.unallocated?.length > 0) && (
          <p className="pm-lab-scan-note">
            You have lab time to confirm or log to a task. Open the lab schedule from the Calendar to finish it.
          </p>
        )}
      </div>
    </div>
  );
}
