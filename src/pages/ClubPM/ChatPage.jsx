import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listConversations, getConversation } from "../../api/clubPmClient";
import ChatConversation from "../../components/clubpm/chat/ChatConversation";

function ChannelLink({ c, active }) {
  const unread = c.unread > 0 && !c.muted;
  return (
    <Link
      to={`/clubpm/chat/${c.slackChannelId}`}
      className={`cpm-chatpage-item${active ? " active" : ""}${unread ? " unread" : ""}`}
    >
      <i className={c.kind === "PRIVATE_CHANNEL" ? "fas fa-lock" : "fas fa-hashtag"} aria-hidden="true" />
      <label className="cpm-chat-plain cpm-chatpage-name">{c.name}</label>
      {c.muted && <i className="fas fa-bell-slash cpm-chatpage-muted" aria-label="Muted" />}
      {unread && <b className="cpm-chatpage-badge">{c.unread}</b>}
    </Link>
  );
}

/**
 * Every Slack channel the member may read: the ones they're in, plus a
 * "browse" list of public channels they can preview and join. DMs live on the
 * Members page (D12).
 */
export default function ChatPage() {
  const { channelId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [showBrowse, setShowBrowse] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [convError, setConvError] = useState(null);

  const refresh = useCallback(() => {
    listConversations().then(setData).catch(() => setError("Could not load channels."));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Badges stay live without polling. Debounced: a busy workspace fires many events.
  useEffect(() => {
    let t;
    const bump = () => { clearTimeout(t); t = setTimeout(refresh, 1500); };
    const events = ["clubpm:slack-message", "clubpm:slack-membership", "clubpm:conversation-read"];
    events.forEach(e => window.addEventListener(e, bump));
    return () => { clearTimeout(t); events.forEach(e => window.removeEventListener(e, bump)); };
  }, [refresh]);

  const channels = data?.channels ?? [];
  const mine = channels.filter(c => c.isMember);
  const browse = channels.filter(c => !c.isMember);
  const q = filter.trim().toLowerCase();
  const matches = (c) => !q || c.name.toLowerCase().includes(q);

  // No channel in the URL: open the most recently active one you're in.
  const firstMine = mine[0]?.slackChannelId;
  useEffect(() => {
    if (!channelId && firstMine) navigate(`/clubpm/chat/${firstMine}`, { replace: true });
  }, [channelId, firstMine, navigate]);

  const loadConversation = useCallback(() => {
    if (!channelId) return;
    setConvError(null);
    getConversation(channelId)
      .then(setConversation)
      .catch(() => { setConversation(null); setConvError("That channel isn't available to you."); });
  }, [channelId]);

  useEffect(() => { setConversation(null); loadConversation(); }, [loadConversation]);
  useEffect(() => {
    const onMembership = (e) => { if (e.detail?.channelId === channelId) loadConversation(); };
    window.addEventListener("clubpm:slack-membership", onMembership);
    return () => window.removeEventListener("clubpm:slack-membership", onMembership);
  }, [channelId, loadConversation]);

  return (
    <div className="cpm-chatpage">
      <aside className="cpm-chatpage-side" aria-label="Channels">
        <input
          className="cpm-chatpage-filter"
          type="search"
          placeholder="Find a channel…"
          aria-label="Find a channel"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}
        {!data && !error && <div className="cpm-spinner" aria-label="Loading" />}

        <div className="cpm-chatpage-group">Channels</div>
        {mine.filter(matches).map(c => (
          <ChannelLink key={c.slackChannelId} c={c} active={c.slackChannelId === channelId} />
        ))}
        {data && mine.length === 0 && <div className="cpm-chatpage-hint">You haven't joined any channels yet.</div>}

        <button type="button" className="cpm-chatpage-browse-toggle" onClick={() => setShowBrowse(v => !v)} aria-expanded={showBrowse}>
          <i className={showBrowse ? "fas fa-chevron-down" : "fas fa-chevron-right"} aria-hidden="true" />
          Browse public channels ({browse.length})
        </button>
        {showBrowse && browse.filter(matches).map(c => (
          <ChannelLink key={c.slackChannelId} c={c} active={c.slackChannelId === channelId} />
        ))}

        <Link to="/clubpm/members" className="cpm-chatpage-dmlink">
          <i className="fas fa-user-group" aria-hidden="true" /> Direct messages are on the Members page
        </Link>
      </aside>

      <section className="cpm-chatpage-main">
        {convError && <div className="cpm-chat-empty">{convError}</div>}
        {conversation && (
          <>
            <header className="cpm-chatpage-head">
              <i className={conversation.kind === "PRIVATE_CHANNEL" ? "fas fa-lock" : "fas fa-hashtag"} aria-hidden="true" />
              <b>{conversation.name ?? channelId}</b>
              {!conversation.isParticipant && <label className="cpm-chat-plain cpm-chatpage-preview">Previewing — join to post</label>}
            </header>
            <ChatConversation
              key={channelId}
              channelId={channelId}
              conversation={conversation}
              initialThreadTs={searchParams.get("thread")}
              composerPlaceholder={`Message #${conversation.name ?? "channel"}`}
              onJoined={() => { loadConversation(); refresh(); }}
            />
          </>
        )}
        {!channelId && data && mine.length === 0 && (
          <div className="cpm-chat-empty">Pick a public channel on the left to preview it.</div>
        )}
      </section>
    </div>
  );
}
