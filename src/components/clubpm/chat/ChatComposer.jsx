import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { get, apiBaseUrl, sendChatMessage, uploadChatFile, joinConversation } from "../../../api/clubPmClient";
import { useClubPmAuth } from "../../../clubpm/ClubPmAuth";
import { encodeOutgoing } from "./encodeOutgoing";

// One roster fetch per page load, shared by every composer on the page.
let rosterPromise = null;
const drafts = new Map();
function loadRoster() {
  if (!rosterPromise) {
    rosterPromise = get("/api/members").catch(() => {
      rosterPromise = null;
      return [];
    });
  }
  return rosterPromise;
}

/** Sign in with Slack again (for the portal scopes) and come back to this page. */
export function reconnectHref() {
  const back = window.location.pathname + window.location.search;
  return `${apiBaseUrl}/auth/slack?returnTo=${encodeURIComponent(back)}`;
}

/** Shown wherever a portal feature needs scopes the member hasn't granted yet. */
export function SlackReconnectNotice({ compact = false }) {
  return (
    <div className={`cpm-chat-reconnect${compact ? " cpm-chat-reconnect--compact" : ""}`}>
      <div><b>Connect Slack to send and read DMs from Constellation.</b></div>
      <div className="cpm-chat-reconnect-sub">
        Constellation archives your Slack DMs so you can read them here. Only the people in each
        conversation can see them — admins can't.
      </div>
      <a className="clubpm-btn-primary cpm-chat-reconnect-btn" href={reconnectHref()}>
        <i className="fab fa-slack" aria-hidden="true" /> Connect Slack
      </a>
    </div>
  );
}

