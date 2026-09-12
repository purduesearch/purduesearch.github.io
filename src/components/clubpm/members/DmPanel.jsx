import { useCallback, useEffect, useState } from "react";
import { getConversation } from "../../../api/clubPmClient";
import ChatConversation from "../chat/ChatConversation";

/** One open DM or group DM, docked beside the roster. URL state is `?dm=`. */
export default function DmPanel({ channelId, onClose }) {
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    getConversation(channelId)
      .then(setConversation)
      .catch(err => setError(err?.status === 404 ? "This conversation isn't available to you." : "Could not load this conversation."));
  }, [channelId]);

  useEffect(() => { setConversation(null); load(); }, [load]);

  const names = conversation?.participants?.map(p => p.displayName).join(", ");

  return (
    <section className="cpm-dm-panel" aria-label={names ? `Conversation with ${names}` : "Conversation"}>
      <header className="cpm-dm-panel-head">
        <b className="cpm-dm-panel-title">
          <i className={conversation?.kind === "MPIM" ? "fas fa-user-group" : "fas fa-comment"} aria-hidden="true" />{" "}
          {names || "Conversation"}
        </b>
        <button type="button" className="cpm-dm-panel-close" onClick={onClose} aria-label="Close conversation">
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </header>
      {error && <div className="cpm-chat-empty">{error}</div>}
      {!error && !conversation && <div className="cpm-spinner" aria-label="Loading" />}
      {conversation && (
        <ChatConversation
          key={channelId}
          channelId={channelId}
          conversation={conversation}
          emptyHint="No messages yet — say hi."
          composerPlaceholder={names ? `Message ${names}` : "Message"}
        />
      )}
    </section>
  );
}
