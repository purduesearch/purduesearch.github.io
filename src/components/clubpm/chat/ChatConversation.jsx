import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConversationMessages, searchConversation, markConversationRead,
} from "../../../api/clubPmClient";
import ChatMessage from "./ChatMessage";
import ChatThreadDrawer from "./ChatThreadDrawer";

// How close to the bottom (px) still counts as "reading the latest", so a live
// message keeps the view pinned instead of yanking someone reading history.
const PIN_THRESHOLD = 80;
// A read mark waits this long, so scrolling past a conversation doesn't clear it.
const READ_DEBOUNCE_MS = 1200;

function isPinnedEl(el) {
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD;
}
function pinToBottom(ref) {
  requestAnimationFrame(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  });
}

/**
 * One Slack conversation: paginated history, live updates, search, threads,
 * and read marking. Shared by the project Chat tab, /clubpm/chat, and DMs on
 * the Members page, so all three behave identically.
 *
 * `conversation` is the header from GET /api/chat/conversations/:id
 * ({ kind, canPost, isParticipant, ... }); null while it loads.
 */
export default function ChatConversation({
  channelId,
  conversation = null,
  initialThreadTs = null,
  emptyHint = null,
  onJoined = null,
  composerPlaceholder = "Message",
}) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [threadTs, setThreadTs] = useState(initialThreadTs);

  const scrollRef = useRef(null);
  const lastMarkedRef = useRef(null);
  const markTimerRef = useRef(null);

  useEffect(() => {
    setResults(null);
    setQuery("");
    setThreadTs(initialThreadTs);
    lastMarkedRef.current = null;
  }, [channelId, initialThreadTs]);

  // ── History ────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getConversationMessages(channelId);
      setMessages(data.messages ?? []);
      setHasMore(!!data.hasMore);
    } catch {
      setError("Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!loading) pinToBottom(scrollRef); }, [loading, channelId]);

  const loadOlder = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const data = await getConversationMessages(channelId, messages[0].ts);
      setMessages(prev => [...(data.messages ?? []), ...prev]);
      setHasMore(!!data.hasMore);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
    } catch {
      setError("Could not load older messages.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Silent refresh of the newest page. Keeps older pages the reader pulled in.
  const refreshLatest = useCallback(async (forcePin = false) => {
    if (!channelId) return;
    const wasPinned = forcePin || isPinnedEl(scrollRef.current);
    try {
      const data = await getConversationMessages(channelId);
      const latest = data.messages ?? [];
      const oldest = latest.length ? parseFloat(latest[0].ts) : Infinity;
      setMessages(prev => [...prev.filter(m => parseFloat(m.ts) < oldest), ...latest]);
      if (wasPinned) pinToBottom(scrollRef);
    } catch {
      // A missed live update is recovered by the next one or a reload.
    }
  }, [channelId]);

  // ── Live ───────────────────────────────────────────────────
  useEffect(() => {
    const onLive = (e) => {
      // Refetch rather than rebuild a DTO client-side: the server owns token
      // rendering, reaction shape, and reply counts.
      if (e.detail?.channelId === channelId) refreshLatest();
    };
    window.addEventListener("clubpm:slack-message", onLive);
    return () => window.removeEventListener("clubpm:slack-message", onLive);
  }, [channelId, refreshLatest]);

  // ── Read marking (D11) ─────────────────────────────────────
  // Only a participant has a read cursor, and only what is actually on screen
  // counts: tab visible, view pinned to the newest message, not in search.
  const newestTs = messages.length ? messages[messages.length - 1].ts : null;
  const isParticipant = !!conversation?.isParticipant;
  const scheduleMark = useCallback(() => {
    if (!isParticipant || !newestTs || results) return;
    if (document.visibilityState !== "visible" || !isPinnedEl(scrollRef.current)) return;
    if (lastMarkedRef.current === newestTs) return;
    clearTimeout(markTimerRef.current);
    markTimerRef.current = setTimeout(() => {
      lastMarkedRef.current = newestTs;
      markConversationRead(channelId, newestTs)
        .then(() => window.dispatchEvent(new CustomEvent("clubpm:conversation-read", { detail: { channelId } })))
        .catch(() => { lastMarkedRef.current = null; });
    }, READ_DEBOUNCE_MS);
  }, [channelId, isParticipant, newestTs, results]);

  useEffect(() => { scheduleMark(); }, [scheduleMark]);
  useEffect(() => {
    document.addEventListener("visibilitychange", scheduleMark);
    return () => {
      document.removeEventListener("visibilitychange", scheduleMark);
      clearTimeout(markTimerRef.current);
    };
  }, [scheduleMark]);

  // ── Search ─────────────────────────────────────────────────
  const runSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    try {
      const data = await searchConversation(channelId, q);
      setResults(data.messages ?? []);
    } catch {
      setError("Search failed.");
    }
  };

  const shown = results ?? messages;
  const canPost = !!conversation?.canPost;

  return (
    <div className="cpm-chat-conv">
      <div className="cpm-chat-toolbar">
        <form className="cpm-chat-search" onSubmit={runSearch}>
          <input
            type="search"
            placeholder="Search this conversation…"
            aria-label="Search this conversation"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!e.target.value) setResults(null); }}
          />
          <button type="submit" aria-label="Search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
          </button>
        </form>
      </div>

      {results && (
        <div className="cpm-chat-banner">
          {results.length} result{results.length === 1 ? "" : "s"} ·{" "}
          <button type="button" className="cpm-chat-linkbtn" onClick={() => { setResults(null); setQuery(""); }}>
            back to the conversation
          </button>
        </div>
      )}

      <div className="cpm-chat-layout">
        <div className="cpm-chat-main">
          <div className="cpm-chat-scroll" ref={scrollRef} onScroll={scheduleMark}>
            {loading && <div className="cpm-spinner" aria-label="Loading" />}
            {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}

            {!loading && !results && hasMore && (
              <button type="button" className="cpm-chat-older" onClick={loadOlder} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load older messages"}
              </button>
            )}

            {!loading && shown.length === 0 && !error && (
              <div className="cpm-chat-empty">
                <div>{emptyHint ?? "Nothing here yet."}</div>
              </div>
            )}

            {shown.map(m => (
              <ChatMessage
                key={m.id}
                message={m}
                channelId={channelId}
                canPost={canPost}
                onOpenThread={setThreadTs}
                onChanged={() => refreshLatest()}
              />
            ))}
          </div>
        </div>

        {threadTs && (
          <ChatThreadDrawer
            channelId={channelId}
            ts={threadTs}
            conversation={conversation}
            onClose={() => setThreadTs(null)}
          />
        )}
      </div>
    </div>
  );
}
