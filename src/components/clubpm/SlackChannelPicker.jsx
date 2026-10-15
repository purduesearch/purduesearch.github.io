import React, { useEffect, useMemo, useRef, useState } from "react";
import { get, post, patch } from "../../api/clubPmClient";

export default function SlackChannelPicker({ project, onSaved }) {
  const [channels, setSlackChannels] = useState([]);
  const [channelsState, setSlackChannelsState] = useState({ loaded: false });
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(project.slackChannelId ?? "");

  useEffect(() => {
    setSelected(project.slackChannelId ?? "");
  }, [project.slackChannelId]);

  useEffect(() => {
    // Never swallow this. When it failed silently, the picker rendered an empty
    // dropdown with no explanation anywhere — the bug that hid a broken token
    // path for weeks.
    get("/api/slack/channels")
      .then(data => {
        // Response is { channels, needsSlackAuth, warning }; tolerate the older
        // bare-array shape while a stale backend is still deployed.
        if (Array.isArray(data)) {
          setSlackChannels(data);
          setSlackChannelsState({ loaded: true, error: "", warning: "", needsAuth: false });
          return;
        }
        setSlackChannels(data?.channels ?? []);
        setSlackChannelsState({
          loaded: true,
          error: "",
          warning: data?.warning ?? "",
          needsAuth: !!data?.needsSlackAuth,
        });
      })
      .catch(err => {
        console.error("Failed to load Slack channels", err);
        setSlackChannels([]);
        setSlackChannelsState({
          loaded: true,
          error: err?.message ?? "Could not load Slack channels",
          warning: "",
          needsAuth: true,
        });
      });
  }, []);

  const { loaded, error: loadError, warning, needsAuth } = channelsState ?? {};

  // The linked channel may not be in the list the current viewer can see (e.g.
  // a private channel linked by someone else). Show it anyway so the picker
  // never renders blank for a project that IS linked.
  const options = useMemo(() => {
    const list = [...channels];
    if (project.slackChannelId && !list.some(c => c.id === project.slackChannelId)) {
      list.unshift({
        id: project.slackChannelId,
        name: project.slackChannelName ?? "linked channel",
        botIsMember: true,
      });
    }
    return list;
  }, [channels, project.slackChannelId, project.slackChannelName]);

  const handleChange = async (e) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const channelId = e.target.value;
    const ch = options.find(c => c.id === channelId);
    setSelected(channelId);
    setError("");
    setSaving(true);
    try {
      if (channelId && ch && ch.botIsMember === false) {
        setStatus("Inviting bot…");
        try {
          await post(`/api/slack/channels/${channelId}/invite-bot`, {});
        } catch (inviteErr) {
          const code = inviteErr?.message ?? "unknown_error";
          setError(`Could not invite bot (${code}). Run \`/invite @Constellation\` in #${ch.name} then retry.`);
          setSelected(project.slackChannelId ?? "");
          return;
        }
      }
      setStatus("Saving…");
      await patch(`/api/projects/${project.id}`, {
        slackChannelId:   channelId || null,
        slackChannelName: ch?.name  || null,
      });
      await onSaved();
    } catch (err) {
      console.error("Failed to save linked channel", err);
      setError(err?.message ?? "Failed to save linked channel");
      setSelected(project.slackChannelId ?? "");
    } finally {
      inFlight.current = false;
      setSaving(false);
      setStatus("");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <i className="fab fa-slack" style={{ fontSize: 12, color: "var(--clubpm-text-muted)" }} />
        <select
          aria-label="Slack channel"
          value={selected}
          onChange={handleChange}
          disabled={saving}
          style={{
            fontSize: 11,
            padding: "3px 6px",
            borderRadius: 5,
            background: "var(--clubpm-surface-300)",
            border: "1px solid var(--clubpm-border)",
            color: selected ? "var(--clubpm-text-primary)" : "var(--clubpm-text-muted)",
            cursor: "pointer",
          }}
        >
          <option value="">
            {!loaded ? "Loading channels…" : "— Link Slack channel —"}
          </option>
          {options.map(ch => (
            <option key={ch.id} value={ch.id}>
              #{ch.name}{ch.botIsMember === false ? " (bot not in channel)" : ""}
            </option>
          ))}
        </select>
        {saving && <span style={{ fontSize: 10, color: "var(--clubpm-text-muted)" }}>{status}</span>}
      </div>
      {error && (
        <span style={{ fontSize: 10, color: "var(--clubpm-accent-danger, #e06c75)" }}>{error}</span>
      )}
      {!error && loaded && loadError && (
        <span style={{ fontSize: 10, color: "var(--clubpm-accent-danger, #e06c75)" }}>
          {loadError}
        </span>
      )}
      {!error && loaded && !loadError && warning && (
        <span style={{ fontSize: 10, color: "var(--pm-accent-amber)" }}>{warning}</span>
      )}
      {loaded && needsAuth && (
        <a
          href={
            `${process.env.REACT_APP_API_URL || ""}/auth/slack` +
            `?returnTo=${encodeURIComponent(`/clubpm/projects/${project.id}`)}`
          }
          style={{ fontSize: 10, color: "var(--pm-accent-teal)" }}
        >
          Reconnect Slack
        </a>
      )}
    </div>
  );
}

