import { useCallback, useEffect, useRef, useState } from "react";
import {
  getChatChannels, getChatMessages, searchChat,
  startChatBackfill, getChatBackfillStatus,
} from "../../../api/clubPmClient";
import ChatMessage from "./ChatMessage";
import ChatThreadDrawer from "./ChatThreadDrawer";

// How close to the bottom (px) still counts as "reading the latest", so a live
// message keeps the view pinned instead of yanking someone reading history.
const PIN_THRESHOLD = 80;

export default function ChatTab({ project, isAdmin }) {
  const projectId = project?.id;

  const [channels, setChannels] = useState([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [channelId, setChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [threadTs, setThreadTs] = useState(null);
  const [backfill, setBackfill] = useState(null);

  const scrollRef = useRef(null);
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // ── Channels ───────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setChannelsLoaded(false);
    getChatChannels(projectId)
      .then(data => {
        if (cancelled) return;
        const list = data.channels ?? [];
        setChannels(list);
        // Keep the current channel only if it belongs to this project.
        setChannelId(prev =>
          list.some(c => c.slackChannelId === prev) ? prev : list[0]?.slackChannelId ?? null
        );
      })
      .catch(() => { if (!cancelled) setError("Could not load channels."); })
      .finally(() => { if (!cancelled) setChannelsLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId]);

  // ── Messages ───────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!projectId || !channelId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await getChatMessages(projectId, channelId);
      setMessages(data.messages ?? []);
      setHasMore(!!data.hasMore);
    } catch {
      setError("Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [projectId, channelId]);

  useEffect(() => { load(); }, [load]);

  // Pin to the newest message after a fresh channel load.
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading, channelId]);

  const loadOlder = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const data = await getChatMessages(projectId, channelId, messages[0].ts);
      setMessages(prev => [...(data.messages ?? []), ...prev]);
      setHasMore(!!data.hasMore);
      // Keep the reading position steady after prepending older messages.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch {
      setError("Could not load older messages.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Silent refresh of the newest page for live events. Unlike load(), it does
  // not flash the spinner or discard older pages the reader already pulled in.
  const refreshLatest = useCallback(async () => {
    if (!projectId || !channelId) return;
    const el = scrollRef.current;
    const wasPinned = !el || el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD;
    try {
      const data = await getChatMessages(projectId, channelId);
      const latest = data.messages ?? [];
      const oldest = latest.length ? parseFloat(latest[0].ts) : Infinity;
      setMessages(prev => [...prev.filter(m => parseFloat(m.ts) < oldest), ...latest]);
      if (wasPinned) {
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      }
    } catch {
      // A missed live update is recovered by the next one or a reload.
    }
  }, [projectId, channelId]);

  // ── Live append ────────────────────────────────────────────
  useEffect(() => {
    if (!channelId) return;
    const onLive = (e) => {
      if (e.detail?.channelId !== channelId) return;
      // Refetch rather than reconstructing a DTO client-side: the server owns
      // token rendering, reaction shape, and reply counts.
      refreshLatest();
    };
    window.addEventListener("clubpm:slack-message", onLive);
    return () => window.removeEventListener("clubpm:slack-message", onLive);
  }, [channelId, refreshLatest]);

  // ── Search ─────────────────────────────────────────────────
  const runSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    try {
      const data = await searchChat(projectId, channelId, q);
      setResults(data.messages ?? []);
    } catch {
      setError("Search failed.");
    }
  };

  // ── Backfill ───────────────────────────────────────────────
  // The poll belongs to one channel; stop it on channel switch and unmount.
  const activeChannelRef = useRef(null);
  useEffect(() => {
    activeChannelRef.current = channelId;
    setBackfill(null);
    return () => {
      activeChannelRef.current = null;
      clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [channelId]);

  const runBackfill = async () => {
    if (!channelId || backfill?.status === "RUNNING") return;
    const target = channelId;
    stopPolling();
    setBackfill({ status: "RUNNING" });
    try {
      await startChatBackfill(projectId, target);
      // Switched channel (or unmounted) while the request was in flight.
      if (activeChannelRef.current !== target) return;
      pollRef.current = setInterval(async () => {
        try {
          const s = await getChatBackfillStatus(projectId, target);
          setBackfill(s);
          if (s.status === "COMPLETE" || s.status === "FAILED") {
            stopPolling();
            load();
          }
        } catch {
          stopPolling();
          setBackfill({ status: "FAILED", error: "Lost track of the import — reload to check its status." });
        }
      }, 3000);
    } catch {
      setBackfill({ status: "FAILED", error: "Could not start backfill." });
    }
  };

  if (channelsLoaded && channels.length === 0 && !error) {
    return (
      <div className="cpm-chat-empty">
        <i className="fab fa-slack" aria-hidden="true" />
        <div>No Slack channel is linked to this project yet.</div>
        <div className="cpm-chat-empty-sub">Link one from the project settings to start archiving.</div>
      </div>
    );
  }

  const shown = results ?? messages;

  return (
    <div className="cpm-chat-wrap">
      <div className="cpm-chat-toolbar">
        <select
          className="cpm-chat-channel-select"
          aria-label="Slack channel"
          value={channelId ?? ""}
          onChange={e => { setChannelId(e.target.value); setResults(null); setThreadTs(null); }}
        >
          {channels.map(c => (
            <option key={c.slackChannelId} value={c.slackChannelId}>
              #{c.name} ({c.messageCount})
            </option>
          ))}
        </select>

        <form className="cpm-chat-search" onSubmit={runSearch}>
          <input
            type="search"
            placeholder="Search this channel…"
            aria-label="Search this channel"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!e.target.value) setResults(null); }}
          />
          <button type="submit" aria-label="Search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
          </button>
        </form>

        {isAdmin && (
          <button
            type="button"
            className="cpm-chat-backfill-btn"
            onClick={runBackfill}
            disabled={!channelId || backfill?.status === "RUNNING"}
          >
            <i className="fas fa-clock-rotate-left" aria-hidden="true" />
            {backfill?.status === "RUNNING" ? "Importing…" : "Import history"}
          </button>
        )}
      </div>

      {backfill?.status === "FAILED" && (
        <div className="cpm-chat-banner cpm-chat-banner--error">
          History import failed{backfill.error ? `: ${backfill.error}` : "."}
        </div>
      )}
      {results && (
        <div className="cpm-chat-banner">
          {results.length} result{results.length === 1 ? "" : "s"} ·{" "}
          <button type="button" className="cpm-chat-linkbtn" onClick={() => { setResults(null); setQuery(""); }}>
            back to the conversation
          </button>
        </div>
      )}

      <div className="cpm-chat-layout">
        <div className="cpm-chat-scroll" ref={scrollRef}>
          {loading && <div className="cpm-spinner" aria-label="Loading" />}
          {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}

          {!loading && !results && hasMore && (
            <button type="button" className="cpm-chat-older" onClick={loadOlder} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load older messages"}
            </button>
          )}

          {!loading && shown.length === 0 && !error && (
            <div className="cpm-chat-empty">
              <div>Nothing archived here yet.</div>
              {isAdmin && <div className="cpm-chat-empty-sub">Use “Import history” to pull in what Slack still has.</div>}
            </div>
          )}

          {shown.map(m => (
            <ChatMessage
              key={m.id}
              message={m}
              projectId={projectId}
              onOpenThread={setThreadTs}
            />
          ))}
        </div>

        {threadTs && (
          <ChatThreadDrawer
            projectId={projectId}
            channelId={channelId}
            ts={threadTs}
            onClose={() => setThreadTs(null)}
          />
        )}
      </div>
    </div>
  );
}
