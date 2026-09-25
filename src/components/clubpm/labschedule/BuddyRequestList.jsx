import LabAvatar from './LabAvatar';
import { dayHeader, fmtRange } from './labScheduleUtils';

export default function BuddyRequestList({ requests, onJoin }) {
  return (
    <aside className="pm-lab-buddies" aria-label="Looking for company">
      <h3><i className="fas fa-user-group" aria-hidden="true" /> Looking for company</h3>
      {requests.length === 0 ? (
        <p className="pm-lab-buddies-empty">No open requests in your spaces for the next two weeks.</p>
      ) : (
        <ul>
          {requests.map(r => {
            const d = dayHeader(r.date);
            return (
              <li key={`${r.shiftId}|${r.date}`} className="pm-lab-buddy" style={{ '--pm-lab-space': r.color }}>
                <LabAvatar member={r.member} size={26} />
                <div className="pm-lab-buddy-text">
                  <strong>{r.member.displayName}</strong>
                  <span>{r.workspaceName} · {d.dow} {d.month} {d.dom} · {fmtRange(r.startMin, r.endMin)}</span>
                </div>
                <button type="button" className="cpm-btn cpm-btn-ghost" onClick={() => onJoin(r)}>Join</button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
