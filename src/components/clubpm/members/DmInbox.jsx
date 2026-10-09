import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { listConversations, importMyDms } from "../../../api/clubPmClient";
import { useClubPmAuth } from "../../../clubpm/ClubPmAuth";
import { SlackReconnectNotice } from "../chat/ChatComposer";

const IMPORT_KEY = "cpm.dms.imported";
const DM_KINDS = new Set(["IM", "MPIM"]);

/**
 * The member's DMs and group DMs, newest first, with unread badges (D12).
 * `slackIdFilter` (a Set of Slack user ids) narrows it to conversations that
 * include at least one of those people — the project Chat → Members view passes its
 * roster.
 */
export default function DmInbox({ activeChannelId, onOpen, slackIdFilter = null, projectId = null }) {
  const { member } = useClubPmAuth();
  const canRead = !!member?.slackCapabilities?.read;
  const [dms, setDms] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const refresh = useCallback(() => {
    const request = ++requestRef.current;
    listConversations(projectId)
      .then(d => { if (request === requestRef.current) { setDms(d.dms ?? []); setError(null); } })
      .catch(() => { if (request === requestRef.current) setError("Could not load your messages."); });
  }, [projectId]);

  useEffect(() => {
    const requestState = requestRef;
    setDms(null);
    setError(null);
    if (canRead) refresh();
    return () => { requestState.current++; };
  }, [canRead, refresh]);

  // Import DM history once per browser session. The server skips conversations
  // already imported, so this is cheap after the first time.
  useEffect(() => {
    if (!canRead) return;
    const importKey = `${IMPORT_KEY}.${member.id}.${projectId || 'club'}`;
    try {
      if (sessionStorage.getItem(importKey) === "1") return;
      sessionStorage.setItem(importKey, "1");
    } catch {
      // sessionStorage unavailable — importing again is harmless
    }
    let cancelled = false;
    let timer;
    importMyDms(projectId)
      .then(r => {
        if (!cancelled && r?.conversations) timer = setTimeout(refresh, 4000);
        if (!r?.started) sessionStorage.removeItem(importKey);
      })
      .catch(() => { try { sessionStorage.removeItem(importKey); } catch {} });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [canRead, member?.id, projectId, refresh]);

  // Live: new DM messages, new conversations, and reads elsewhere.
  useEffect(() => {
    let t;
    const bump = (e) => {
      if (!canRead) return;
      if (e.type === "clubpm:slack-message" && !DM_KINDS.has(e.detail?.convKind)) return;
      clearTimeout(t);
      t = setTimeout(refresh, 600);
    };
    const events = ["clubpm:slack-message", "clubpm:slack-membership", "clubpm:conversation-read"];
    events.forEach(ev => window.addEventListener(ev, bump));
    return () => { clearTimeout(t); events.forEach(ev => window.removeEventListener(ev, bump)); };
  }, [canRead, refresh]);

  const shown = useMemo(
    () => (dms ?? []).filter(d => !slackIdFilter || d.participants.some(p => slackIdFilter.has(p.slackId))),
    [dms, slackIdFilter]
  );

  if (!canRead) {
    return (
      <aside className="cpm-dm-inbox" aria-label="Direct messages">
        <div className="cpm-dm-inbox-head"><b>Messages</b></div>
        <SlackReconnectNotice compact />
      </aside>
    );
  }

  return (
    <aside className="cpm-dm-inbox" aria-label="Direct messages">
      <div className="cpm-dm-inbox-head"><b>Messages</b></div>
      {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}
      {dms === null && !error && <div className="cpm-spinner" aria-label="Loading" />}
      {dms && shown.length === 0 && (
        <div className="cpm-dm-empty">No conversations yet — use <b>Message</b> on anyone's card.</div>
      )}
      {shown.map(d => {
        const names = d.participants.map(p => p.displayName).join(", ") || "Just you";
        const first = d.participants[0];
        const unread = d.unread > 0 && !d.muted;
        return (
          <button
            key={d.slackChannelId}
            type="button"
            className={`cpm-dm-row${d.slackChannelId === activeChannelId ? " active" : ""}${unread ? " unread" : ""}`}
            onClick={() => onOpen(d.slackChannelId)}
          >
            <div className="cpm-dm-avatar" aria-hidden="true">
              {first?.avatarUrl
                ? <img src={first.avatarUrl} alt="" />
                : <i className={d.kind === "MPIM" ? "fas fa-user-group" : "fas fa-user"} />}
            </div>
            <div className="cpm-dm-row-body">
              <div className="cpm-dm-row-top">
                <b className="cpm-dm-name">{names}</b>
                {d.lastMessageAt && (
                  <label className="cpm-dm-time">{formatDistanceToNowStrict(new Date(d.lastMessageAt))}</label>
                )}
              </div>
              <div className="cpm-dm-preview">
                {d.preview ? `${d.preview.authorName}: ${d.preview.text}` : "No messages yet"}
              </div>
            </div>
            {d.muted && <i className="fas fa-bell-slash cpm-chatpage-muted" aria-label="Muted" />}
            {unread && <b className="cpm-dm-badge">{d.unread}</b>}
          </button>
        );
      })}
    </aside>
  );
}
