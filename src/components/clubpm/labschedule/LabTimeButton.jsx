import { useEffect, useState } from 'react';
import LabScheduleModal from './LabScheduleModal';
import { listWorkspaces, listLabBuddyRequests } from '../../../api/clubPmClient';

// Project header entry point. Renders nothing when the project has no lab spaces.
export default function LabTimeButton({ projectId, compact = false }) {
  const [hasSpaces, setHasSpaces] = useState(false);
  const [buddyCount, setBuddyCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    listWorkspaces({ projectId })
      .then(l => { if (alive) setHasSpaces(Array.isArray(l) && l.length > 0); })
      .catch(() => {});
    listLabBuddyRequests(projectId)
      .then(r => { if (alive) setBuddyCount(Array.isArray(r) ? r.length : 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectId]);

  if (!hasSpaces) return null;
  return (
    <>
      <button type="button" className="pm-lab-open-btn" data-tour-id="project.lab" onClick={() => setOpen(true)} title="Lab schedule">
        <i className="fas fa-flask" aria-hidden="true" /> Lab time
        {buddyCount > 0 && (
          <span className="pm-lab-open-badge" aria-label={`${buddyCount} open requests for company`}>{buddyCount}</span>
        )}
      </button>
      <LabScheduleModal isOpen={open} onClose={() => setOpen(false)} projectId={projectId} compact={compact} />
    </>
  );
}
