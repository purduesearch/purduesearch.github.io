import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getChatChannels, openDm } from '../../../api/clubPmClient';
import { seedDraft } from '../chat/ChatComposer';
import { dayHeader, fmtRange, draftLabMessage } from './labScheduleUtils';

const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GROUP_DM = '__dm__';

// Slack draft for one overlap window. Nothing is sent from here: the draft is
// handed to the chat composer and the member reviews and sends it themselves
// (portal decision D1).
export default function LabDraftPopover({ window: win, box, meId, membersById, projectId, taskContext, onCancel, onClose }) {
  const navigate = useNavigate();
  const others = useMemo(() => win.memberIds.filter(id => id !== meId).map(id => membersById.get(id) ?? { id, displayName: 'Someone' }), [win, meId, membersById]);
  // Channels only make sense when everyone addressed is on the project.
  const shareProject = !!projectId && others.every(m => m.projects?.some(p => p.id === projectId));
  const [channels, setChannels] = useState([]);
  const [target, setTarget] = useState(GROUP_DM);
  const [recurring, setRecurring] = useState(win.weekly);
  const mentions = useMemo(() => {
    const out = {};
    for (const m of others) if (m.slackId) out[m.displayName] = m.slackId;
    return out;
  }, [others]);
  const names = useMemo(() => others.map(m => (m.slackId ? `@${m.displayName}` : m.displayName)), [others]);
  const [text, setText] = useState(() => draftLabMessage({ names, window: win, recurring: win.weekly, taskTitle: taskContext?.title }));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const edited = useRef(false);

  useEffect(() => {
    if (!shareProject) return undefined;
    let alive = true;
    getChatChannels(projectId)
      .then(r => {
        if (!alive) return;
        const list = Array.isArray(r?.channels) ? r.channels : [];
        setChannels(list);
        if (list.length) setTarget(list[0].slackChannelId);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [shareProject, projectId]);

  useEffect(() => {
    if (!edited.current) setText(draftLabMessage({ names, window: win, recurring, taskTitle: taskContext?.title }));
  }, [names, win, recurring, taskContext]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    const onDown = (e) => {
      if (e.target.closest?.('.pm-lab-draft, .pm-lab-overlap-win, .pm-lab-overlap-row')) return;
      onCancel();
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [onCancel]);

  async function open() {
    if (busyRef.current || !text.trim()) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (target === GROUP_DM) {
        const res = await openDm(others.map(m => m.id));
        seedDraft(res.channelId, text, mentions);
        onClose();
        navigate(`/clubpm/members?dm=${encodeURIComponent(res.channelId)}`);
      } else {
        seedDraft(target, text, mentions);
        onClose();
        navigate(`/clubpm/chat/${encodeURIComponent(target)}`);
      }
    } catch (err) {
      toast.error(err?.message ?? 'Could not open the conversation.');
      busyRef.current = false;
      setBusy(false);
    }
  }

  const W = 320;
  const left = Math.min(Math.max(12, box.right + 8), window.innerWidth - W - 12);
  const top = Math.min(Math.max(12, box.top), window.innerHeight - 380);
  const day = DOW_LONG[new Date(`${win.date}T12:00:00Z`).getUTCDay()];

  return createPortal(
    <div className="pm-lab-pop pm-lab-draft" role="dialog" aria-label="Draft a lab invite" style={{ left, top, width: W }}>
      <div className="pm-lab-pop-body">
        <div className="pm-lab-pop-title">
          <i className="fas fa-people-arrows" aria-hidden="true" /> {dayHeader(win.date).dow} · {fmtRange(win.startMin, win.endMin)}
        </div>
        {others.length === 0 ? (
          <p className="pm-lab-draft-note">This window is only you.</p>
        ) : (
          <>
            {win.weekly && (
              <div className="pm-lab-seg" role="radiogroup" aria-label="How often">
                <button type="button" role="radio" aria-checked={!recurring} className={!recurring ? 'is-on' : ''} onClick={() => setRecurring(false)}>This week</button>
                <button type="button" role="radio" aria-checked={recurring} className={recurring ? 'is-on' : ''} onClick={() => setRecurring(true)}>Every {day}</button>
              </div>
            )}
            <textarea aria-label="Message" value={text} onChange={e => { edited.current = true; setText(e.target.value); }} />
            <label className="pm-lab-pop-field">
              Send to
              <select value={target} onChange={e => setTarget(e.target.value)}>
                {channels.map(c => <option key={c.slackChannelId} value={c.slackChannelId}>#{c.name}</option>)}
                <option value={GROUP_DM}>Group DM with these people</option>
              </select>
            </label>
            <span className="pm-lab-draft-note">Opens the chat with this draft. Nothing is sent until you send it.</span>
          </>
        )}
      </div>
      <div className="pm-lab-pop-actions">
        <button type="button" className="cpm-btn cpm-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="cpm-btn cpm-btn-primary" disabled={busy || others.length === 0 || !text.trim()} onClick={open}>
          <i className="fab fa-slack" aria-hidden="true" /> Open in chat
        </button>
      </div>
    </div>,
    document.body,
  );
}
