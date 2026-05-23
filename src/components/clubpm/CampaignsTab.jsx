import React, { useState, useEffect, useCallback } from 'react';
import { get, post, patch, del } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────

const GOAL_TYPES = [
  { value: 'RECRUITMENT',  label: 'Recruitment' },
  { value: 'SPONSORSHIP',  label: 'Sponsorship' },
  { value: 'EVENT',        label: 'Event' },
  { value: 'AWARENESS',    label: 'Awareness' },
];

const GOAL_TYPE_META = {
  RECRUITMENT: { icon: 'fas fa-user-plus',  color: '#a29bfe' },
  SPONSORSHIP: { icon: 'fas fa-handshake',  color: '#fdcb6e' },
  EVENT:       { icon: 'fas fa-calendar-star', color: '#fd79a8' },
  AWARENESS:   { icon: 'fas fa-bullhorn',   color: 'var(--pm-accent-teal)' },
};

const STATUS_SUBMISSION_LABELS = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted', IN_REVIEW: 'In Review',
  APPROVED: 'Approved', PUBLISHED: 'Published',
};

// ── GoalRing — SVG progress ring ──────────────────────────────

function GoalRing({ pct, color = 'var(--pm-accent-teal)', size = 56 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = Math.min(100, Math.max(0, pct ?? 0));
  const dash = (fill / 100) * circumference;

  return (
    <svg width={size} height={size} className="pm-campaign-ring" aria-hidden="true">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text
        x="50%" y="50%"
        textAnchor="middle" dominantBaseline="central"
        fill={color}
        fontSize={size < 60 ? 11 : 13}
        fontWeight={700}
      >
        {fill}%
      </text>
    </svg>
  );
}

// ── CampaignFormModal ─────────────────────────────────────────

function CampaignFormModal({ initial, onSave, onClose }) {
  const [name,        setName]        = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [goalType,    setGoalType]    = useState(initial?.goalType ?? '');
  const [goalTarget,  setGoalTarget]  = useState(initial?.goalTarget ?? '');
  const [startDate,   setStartDate]   = useState(
    initial?.startDate ? initial.startDate.slice(0, 10) : ''
  );
  const [endDate,     setEndDate]     = useState(
    initial?.endDate ? initial.endDate.slice(0, 10) : ''
  );
  const [color,       setColor]       = useState(initial?.color ?? '#a29bfe');
  const [requiredApprovers, setRequiredApprovers] = useState(initial?.requiredApprovers ?? []);
  const [members,     setMembers]     = useState([]);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    get('/api/members')
      .then(data => setMembers((Array.isArray(data) ? data : []).filter(m => !m.isBot)))
      .catch(() => {});
  }, []);

  function toggleApprover(memberId) {
    setRequiredApprovers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !startDate) {
      toast.error('Name and start date are required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        startDate,
        endDate: endDate || null,
        goalType: goalType || null,
        goalTarget: goalTarget !== '' ? Number(goalTarget) : null,
        color,
        requiredApprovers,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pm-modal-overlay" onClick={onClose}>
      <div className="pm-modal-panel pm-campaign-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-modal-header">
          <h2 className="pm-modal-title">
            <i className={`fas fa-${initial ? 'edit' : 'plus-circle'}`} aria-hidden="true" />
            {' '}{initial ? 'Edit Campaign' : 'New Campaign'}
          </h2>
          <button className="pm-modal-close-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <form className="pm-campaign-form" onSubmit={handleSubmit}>
          <div className="cpm-form-group">
            <label className="cpm-form-label">Campaign Name *</label>
            <input
              className="cpm-form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Fall '26 Callout"
              maxLength={100}
              required
            />
          </div>

          <div className="cpm-form-group">
            <label className="cpm-form-label">Description</label>
            <textarea
              className="cpm-form-textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this campaign for?"
              rows={3}
            />
          </div>

          <div className="pm-campaign-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label">Start Date *</label>
              <input
                className="cpm-form-input"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="cpm-form-group">
              <label className="cpm-form-label">End Date</label>
              <input
                className="cpm-form-input"
                type="date"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="pm-campaign-form-row">
            <div className="cpm-form-group">
              <label className="cpm-form-label">Goal Type</label>
              <select
                className="cpm-form-select"
                value={goalType}
                onChange={e => setGoalType(e.target.value)}
              >
                <option value="">None</option>
                {GOAL_TYPES.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div className="cpm-form-group">
              <label className="cpm-form-label">Goal Target</label>
              <input
                className="cpm-form-input"
                type="number"
                min={1}
                value={goalTarget}
                onChange={e => setGoalTarget(e.target.value)}
                placeholder="e.g. 80 signups"
              />
            </div>
          </div>

          <div className="cpm-form-group">
            <label className="cpm-form-label">Campaign Color</label>
            <div className="pm-campaign-color-row">
              {['#a29bfe', '#fdcb6e', '#fd79a8', '#00cec9', '#e17055', '#74b9ff', '#55efc4'].map(c => (
                <button
                  key={c}
                  type="button"
                  className={`pm-campaign-color-swatch${color === c ? ' pm-campaign-color-swatch--active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
              <input
                type="color"
                className="pm-campaign-color-input"
                value={color}
                onChange={e => setColor(e.target.value)}
                title="Custom color"
              />
            </div>
          </div>

          <div className="cpm-form-group">
            <label className="cpm-form-label">
              Required Approvers <span style={{ fontSize: 11, color: 'var(--clubpm-text-secondary)', fontWeight: 400 }}>(submissions in this campaign need all selected members to approve before they can advance to APPROVED)</span>
            </label>
            <div className="pm-campaign-approver-grid">
              {members.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--clubpm-text-secondary)' }}>Loading members…</div>
              )}
              {members.map(m => {
                const isSelected = requiredApprovers.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`pm-campaign-approver-chip${isSelected ? ' pm-campaign-approver-chip--active' : ''}`}
                    onClick={() => toggleApprover(m.id)}
                    title={m.displayName}
                  >
                    {m.avatarUrl
                      ? <img src={m.avatarUrl} alt="" className="pm-campaign-approver-avatar" />
                      : <div className="pm-campaign-approver-avatar pm-campaign-approver-avatar--initials">
                          {(m.displayName ?? '?').slice(0, 2).toUpperCase()}
                        </div>}
                    <span className="pm-campaign-approver-name">{m.displayName}</span>
                    {isSelected && <i className="fas fa-check" aria-hidden="true" style={{ color: 'var(--pm-accent-teal)', fontSize: 10 }} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pm-bv-form-actions">
            <button type="button" className="cpm-btn cpm-btn--secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="cpm-btn cpm-btn--primary" disabled={saving}>
              {saving
                ? <span className="pm-bulk-spinner" aria-hidden="true" />
                : <i className="fas fa-save" aria-hidden="true" />
              }
              {' '}{initial ? 'Save Changes' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── LogProgressModal ──────────────────────────────────────────

function LogProgressModal({ campaign, onSave, onClose }) {
  const [delta, setDelta]   = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const n = Number(delta);
    if (!n || n < 1) { toast.error('Enter a positive number.'); return; }
    setSaving(true);
    try {
      await onSave(campaign.goalProgress + n);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pm-modal-overlay" onClick={onClose}>
      <div className="pm-modal-panel pm-campaign-modal pm-campaign-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="pm-modal-header">
          <h2 className="pm-modal-title">
            <i className="fas fa-chart-line" aria-hidden="true" /> Log Conversion
          </h2>
          <button className="pm-modal-close-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>
        <form className="pm-campaign-form" onSubmit={handleSubmit}>
          <p className="pm-campaign-log-desc">
            Current progress: <strong>{campaign.goalProgress ?? 0}</strong> / {campaign.goalTarget ?? '?'}
          </p>
          <div className="cpm-form-group">
            <label className="cpm-form-label">Add Conversions</label>
            <input
              className="cpm-form-input"
              type="number"
              min={1}
              value={delta}
              onChange={e => setDelta(e.target.value)}
              placeholder="e.g. 5"
              required
              autoFocus
            />
          </div>
          <div className="pm-bv-form-actions">
            <button type="button" className="cpm-btn cpm-btn--secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="cpm-btn cpm-btn--primary" disabled={saving}>
              {saving ? <span className="pm-bulk-spinner" /> : <i className="fas fa-plus" />}
              {' '}Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CampaignDetailDrawer ──────────────────────────────────────

function CampaignDetailDrawer({ campaign, onClose, onEdit, isAdmin }) {
  const [progress,     setProgress]     = useState(null);
  const [submissions,  setSubmissions]  = useState([]);
  const [activeTab,    setActiveTab]    = useState('content');
  const [loadingProg,  setLoadingProg]  = useState(true);
  const [loadingSubs,  setLoadingSubs]  = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);

  useEffect(() => {
    setLoadingProg(true);
    setLoadingSubs(true);
    get(`/api/outreach/campaigns/${campaign.id}/progress`)
      .then(setProgress)
      .catch(() => setProgress(null))
      .finally(() => setLoadingProg(false));
    get(`/api/outreach/campaigns/${campaign.id}`)
      .then(data => setSubmissions(data.submissions ?? []))
      .catch(() => setSubmissions([]))
      .finally(() => setLoadingSubs(false));
  }, [campaign.id]);

  const color = campaign.color ?? 'var(--pm-accent-teal)';
  const goalMeta = campaign.goalType ? GOAL_TYPE_META[campaign.goalType] : null;

  const handleLogProgress = async (newProgress) => {
    await patch(`/api/outreach/campaigns/${campaign.id}`, { goalProgress: newProgress });
    setProgress(prev => ({ ...prev, goalProgress: newProgress, pct: campaign.goalTarget ? Math.min(100, Math.round((newProgress / campaign.goalTarget) * 100)) : null }));
    setShowLogModal(false);
    toast.success('Progress updated.');
  };

  // Public toggle state — mirrors campaign.isPublic but updates locally on toggle
  const [isPublic, setIsPublic] = useState(!!campaign.isPublic);
  useEffect(() => { setIsPublic(!!campaign.isPublic); }, [campaign.isPublic]);

  const publicUrl = campaign.slug ? `${window.location.origin}/r/c/${campaign.slug}` : '';

  async function togglePublic() {
    const next = !isPublic;
    setIsPublic(next);  // optimistic
    try {
      await patch(`/api/outreach/campaigns/${campaign.id}`, { isPublic: next });
      toast.success(next ? 'Campaign is now public' : 'Campaign is no longer public');
    } catch (err) {
      setIsPublic(!next);  // revert
      toast.error(err.message ?? 'Failed to update');
    }
  }

  function copyPublicUrl() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl)
      .then(() => toast.success('Public link copied'))
      .catch(() => toast.error('Failed to copy'));
  }

  return (
    <div className="pm-campaign-drawer-overlay" onClick={onClose}>
      <div className="pm-campaign-drawer" onClick={e => e.stopPropagation()}>
        <div className="pm-campaign-drawer-header" style={{ borderLeft: `4px solid ${color}` }}>
          <div className="pm-campaign-drawer-title-row">
            <h2 className="pm-campaign-drawer-title">{campaign.name}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {isAdmin && (
                <button className="pm-bv-card-btn" onClick={() => onEdit(campaign)} title="Edit">
                  <i className="fas fa-pen" aria-hidden="true" />
                </button>
              )}
              <button className="pm-modal-close-btn" onClick={onClose} aria-label="Close">
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            </div>
          </div>

          {campaign.description && (
            <p className="pm-campaign-drawer-desc">{campaign.description}</p>
          )}

          <div className="pm-campaign-drawer-meta">
            {goalMeta && (
              <span className="pm-campaign-goal-badge" style={{ color: goalMeta.color, borderColor: goalMeta.color + '40', background: goalMeta.color + '18' }}>
                <i className={goalMeta.icon} aria-hidden="true" />
                {' '}{GOAL_TYPES.find(g => g.value === campaign.goalType)?.label}
              </span>
            )}
            {campaign.startDate && (
              <span className="pm-campaign-date-badge">
                <i className="fas fa-calendar" aria-hidden="true" />
                {' '}{fmtDate(campaign.startDate)}
                {campaign.endDate ? ` – ${fmtDate(campaign.endDate)}` : ''}
              </span>
            )}
            {campaign.owner && (
              <span className="pm-campaign-owner-badge">
                {campaign.owner.avatarUrl
                  ? <img src={campaign.owner.avatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                  : <i className="fas fa-user" aria-hidden="true" />
                }
                {' '}{campaign.owner.displayName}
              </span>
            )}
          </div>

          {/* Public link toggle */}
          <div className="pm-campaign-public-row">
            <label className="pm-campaign-public-toggle">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={togglePublic}
                disabled={!isAdmin}
              />
              <i className={`fas fa-${isPublic ? 'globe-americas' : 'lock'}`} aria-hidden="true" />
              {isPublic ? 'Public' : 'Make public'}
            </label>
            {isPublic && publicUrl && (
              <>
                <span className="pm-campaign-public-url" title={publicUrl}>{publicUrl}</span>
                <button className="pm-campaign-public-copy" onClick={copyPublicUrl} title="Copy public link">
                  <i className="fas fa-copy" aria-hidden="true" />
                </button>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="pm-campaign-public-copy" title="Open">
                  <i className="fas fa-external-link-alt" aria-hidden="true" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Progress */}
        {campaign.goalTarget && (
          <div className="pm-campaign-drawer-progress">
            {loadingProg ? (
              <div className="pm-outreach-spinner" style={{ width: 20, height: 20 }} />
            ) : (
              <>
                <GoalRing pct={progress?.pct ?? 0} color={color} size={64} />
                <div className="pm-campaign-drawer-progress-info">
                  <div className="pm-campaign-progress-nums">
                    {progress?.goalProgress ?? 0} <span>/ {campaign.goalTarget}</span>
                  </div>
                  <div className="pm-campaign-progress-label">Goal Progress</div>
                </div>
                {isAdmin && (
                  <button className="cpm-btn cpm-btn--secondary pm-campaign-log-btn" onClick={() => setShowLogModal(true)}>
                    <i className="fas fa-plus" aria-hidden="true" /> Log
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Sub-tabs */}
        <div className="pm-campaign-drawer-tabs">
          {['content', 'stats'].map(t => (
            <button
              key={t}
              className={`pm-campaign-drawer-tab${activeTab === t ? ' pm-campaign-drawer-tab--active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t === 'content' ? 'Content' : 'Stats'}
            </button>
          ))}
        </div>

        <div className="pm-campaign-drawer-body">
          {activeTab === 'content' && (
            loadingSubs ? (
              <div className="pm-outreach-loading"><div className="pm-outreach-spinner" /></div>
            ) : submissions.length === 0 ? (
              <div className="pm-outreach-empty">
                <i className="fas fa-inbox" aria-hidden="true" />
                <p>No submissions in this campaign yet.</p>
              </div>
            ) : (
              <ul className="pm-campaign-sub-list">
                {submissions.map(s => (
                  <li key={s.id} className="pm-campaign-sub-item">
                    <span className="pm-campaign-sub-status" style={{ color: statusColor(s.status) }}>
                      <i className="fas fa-circle" aria-hidden="true" style={{ fontSize: 7, marginRight: 5 }} />
                      {STATUS_SUBMISSION_LABELS[s.status] ?? s.status}
                    </span>
                    <span className="pm-campaign-sub-title">{s.title}</span>
                    {s.scheduledAt && (
                      <span className="pm-campaign-sub-date">{fmtDate(s.scheduledAt)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}

          {activeTab === 'stats' && (
            loadingProg ? (
              <div className="pm-outreach-loading"><div className="pm-outreach-spinner" /></div>
            ) : (
              <div className="pm-campaign-stats-grid">
                <div className="pm-campaign-stat-card">
                  <div className="pm-stat-number">{progress?.submissionCount ?? 0}</div>
                  <div className="pm-stat-label">Total Submissions</div>
                </div>
                {progress?.statusCounts && Object.entries(progress.statusCounts).map(([status, count]) => (
                  <div key={status} className="pm-campaign-stat-card">
                    <div className="pm-stat-number" style={{ color: statusColor(status) }}>{count}</div>
                    <div className="pm-stat-label">{STATUS_SUBMISSION_LABELS[status] ?? status}</div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {showLogModal && (
        <LogProgressModal
          campaign={{ ...campaign, goalProgress: progress?.goalProgress ?? campaign.goalProgress ?? 0 }}
          onSave={handleLogProgress}
          onClose={() => setShowLogModal(false)}
        />
      )}
    </div>
  );
}

// ── CampaignCard ──────────────────────────────────────────────

function CampaignCard({ campaign, onOpen, onDelete, isAdmin }) {
  const color = campaign.color ?? 'var(--pm-accent-teal)';
  const goalMeta = campaign.goalType ? GOAL_TYPE_META[campaign.goalType] : null;
  const subCount = campaign._count?.submissions ?? 0;

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete campaign "${campaign.name}"? This will not delete submissions.`)) return;
    try {
      await del(`/api/outreach/campaigns/${campaign.id}`);
      toast.success('Campaign deleted.');
      onDelete(campaign.id);
    } catch (err) {
      toast.error(err.message ?? 'Delete failed.');
    }
  };

  return (
    <div
      className="pm-campaign-card"
      style={{ borderTop: `3px solid ${color}` }}
      onClick={() => onOpen(campaign)}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen(campaign)}
    >
      <div className="pm-campaign-card-header">
        <div className="pm-campaign-card-name">{campaign.name}</div>
        {isAdmin && (
          <button
            className="pm-bv-card-btn pm-bv-card-btn--danger"
            onClick={handleDelete}
            title="Delete campaign"
            aria-label="Delete campaign"
          >
            <i className="fas fa-trash" aria-hidden="true" />
          </button>
        )}
      </div>

      {campaign.description && (
        <p className="pm-campaign-card-desc">{campaign.description}</p>
      )}

      <div className="pm-campaign-card-meta">
        {goalMeta && (
          <span className="pm-campaign-goal-badge" style={{ color: goalMeta.color, borderColor: goalMeta.color + '40', background: goalMeta.color + '18' }}>
            <i className={goalMeta.icon} aria-hidden="true" />
            {' '}{GOAL_TYPES.find(g => g.value === campaign.goalType)?.label}
          </span>
        )}
        {campaign.startDate && (
          <span className="pm-campaign-date-badge">
            <i className="fas fa-calendar" aria-hidden="true" />
            {' '}{fmtDate(campaign.startDate)}
          </span>
        )}
      </div>

      <div className="pm-campaign-card-footer">
        <div className="pm-campaign-card-stats">
          <span>
            <i className="fas fa-file-alt" aria-hidden="true" style={{ marginRight: 4, opacity: 0.6 }} />
            {subCount} submission{subCount !== 1 ? 's' : ''}
          </span>
          {campaign.owner && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {campaign.owner.avatarUrl
                ? <img src={campaign.owner.avatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                : <i className="fas fa-user" aria-hidden="true" style={{ opacity: 0.5 }} />
              }
              <span>{campaign.owner.displayName}</span>
            </span>
          )}
        </div>

        {campaign.goalTarget != null && (
          <GoalRing
            pct={campaign.goalTarget ? Math.min(100, Math.round(((campaign.goalProgress ?? 0) / campaign.goalTarget) * 100)) : 0}
            color={color}
            size={52}
          />
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusColor(status) {
  const map = {
    DRAFT:      'var(--pm-text-secondary)',
    SUBMITTED:  'var(--pm-accent-amber)',
    IN_REVIEW:  '#a29bfe',
    APPROVED:   'var(--pm-accent-teal)',
    PUBLISHED:  '#00b894',
  };
  return map[status] ?? 'var(--pm-text-secondary)';
}

// ── CampaignsTab (exported) ───────────────────────────────────

export default function CampaignsTab({ isAdmin }) {
  const [campaigns,   setCampaigns]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [detailOpen,  setDetailOpen]  = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    get('/api/outreach/campaigns')
      .then(data => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleCreate = async (data) => {
    const created = await post('/api/outreach/campaigns', data);
    setCampaigns(prev => [created, ...prev]);
    setShowForm(false);
    toast.success(`Campaign "${created.name}" created.`);
  };

  const handleUpdate = async (data) => {
    const updated = await patch(`/api/outreach/campaigns/${editing.id}`, data);
    setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
    if (detailOpen?.id === updated.id) setDetailOpen(updated);
    setEditing(null);
    toast.success(`Campaign "${updated.name}" updated.`);
  };

  const handleDelete = (id) => {
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (detailOpen?.id === id) setDetailOpen(null);
  };

  const openDetail = (campaign) => {
    setEditing(null);
    setShowForm(false);
    setDetailOpen(campaign);
  };

  const openEdit = (campaign) => {
    setDetailOpen(null);
    setEditing(campaign);
    setShowForm(false);
  };

  if (loading) {
    return <div className="pm-outreach-loading"><div className="pm-outreach-spinner" /></div>;
  }

  return (
    <div className="pm-campaigns-tab">
      <div className="pm-campaigns-header">
        <div>
          <h2 className="pm-campaigns-title">
            <i className="fas fa-flag" aria-hidden="true" /> Campaigns
          </h2>
          <p className="pm-campaigns-subtitle">
            Group submissions by initiative and track goal progress.
          </p>
        </div>
        {isAdmin && (
          <button className="cpm-btn cpm-btn--primary" onClick={() => { setShowForm(true); setEditing(null); }}>
            <i className="fas fa-plus" aria-hidden="true" /> New Campaign
          </button>
        )}
      </div>

      {campaigns.length === 0 ? (
        <div className="pm-outreach-empty">
          <i className="fas fa-flag-checkered" aria-hidden="true" />
          <p>No campaigns yet.{isAdmin ? ' Create your first one above.' : ''}</p>
        </div>
      ) : (
        <div className="pm-campaigns-grid">
          {campaigns.map(c => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onOpen={openDetail}
              onDelete={handleDelete}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {(showForm || editing) && (
        <CampaignFormModal
          initial={editing}
          onSave={editing ? handleUpdate : handleCreate}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* Detail drawer */}
      {detailOpen && (
        <CampaignDetailDrawer
          campaign={detailOpen}
          onClose={() => setDetailOpen(null)}
          onEdit={openEdit}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
