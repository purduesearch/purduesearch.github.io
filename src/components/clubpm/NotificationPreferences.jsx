import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { get, patch } from '../../api/clubPmClient';

// ── Constants ────────────────────────────────────────────────

const DIGEST_OPTIONS = [
  { key: 'daily_reminders',  label: 'Daily reminders (overdue + due today)' },
  { key: 'weekly_digest',    label: 'Monday weekly digest' },
  { key: 'project_updates',  label: 'Project health summaries' },
  { key: 'standup_prompts',  label: 'Daily standup prompts (weekdays)' },
];

const CHANNEL_OPTIONS = [
  { value: 'both',      label: 'Both' },
  { value: 'dashboard', label: 'Dashboard only' },
  { value: 'slack',     label: 'Slack DM' },
  { value: 'off',       label: 'Off' },
];

const EVENT_TYPES = [
  { key: 'TASK_ASSIGNED',       label: 'Task assigned to me' },
  { key: 'TASK_COMPLETED',      label: 'Task completed' },
  { key: 'TASK_COMMENTED',      label: 'New comment on my tasks' },
  { key: 'TASK_MENTIONED',      label: 'Mentioned in a comment' },
  { key: 'COMMENT_REPLY',       label: 'Reply to my comment' },
  { key: 'PROJECT_UPDATE',      label: 'Project update posted' },
  { key: 'MILESTONE_COMPLETED', label: 'Milestone completed' },
];

// ── Component ────────────────────────────────────────────────

export default function NotificationPreferences() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  // Form state
  const [notificationPrefs, setNotificationPrefs]       = useState([]);
  const [notificationChannels, setNotificationChannels] = useState({});
  const [quietEnabled, setQuietEnabled]                 = useState(false);
  const [quietStart, setQuietStart]                     = useState(22);
  const [quietEnd, setQuietEnd]                         = useState(8);

  // Load from /auth/me on mount
  useEffect(() => {
    get('/auth/me')
      .then(member => {
        setNotificationPrefs(member.notificationPrefs ?? []);
        setNotificationChannels(member.notificationChannels ?? {});
        const hasQuiet = member.quietHoursStart != null && member.quietHoursEnd != null;
        setQuietEnabled(hasQuiet);
        if (hasQuiet) {
          setQuietStart(member.quietHoursStart);
          setQuietEnd(member.quietHoursEnd);
        }
      })
      .catch(err => setError(err.message ?? 'Failed to load preferences'))
      .finally(() => setLoading(false));
  }, []);

  // Digest checkbox handler
  function toggleDigest(key) {
    setNotificationPrefs(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  // Channel select handler
  function setChannel(eventType, value) {
    setNotificationChannels(prev => ({ ...prev, [eventType]: value }));
  }

  function getChannel(eventType) {
    return notificationChannels[eventType] ?? 'both';
  }

  // Save handler
  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Send null explicitly when disabling quiet hours so Prisma clears the Int? fields
    const payload = {
      notificationPrefs,
      notificationChannels,
      quietHoursStart: quietEnabled ? Number(quietStart) : null,
      quietHoursEnd:   quietEnabled ? Number(quietEnd)   : null,
    };

    try {
      await patch('/api/members/me/notification-preferences', payload);
      toast.success('Notification preferences saved');
    } catch (err) {
      const msg = err.message ?? 'Failed to save preferences';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="pm-prefs-page">
        <div className="pm-spinner-wrap"><div className="pm-spinner" /></div>
      </div>
    );
  }

  return (
    <div className="pm-prefs-page">
      <h1 className="pm-page-title" style={{ marginBottom: 24 }}>Notification Preferences</h1>

      <form onSubmit={handleSave}>

        {/* ── Section 1: Scheduled Digests ────────────────── */}
        <div className="pm-prefs-section">
          <div className="pm-prefs-section-title">Scheduled digests</div>
          <div className="pm-prefs-section-body">
            {DIGEST_OPTIONS.map(({ key, label }) => (
              <label key={key} className="pm-prefs-row pm-prefs-row--check">
                <input
                  type="checkbox"
                  className="pm-prefs-checkbox"
                  checked={notificationPrefs.includes(key)}
                  onChange={() => toggleDigest(key)}
                />
                <span className="pm-prefs-label">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ── Section 2: Per-event delivery channel ───────── */}
        <div className="pm-prefs-section">
          <div className="pm-prefs-section-title">Delivery channel per event</div>
          <div className="pm-prefs-section-body">
            {EVENT_TYPES.map(({ key, label }) => (
              <div key={key} className="pm-prefs-row">
                <span className="pm-prefs-label">{label}</span>
                <select
                  className="pm-prefs-select"
                  value={getChannel(key)}
                  onChange={e => setChannel(key, e.target.value)}
                >
                  {CHANNEL_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 3: Quiet hours ───────────────────────── */}
        <div className="pm-prefs-section">
          <div className="pm-prefs-section-title">Quiet hours</div>
          <div className="pm-prefs-section-body">
            <label className="pm-prefs-row pm-prefs-row--check">
              <input
                type="checkbox"
                className="pm-prefs-checkbox"
                checked={quietEnabled}
                onChange={e => setQuietEnabled(e.target.checked)}
              />
              <span className="pm-prefs-label">Enable quiet hours (suppress notifications)</span>
            </label>

            {quietEnabled && (
              <div className="pm-prefs-quiet-inputs">
                <div className="pm-prefs-row">
                  <span className="pm-prefs-label">Start hour (0–23)</span>
                  <input
                    type="number"
                    className="pm-prefs-number"
                    min={0}
                    max={23}
                    value={quietStart}
                    onChange={e => setQuietStart(e.target.value)}
                  />
                </div>
                <div className="pm-prefs-row">
                  <span className="pm-prefs-label">End hour (0–23)</span>
                  <input
                    type="number"
                    className="pm-prefs-number"
                    min={0}
                    max={23}
                    value={quietEnd}
                    onChange={e => setQuietEnd(e.target.value)}
                  />
                </div>
                <p className="pm-prefs-hint">
                  Notifications will be suppressed from {quietStart}:00 to {quietEnd}:00 (your local time).
                </p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p style={{ color: 'var(--pm-accent-coral)', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <div className="pm-prefs-save-row">
          <button
            type="submit"
            className="pm-prefs-save-btn"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </form>
    </div>
  );
}
