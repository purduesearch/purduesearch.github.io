import { useCallback, useEffect, useRef, useState } from "react";
import {
  getChatChannels, getConversation, startChatBackfill, getChatBackfillStatus,
} from "../../../api/clubPmClient";
import ChatConversation from "./ChatConversation";

/**
 * The project Chat tab: a picker over the project's linked channels (already
 * filtered server-side to what Slack lets this member see, D3), the admin
 * history import, and the shared conversation view.
 */
export default function ChatTab({ project, isAdmin, initialChannelId = null, initialThreadTs = null }) {
  const projectId = project?.id;

  const [channels, setChannels] = useState([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [channelId, setChannelId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState(null);
  const [backfill, setBackfill] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const pollRef = useRef(null);
  const activeChannelRef = useRef(null);

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
        setChannelId(prev => {
          if (list.some(c => c.slackChannelId === prev)) return prev;
          if (initialChannelId && list.some(c => c.slackChannelId === initialChannelId)) return initialChannelId;
          return list[0]?.slackChannelId ?? null;
        });
      })
      .catch(() => { if (!cancelled) setError("Could not load channels."); })
      .finally(() => { if (!cancelled) setChannelsLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId, initialChannelId]);

  // ── Header: canPost / isParticipant for the selected channel ──
  const loadConversation = useCallback(() => {
    if (!channelId) { setConversation(null); return; }
    getConversation(channelId).then(setConversation).catch(() => setConversation(null));
  }, [channelId]);

  useEffect(() => { loadConversation(); }, [loadConversation]);
  useEffect(() => {
    const onMembership = (e) => { if (e.detail?.channelId === channelId) loadConversation(); };
    window.addEventListener("clubpm:slack-membership", onMembership);
    return () => window.removeEventListener("clubpm:slack-membership", onMembership);
  }, [channelId, loadConversation]);

  // ── Backfill ───────────────────────────────────────────────
  // The poll belongs to one channel; stop it on channel switch and unmount.
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
      if (activeChannelRef.current !== target) return;
      pollRef.current = setInterval(async () => {
        try {
          const s = await getChatBackfillStatus(projectId, target);
          setBackfill(s);
          if (s.status === "COMPLETE" || s.status === "FAILED") {
            stopPolling();
            setReloadKey(k => k + 1);
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
        <div>No Slack channel you can see is linked to this project.</div>
        <div className="cpm-chat-empty-sub">Link one from the project settings, or ask to be added to its private channel in Slack.</div>
      </div>
    );
  }

  return (
    <div className="cpm-chat-wrap">
      <div className="cpm-chat-toolbar">
        <select
          className="cpm-chat-channel-select"
          aria-label="Slack channel"
          value={channelId ?? ""}
          onChange={e => setChannelId(e.target.value)}
        >
          {channels.map(c => (
            <option key={c.slackChannelId} value={c.slackChannelId}>
              #{c.name} ({c.messageCount})
            </option>
          ))}
        </select>

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

      {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}
      {backfill?.status === "FAILED" && (
        <div className="cpm-chat-banner cpm-chat-banner--error">
          History import failed{backfill.error ? `: ${backfill.error}` : "."}
        </div>
      )}

      {channelId && (
        <ChatConversation
          key={`${channelId}:${reloadKey}`}
          channelId={channelId}
          conversation={conversation}
          initialThreadTs={channelId === initialChannelId ? initialThreadTs : null}
          emptyHint={isAdmin ? "Nothing archived here yet — use “Import history” to pull in what Slack still has." : "Nothing archived here yet."}
          onJoined={loadConversation}
        />
      )}
    </div>
  );
}