export default function ChatComposer({
  channelId,
  conversation,
  threadTs = null,
  placeholder = "Message",
  onSent = null,
  onJoined = null,
}) {
  const { member } = useClubPmAuth();
  const caps = member?.slackCapabilities ?? {};

  const [text, setText] = useState("");
  const [mentions, setMentions] = useState({});
  const [sending, setSending] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [roster, setRoster] = useState([]);
  const [suggest, setSuggest] = useState(null); // { query, start }
  const [highlight, setHighlight] = useState(0);
  const [failed, setFailed] = useState(null);
  const areaRef = useRef(null);
  const fileRef = useRef(null);
  const sendingRef = useRef(false);
  const draftKey = `${channelId}:${threadTs ?? "main"}`;

  useEffect(() => {
    let alive = true;
    loadRoster().then(r => { if (alive) setRoster(Array.isArray(r) ? r : []); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const draft = drafts.get(draftKey);
    setText(draft?.text ?? "");
    setMentions(draft?.mentions ?? {});
    setSuggest(null);
    setFailed(draft?.failed ?? null);
  }, [draftKey]);

  const myId = member?.id;
  const matches = useMemo(() => {
    if (!suggest) return [];
    const q = suggest.query.toLowerCase();
    return roster
      .filter(m => m.id !== myId && (m.displayName?.toLowerCase().includes(q) || m.slackHandle?.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [suggest, roster, myId]);

  // HTTP 409 means exactly "reconnect Slack" (plan Task 11).
  const handleError = (err) => {
    if (err?.status === 409) setNeedsReconnect(true);
    else toast.error(err?.message || "Could not send to Slack.");
  };

  const join = async () => {
    setSending(true);
    try {
      await joinConversation(channelId);
      onJoined?.();
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  };

  const onChange = (e) => {
    const value = e.target.value;
    setText(value);
    const retainedFailure = failed?.kind === "file" ? failed : null;
    setFailed(retainedFailure);
    if (value || retainedFailure) drafts.set(draftKey, { text: value, mentions, failed: retainedFailure });
    else drafts.delete(draftKey);
    const caret = e.target.selectionStart ?? value.length;
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setSuggest(m ? { query: m[2], start: caret - m[2].length - 1 } : null);
    setHighlight(0);
  };

  const pick = (person) => {
    const el = areaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, suggest.start);
    const after = text.slice(caret);
    const label = person.displayName;
    const nextText = `${before}@${label} ${after}`;
    const nextMentions = { ...mentions, [label]: person.slackId };
    setText(nextText);
    drafts.set(draftKey, { text: nextText, mentions: nextMentions, failed });
    setMentions(nextMentions);
    setSuggest(null);
    const pos = before.length + label.length + 2;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos); });
  };

  const sendMessage = async (encoded, displayText) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setFailed(null);
    setSending(true);
    try {
      const res = await sendChatMessage(channelId, { text: encoded, threadTs: threadTs ?? undefined });
      setText("");
      drafts.delete(draftKey);
      setMentions({});
      onSent?.(res?.ts ?? null);
    } catch (err) {
      handleError(err);
      const failure = { kind: "message", encoded, displayText, message: err?.message || "Could not send this message." };
      setFailed(failure);
      drafts.set(draftKey, { text, mentions, failed: failure });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || sendingRef.current) return;
    await sendMessage(encodeOutgoing(body, mentions), body);
  };

  const onKeyDown = (e) => {
    if (suggest && matches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => (h + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[highlight]); return; }
      if (e.key === "Escape") { setSuggest(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const uploadFile = async (file, options, displayText = text) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setFailed(null);
    setSending(true);
    try {
      await uploadChatFile(channelId, file, options);
      const draft = drafts.get(draftKey);
      if ((draft?.text ?? "").trim() === displayText.trim()) {
        setText("");
        drafts.delete(draftKey);
        setMentions({});
      } else if (draft) {
        drafts.set(draftKey, { ...draft, failed: null });
      }
      toast.success("Uploaded — it appears here once Slack shares it.");
      onSent?.(null);
    } catch (err) {
      handleError(err);
      const failure = { kind: "file", file, options, displayText, message: err?.message || `Could not upload ${file.name}.` };
      setFailed(failure);
      drafts.set(draftKey, { text, mentions, failed: failure });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!caps.files) { setNeedsReconnect(true); return; }
    const body = text.trim();
    await uploadFile(file, {
      threadTs: threadTs ?? undefined,
      comment: body ? encodeOutgoing(body, mentions) : undefined,
    });
  };

  const retry = () => {
    if (!failed) return;
    if (failed.kind === "file") uploadFile(failed.file, failed.options, failed.displayText);
    else sendMessage(failed.encoded, failed.displayText);
  };

  if (!conversation) return null;
  if (!caps.post || needsReconnect) return <SlackReconnectNotice compact={!!threadTs} />;
  if (!conversation.canPost) {
    if (conversation.kind !== "CHANNEL") return null;
    return (
      <div className="cpm-chat-join">
        <label className="cpm-chat-plain">You're previewing this channel.</label>
        <button type="button" className="clubpm-btn-primary" onClick={join} disabled={sending}>
          <i className="fas fa-right-to-bracket" aria-hidden="true" /> Join channel
        </button>
      </div>
    );
  }

  return (
    <div className={`cpm-chat-composer${failed ? " cpm-chat-composer--failed" : ""}`}>
      {failed && (
        <div className="cpm-chat-send-error" role="alert">
          <div>{failed.message}</div>
          <button type="button" className="cpm-chat-linkbtn" onClick={retry} disabled={sending}>Retry</button>
        </div>
      )}
      {suggest && matches.length > 0 && (
        <div className="cpm-chat-suggest" role="listbox" aria-label="Mention someone">
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              className={`cpm-chat-suggest-item${i === highlight ? " active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
            >
              <b>{m.displayName}</b>
              {m.slackHandle && <label className="cpm-chat-plain cpm-chat-suggest-handle">@{m.slackHandle}</label>}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="cpm-chat-composer-btn"
        title="Attach a file"
        aria-label="Attach a file"
        onClick={() => fileRef.current?.click()}
        disabled={sending}
      >
        <i className="fas fa-paperclip" aria-hidden="true" />
      </button>
      <input ref={fileRef} type="file" aria-label="Choose attachment" hidden onChange={onFile} />
      <textarea
        ref={areaRef}
        className="cpm-chat-composer-input"
        rows={Math.min(6, Math.max(1, text.split("\n").length))}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setSuggest(null), 150)}
        disabled={sending}
      />
      <button
        type="button"
        className="cpm-chat-composer-send"
        onClick={submit}
        disabled={sending || !text.trim()}
        aria-label="Send"
      >
        <i className="fas fa-paper-plane" aria-hidden="true" />
      </button>
    </div>
  );
}
