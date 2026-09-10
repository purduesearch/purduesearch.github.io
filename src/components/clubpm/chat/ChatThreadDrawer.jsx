import { useEffect, useState } from "react";
import { getChatThread } from "../../../api/clubPmClient";
import ChatMessage from "./ChatMessage";

export default function ChatThreadDrawer({ projectId, channelId, ts, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Opening a second thread before the first responds must not let the
    // slower response overwrite the newer one.
    let cancelled = false;
    setLoading(true);
    setError(null);

    getChatThread(projectId, channelId, ts)
      .then(data => { if (!cancelled) setMessages(data.messages ?? []); })
      .catch(() => { if (!cancelled) setError("Could not load this thread."); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [projectId, channelId, ts]);

  // In-flow flex column beside the message list (styled in Task 11), not
  // position: fixed — so the transformed ClubPM panel ancestors can't capture it.
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
          <ChatMessage key={m.id} message={m} projectId={projectId} compact />
        ))}
      </div>
    </aside>
  );
}
