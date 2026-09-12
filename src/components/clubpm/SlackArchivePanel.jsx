import { useCallback, useEffect, useState } from "react";
import { getSlackArchiveHealth, retryFailedSlackMirrors, backfillPublicChannels } from "../../api/clubPmClient";

const LABELS = {
  SLACK_ONLY:    "Still in Slack",
  DRIVE:         "Mirrored to Drive",
  LOCAL:         "Mirrored to local disk",
  MIRROR_FAILED: "Mirror failed",
  UNAVAILABLE:   "Expired before archiving",
};

export default function SlackArchivePanel() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [retryNote, setRetryNote] = useState(null);
  const [publicNote, setPublicNote] = useState(null);

  const load = useCallback(() => {
    return getSlackArchiveHealth().then(setHealth).catch(() => setError("Could not load archive health."));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function retry() {
    setRetrying(true);
    setRetryNote(null);
    try {
      const { requeued } = await retryFailedSlackMirrors();
      setRetryNote({
        ok: true,
        text: `Requeued ${requeued} attachment${requeued === 1 ? "" : "s"}. Mirroring is running in the ` +
          "background — reload this page in a minute to see the result. Each one gets three fresh " +
          "attempts before it is flagged again.",
      });
      await load();
    } catch {
      setRetryNote({ ok: false, text: "Could not requeue the failed mirrors." });
    } finally {
      setRetrying(false);
    }
  }

  async function backfillPublic() {
    setPublicNote(null);
    try {
      await backfillPublicChannels();
      setPublicNote({ ok: true, text: "Joining every public channel and importing its history in the background. This can take a while on a large workspace." });
    } catch {
      setPublicNote({ ok: false, text: "Could not start the public-channel import." });
    }
  }

  if (error) {
    return (
      <div className="cpm-profile-card">
        <h3 style={{ marginTop: 0 }}>Slack archive</h3>
        <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>
      </div>
    );
  }
  if (!health) return null;

  const counts = health.counts ?? {};
  const pending = counts.SLACK_ONLY ?? 0;
  const failed = counts.MIRROR_FAILED ?? 0;
  const local = counts.LOCAL ?? 0;

  return (
    <div className="cpm-profile-card">
      <h3 style={{ marginTop: 0 }}>Slack archive</h3>

      {/* The sweep falls back to disk rather than failing, so a disconnected
          Drive is easy to miss until files start expiring. Say it loudly. */}
      {!health.driveConnected && pending > 0 && (
        <div className="cpm-chat-banner cpm-chat-banner--error" style={{ marginBottom: 12 }}>
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
          Google Drive is not connected. {pending} attachment{pending === 1 ? "" : "s"} will be
          mirrored to local disk instead of Drive.
        </div>
      )}
      {/* MIRROR_FAILED is not a resting state. The sweep only picks up
          SLACK_ONLY rows, so these are never retried on their own — they are
          served from Slack until Slack's ~90-day boundary, then lost. The
          60-day cutoff leaves roughly 30 days to fix the cause and hit Retry. */}
      {failed > 0 && (
        <div className="cpm-chat-banner cpm-chat-banner--error" style={{ marginBottom: 12 }}>
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
          {failed} attachment{failed === 1 ? "" : "s"} failed to mirror after repeated attempts
          and will not be retried automatically. {failed === 1 ? "It is" : "They are"} still
          served from Slack, but will be lost when Slack expires {failed === 1 ? "it" : "them"} (~90
          days after posting). Check the backend logs for the mirror error, fix the cause, then retry.
          <div style={{ marginTop: 8 }}>
            <button type="button" className="cpm-chat-backfill-btn" onClick={retry} disabled={retrying}>
              <i className="fas fa-rotate-right" aria-hidden="true" />
              {retrying ? "Requeuing…" : `Retry ${failed} failed mirror${failed === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
      {retryNote && (
        <div
          className={`cpm-chat-banner${retryNote.ok ? "" : " cpm-chat-banner--error"}`}
          style={{ marginBottom: 12 }}
          role="status"
        >
          {retryNote.text}
        </div>
      )}
      {local > 0 && (
        <div className="cpm-chat-banner" style={{ marginBottom: 12 }}>
          {local} attachment{local === 1 ? " is" : "s are"} stored on the server's disk. Private channels
          and DMs always are — they never go to the shared Drive — plus any public-channel files from a
          period when Drive was unavailable.
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <button type="button" className="cpm-chat-backfill-btn" onClick={backfillPublic}>
          <i className="fas fa-clock-rotate-left" aria-hidden="true" /> Import all public channels
        </button>
      </div>
      {publicNote && (
        <div className={`cpm-chat-banner${publicNote.ok ? "" : " cpm-chat-banner--error"}`} style={{ marginBottom: 12 }} role="status">
          {publicNote.text}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {Object.entries(LABELS).map(([key, label]) => {
          const n = counts[key] ?? 0;
          const alarm = key === "MIRROR_FAILED" && n > 0;
          return (
            <div
              key={key}
              className="cpm-card"
              style={{
                padding: "10px 14px",
                minWidth: 150,
                ...(alarm && { borderColor: "var(--pm-accent-coral)" }),
              }}
            >
              <div style={{
                fontSize: 20, fontWeight: 700,
                color: alarm ? "var(--pm-accent-coral)" : "var(--pm-text-primary)",
              }}>
                {n}
              </div>
              <div style={{ fontSize: 12, color: alarm ? "var(--pm-accent-coral)" : "var(--pm-text-muted)" }}>
                {alarm && <i className="fas fa-triangle-exclamation" aria-hidden="true" style={{ marginRight: 4 }} />}
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
