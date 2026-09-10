import ChatRichText from "./ChatRichText";
import ChatFileAttachment from "./ChatFileAttachment";

function timeLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function ChatMessage({ message, projectId, compact = false, onOpenThread }) {
  // Deleted messages keep their row on purpose: the archive records that
  // something was said and removed, rather than quietly losing the turn.
  if (message.deletedAt) {
    return (
      <div className="cpm-chat-msg cpm-chat-msg--deleted">
        <div className="cpm-chat-msg-body">
          <i className="fas fa-trash-can" aria-hidden="true" />
          <label className="cpm-chat-plain"> This message was deleted in Slack</label>
        </div>
      </div>
    );
  }

  return (
    <div className={`cpm-chat-msg${compact ? " cpm-chat-msg--compact" : ""}`}>
      <div className="cpm-chat-avatar" aria-hidden="true">
        {message.authorAvatarUrl
          ? <img src={message.authorAvatarUrl} alt="" />
          : <i className="fas fa-user" />}
      </div>

      <div className="cpm-chat-msg-body">
        <div className="cpm-chat-msg-head">
          <b className="cpm-chat-author">{message.authorName}</b>
          <label className="cpm-chat-time">{timeLabel(message.postedAt)}</label>
          {message.editedAt && <label className="cpm-chat-edited">(edited)</label>}
        </div>

        <ChatRichText tokens={message.tokens} />

        {message.files?.length > 0 && (
          <div className="cpm-chat-files">
            {message.files.map(f => (
              <ChatFileAttachment key={f.id} file={f} projectId={projectId} />
            ))}
          </div>
        )}

        {message.reactions?.length > 0 && (
          <div className="cpm-chat-reactions">
            {message.reactions.map(r => (
              <div key={r.emoji} className="cpm-chat-reaction" title={r.emoji}>
                <label className="cpm-chat-plain">{r.emoji}</label>
                <label className="cpm-chat-reaction-count">{r.count}</label>
              </div>
            ))}
          </div>
        )}

        {message.replyCount > 0 && onOpenThread && (
          <button
            type="button"
            className="cpm-chat-thread-btn"
            onClick={() => onOpenThread(message.ts)}
          >
            <i className="fas fa-comments" aria-hidden="true" />
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>
    </div>
  );
}
