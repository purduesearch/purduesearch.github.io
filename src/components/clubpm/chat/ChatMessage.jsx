import { useState } from "react";
import toast from "react-hot-toast";
import { reactToChatMessage, editChatMessage, deleteChatMessage } from "../../../api/clubPmClient";
import { useClubPmAuth } from "../../../clubpm/ClubPmAuth";
import ChatRichText from "./ChatRichText";
import ChatBlocks from "./ChatBlocks";
import ChatFileAttachment from "./ChatFileAttachment";
import { emojiChar, QUICK_REACTIONS } from "./emojiShortcodes";
import { encodeOutgoing, decodeForEdit } from "./encodeOutgoing";

function timeLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ReactionFace({ name, url }) {
  if (url) return <img className="cpm-chat-emoji" src={url} alt={`:${name}:`} />;
  return <label className="cpm-chat-plain">{emojiChar(name) ?? `:${name}:`}</label>;
}

// 409 means exactly "reconnect Slack" (plan Task 11).
const errorText = (err) =>
  err?.status === 409 ? "Reconnect Slack to do that from Constellation." : (err?.message || "Slack rejected that.");

export default function ChatMessage({
  message,
  channelId = null,
  canPost = false,
  compact = false,
  onOpenThread,
  onChanged,
}) {
  const { member } = useClubPmAuth();
  const [editing, setEditing] = useState(null); // { text, mentions }
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);

  // Deleted messages keep their row on purpose: the archive records that
  // something was said and removed, rather than quietly losing the turn.
  if (message.deletedAt) {
    return (
      <div className="cpm-chat-msg cpm-chat-msg--deleted">
        <div className="cpm-chat-msg-body">
          <i className="fas fa-trash-can" aria-hidden="true" />
          <label className="cpm-chat-plain"> This message was deleted</label>
        </div>
      </div>
    );
  }

  const canAct = canPost && !!channelId;
  const mine = !!member?.slackId && message.authorSlackId === member.slackId && !message.isBot;

  const toggleReaction = async (name, currentlyMine) => {
    if (!canAct || busy) return;
    setBusy(true);
    setPicker(false);
    try {
      await reactToChatMessage(channelId, message.ts, name, !currentlyMine);
      onChanged?.();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    const text = editing.text.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await editChatMessage(channelId, message.ts, encodeOutgoing(text, editing.mentions));
      setEditing(null);
      onChanged?.();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this message? It is deleted in Slack too.")) return;
    setBusy(true);
    try {
      await deleteChatMessage(channelId, message.ts);
      onChanged?.();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`cpm-chat-msg${compact ? " cpm-chat-msg--compact" : ""}${message.isBot ? " cpm-chat-msg--bot" : ""}`}>
      <div className="cpm-chat-avatar" aria-hidden="true">
        {message.authorAvatarUrl
          ? <img src={message.authorAvatarUrl} alt="" />
          : <i className={message.isBot ? "fas fa-robot" : "fas fa-user"} />}
      </div>

      <div className="cpm-chat-msg-body">
        <div className="cpm-chat-msg-head">
          <b className="cpm-chat-author">{message.authorName}</b>
          {message.isBot && <label className="cpm-chat-app-badge">APP</label>}
          <label className="cpm-chat-time">{timeLabel(message.postedAt)}</label>
          {message.editedAt && <label className="cpm-chat-edited">(edited)</label>}
        </div>

        {editing ? (
          <div className="cpm-chat-edit">
            <textarea
              className="cpm-chat-composer-input"
              value={editing.text}
              autoFocus
              aria-label="Edit message"
              onChange={e => setEditing({ ...editing, text: e.target.value })}
              onKeyDown={e => {
                if (e.key === "Escape") setEditing(null);
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
              }}
            />
            <div className="cpm-chat-edit-actions">
              <button type="button" className="cpm-chat-linkbtn" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="clubpm-btn-primary" onClick={saveEdit} disabled={busy}>Save</button>
            </div>
          </div>
        ) : (
          message.isBot && message.blocks?.length > 0
            ? <ChatBlocks blocks={message.blocks} />
            : <ChatRichText tokens={message.tokens} />
        )}

        {message.files?.length > 0 && (
          <div className="cpm-chat-files">
            {message.files.map(f => <ChatFileAttachment key={f.id} file={f} />)}
          </div>
        )}

        {message.reactions?.length > 0 && (
          <div className="cpm-chat-reactions">
            {message.reactions.map(r => (
              <button
                key={r.emoji}
                type="button"
                className={`cpm-chat-reaction${r.mine ? " cpm-chat-reaction--mine" : ""}`}
                title={r.emoji}
                disabled={!canAct || busy}
                onClick={() => toggleReaction(r.name, r.mine)}
              >
                <ReactionFace name={r.name} url={r.url} />
                <label className="cpm-chat-reaction-count">{r.count}</label>
              </button>
            ))}
          </div>
        )}

        {message.replyCount > 0 && onOpenThread && (
          <button type="button" className="cpm-chat-thread-btn" onClick={() => onOpenThread(message.ts)}>
            <i className="fas fa-comments" aria-hidden="true" />
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {canAct && !editing && (
        <div className="cpm-chat-msg-actions" role="toolbar" aria-label="Message actions">
          <button type="button" title="Add reaction" aria-label="Add reaction" onClick={() => setPicker(p => !p)}>
            <i className="fas fa-face-smile" aria-hidden="true" />
          </button>
          {onOpenThread && !message.threadTs && (
            <button type="button" title="Reply in thread" aria-label="Reply in thread" onClick={() => onOpenThread(message.ts)}>
              <i className="fas fa-reply" aria-hidden="true" />
            </button>
          )}
          {mine && (
            <button type="button" title="Edit" aria-label="Edit" onClick={() => setEditing(decodeForEdit(message.tokens))}>
              <i className="fas fa-pen" aria-hidden="true" />
            </button>
          )}
          {mine && (
            <button type="button" title="Delete" aria-label="Delete" onClick={remove}>
              <i className="fas fa-trash-can" aria-hidden="true" />
            </button>
          )}
          {picker && (
            <div className="cpm-chat-react-picker">
              {QUICK_REACTIONS.map(n => (
                <button
                  key={n}
                  type="button"
                  title={`:${n}:`}
                  onClick={() => toggleReaction(n, message.reactions?.some(r => r.name === n && r.mine))}
                >
                  <ReactionFace name={n} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
