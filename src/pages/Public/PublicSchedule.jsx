import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import MeetingPollBoard from '../../components/clubpm/MeetingPollBoard';
import { getPublicPoll, submitPublicAvailability, googleCalendarUrl } from '../../api/clubPmClient';

const API_BASE  = process.env.REACT_APP_API_URL ?? '';
const TOKEN_KEY = 'clubpm_auth_token';

export default function PublicSchedule() {
  const { token } = useParams();

  const [poll, setPoll]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [member, setMember]     = useState(null);   // logged-in Constellation member
  const [checking, setChecking] = useState(true);
  const [guestName, setGuestName] = useState('');
  const [mySlots, setMySlots]   = useState([]);
  const [error, setError]       = useState('');

  // Load the poll (public, no auth required).
  useEffect(() => {
    getPublicPoll(token)
      .then(data => { setPoll(data); setLoading(false); })
      .catch(err => { setNotFound(err?.status === 404); setLoading(false); });
  }, [token]);

  // Detect a signed-in member so they can respond as themselves.
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) { setChecking(false); return; }
    fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${stored}`, Accept: 'application/json' },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(m => { if (m) { setMember(m); setGuestName(m.displayName ?? ''); } })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const loggedIn = !!member;
  const myResponse = useMemo(() => ({ slots: mySlots }), [mySlots]);

  const boardPoll = useMemo(() => {
    if (!poll) return null;
    return {
      ...poll,
      organizer: poll.organizerName ? { displayName: poll.organizerName } : null,
      project: poll.projectName ? { name: poll.projectName } : null,
      shareUrl: window.location.href,
      myResponse,
      permissions: {
        canRespond: loggedIn ? true : !!poll.canGuestRespond,
        asGuest: !loggedIn,
        canManage: false,
      },
    };
  }, [poll, myResponse, loggedIn]);

  async function handleSave(slots) {
    setError('');
    if (!loggedIn && !guestName.trim()) {
      setError('Enter your name before marking availability.');
      throw new Error('name required');
    }
    try {
      const updated = await submitPublicAvailability(token, {
        guestName: loggedIn ? undefined : guestName.trim(),
        slots,
        authToken: loggedIn ? localStorage.getItem(TOKEN_KEY) : undefined,
      });
      setMySlots(slots);
      setPoll(updated);
    } catch (err) {
      setError(err?.message ?? 'Could not save your availability.');
      throw err;
    }
  }

  return (
    <div className="clubpm-app pm-public-schedule">
      <div className="pm-public-schedule-inner">
        <div className="pm-public-brand">
          <i className="fas fa-satellite" /> SEARCH · Meeting Scheduler
        </div>

        {loading || checking ? (
          <div className="pm-public-status"><i className="fas fa-spinner fa-spin" /> Loading…</div>
        ) : notFound || !poll ? (
          <div className="pm-public-status">
            <i className="fas fa-calendar-xmark" /> This scheduling poll couldn’t be found.
          </div>
        ) : (
          <>
            {!loggedIn && poll.canGuestRespond && (
              <div className="pm-public-name-row">
                <label className="cpm-form-label">Your name</label>
                <input
                  className="cpm-form-input"
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="e.g. Prof. Lin"
                  maxLength={60}
                />
                <span className="pm-poll-hint">Marking slots saves them under this name.</span>
              </div>
            )}
            {loggedIn && (
              <div className="pm-public-name-row pm-public-signedin">
                <i className="fas fa-circle-check" /> Signed in as <strong>{member.displayName}</strong>
              </div>
            )}
            {error && <div className="pm-poll-error"><i className="fas fa-exclamation-triangle" /> {error}</div>}

            <div className="pm-poll-board-modal pm-public-board">
              <MeetingPollBoard
                poll={boardPoll}
                onSaveAvailability={handleSave}
                googleUrl={poll.finalStart ? googleCalendarUrl({
                  title: poll.title,
                  description: poll.description,
                  start: poll.finalStart,
                  end: poll.finalEnd ?? poll.finalStart,
                }) : null}
                guestName={!loggedIn ? guestName : undefined}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
