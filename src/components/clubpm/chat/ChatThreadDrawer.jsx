import { useCallback, useEffect, useRef, useState } from "react";
import { getConversationThread, markConversationRead } from "../../../api/clubPmClient";
import ChatMessage from "./ChatMessage";
import ChatComposer from "./ChatComposer";

export default function ChatThreadDrawer({ channelId, ts, conversation = null, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Opening a second thread before the first responds must not let the slower
  // response overwrite the newer one.
  const reqRef = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const id = ++reqRef.current;
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const data = await getConversationThread(channelId, ts);
      if (id === reqRef.current) setMessages(data.messages ?? []);
    } catch {
      if (id === reqRef.current && !quiet) setError("Could not load this thread.");
    } finally {
      if (id === reqRef.current && !quiet) setLoading(false);
    }
  }, [channelId, ts]);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    const onLive = (e) => {
      const d = e.detail;
      if (d?.channelId === channelId && (d.threadTs === ts || d.ts === ts)) load(true);
    };
    window.addEventListener("clubpm:slack-message", onLive);
    return () => window.removeEventListener("clubpm:slack-message", onLive);
  }, [channelId, ts, load]);

  // Viewing a thread clears its reply pings (D11) — the notification's ts is
  // the reply's, which a top-level read mark would not reach.
  const newest = messages.length ? messages[messages.length - 1].ts : null;
  const isParticipant = !!conversation?.isParticipant;
  useEffect(() => {
    if (!isParticipant || !newest) return;
    markConversationRead(channelId, newest)
      .then(() => window.dispatchEvent(new CustomEvent("clubpm:conversation-read", { detail: { channelId } })))
      .catch(() => {});
  }, [channelId, newest, isParticipant]);

  const canPost = !!conversation?.canPost;

  // In-flow flex column beside the message list, not position: fixed — so the
  // transformed ClubPM panel ancestors can't capture it.
  return (
    <aside className="cpm-chat-drawer" role="complementary" aria-label="Thread">
      <div className="cpm-chat-drawer-head">
        <b>Thread</b>
        <button type="button" className="cpm-chat-drawer-close" onClick={onClose} aria-label="Close thread">
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </div>

      <div className="cpm-chat-drawer-body">
        {loading && <div className="cpm-spinner" aria-label="Loading" />}
        {error && <div className="cpm-chat-empty">{error}</div>}
        {!loading && !error && messages.map(m => (
          <ChatMessage key={m.id} message={m} channelId={channelId} canPost={canPost} compact onChanged={() => load(true)} />
        ))}
      </div>

      {canPost && (
        <ChatComposer
          channelId={channelId}
          conversation={conversation}
          threadTs={ts}
          placeholder="Reply…"
          onSent={() => load(true)}
        />
      )}
    </aside>
  );
}
