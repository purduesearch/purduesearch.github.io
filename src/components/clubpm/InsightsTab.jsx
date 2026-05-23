import React, { useState, useEffect, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { get, post, patch, del } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────

const STAGE_ORDER  = ['COLD', 'CONTACTED', 'ENGAGED', 'ACTIVE', 'DORMANT'];
const STAGE_COLORS = { COLD: '#636e72', CONTACTED: '#fdcb6e', ENGAGED: '#a29bfe', ACTIVE: '#00b894', DORMANT: '#b2bec3' };
const PIE_COLORS   = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#fd79a8', '#0984e3'];
const PLATFORMS    = ['instagram', 'linkedin', 'twitter', 'website', 'newsletter'];
const PLATFORM_LABELS = { instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'Twitter', website: 'Website', newsletter: 'Newsletter' };
const DAY_LABELS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HASHTAG_CATEGORIES = ['GENERAL', 'PROGRAM', 'EVENT', 'BRAND'];

// ── KPI card ──────────────────────────────────────────────────

function KpiCard({ icon, label, value, delta, sub }) {
  const isPositive = delta > 0;
  const isNeutral  = delta === 0 || delta == null;
  return (
    <div className="pm-insights-kpi-card">
      <div className="pm-insights-kpi-icon"><i className={icon} aria-hidden="true" /></div>
      <div className="pm-insights-kpi-body">
        <div className="pm-insights-kpi-label">{label}</div>
        <div className="pm-insights-kpi-value">{value ?? '—'}</div>
        {delta != null && (
          <div className={`pm-insights-kpi-delta ${isNeutral ? '' : isPositive ? 'up' : 'down'}`}>
            <i className={`fas fa-arrow-${isNeutral ? 'right' : isPositive ? 'up' : 'down'}`} aria-hidden="true" />
            {' '}{Math.abs(delta)} vs last month
          </div>
        )}
        {sub && <div className="pm-insights-kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ── Best Posting Times heatmap ────────────────────────────────

function BestTimesChart({ data }) {
  const [platform, setPlatform] = useState('instagram');
  const cells = data?.[platform] ?? [];

  const maxEng = cells.reduce((m, c) => Math.max(m, c.avgEngagement), 1);

  return (
    <div className="pm-insights-card">
      <div className="pm-insights-card-header">
        <span className="pm-insights-card-title">Best Posting Times</span>
        <select
          className="pm-insights-select"
          value={platform}
          onChange={e => setPlatform(e.target.value)}
        >
          {PLATFORMS.map(p => (
            <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
          ))}
        </select>
      </div>
      {cells.length === 0 ? (
        <div className="pm-insights-empty">No metric data yet — log some post metrics to see best times.</div>
      ) : (
        <div className="pm-insights-heatmap">
          <div className="pm-insights-heatmap-grid">
            {/* Day labels */}
            <div className="pm-insights-heatmap-corner" />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pm-insights-heatmap-hour-label">{h % 6 === 0 ? `${h}:00` : ''}</div>
            ))}
            {/* Row per day */}
            {DAY_LABELS.map((day, d) => (
              <React.Fragment key={d}>
                <div className="pm-insights-heatmap-day-label">{day}</div>
                {Array.from({ length: 24 }, (_, h) => {
                  const cell = cells.find(c => c.day === d && c.hour === h);
                  const intensity = cell ? cell.avgEngagement / maxEng : 0;
                  return (
                    <div
                      key={h}
                      className="pm-insights-heatmap-cell"
                      title={cell ? `${day} ${h}:00 — avg ${cell.avgEngagement} eng` : ''}
                      style={{ background: `rgba(0,229,204,${intensity.toFixed(2)})` }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="pm-insights-heatmap-legend">
            <span>Low</span>
            <div className="pm-insights-heatmap-legend-bar" />
            <span>High engagement</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Source Mix pie ────────────────────────────────────────────

function SourceMixChart({ data }) {
  if (!data || data.total === 0) {
    return (
      <div className="pm-insights-card">
        <div className="pm-insights-card-header">
          <span className="pm-insights-card-title">Content Source Mix</span>
        </div>
        <div className="pm-insights-empty">No published posts yet.</div>
      </div>
    );
  }
  const chartData = [
    { name: 'Event-driven', value: data.events },
    { name: 'Project/Milestone', value: data.milestones },
    { name: 'Manual', value: data.manual },
  ].filter(d => d.value > 0);

  return (
    <div className="pm-insights-card">
      <div className="pm-insights-card-header">
        <span className="pm-insights-card-title">Content Source Mix</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
            {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <RechartsTooltip contentStyle={{ background: '#1e2433', border: '1px solid #2d3348', borderRadius: 8, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── CRM Funnel ────────────────────────────────────────────────

function CrmFunnelChart({ funnel }) {
  const chartData = STAGE_ORDER.map(s => ({ stage: s, count: funnel?.[s] ?? 0 }));
  return (
    <div className="pm-insights-card">
      <div className="pm-insights-card-header">
        <span className="pm-insights-card-title">CRM Pipeline Funnel</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis type="number" tick={{ fill: '#8892a4', fontSize: 11 }} />
          <YAxis type="category" dataKey="stage" tick={{ fill: '#8892a4', fontSize: 11 }} width={80} />
          <RechartsTooltip contentStyle={{ background: '#1e2433', border: '1px solid #2d3348', borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={STAGE_COLORS[entry.stage] ?? '#6c5ce7'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Hashtag Leaderboard ───────────────────────────────────────

function HashtagLeaderboard({ tags, isAdmin, onUpdate, onDelete }) {
  const [editId, setEditId] = useState(null);
  const [editCategory, setEditCategory] = useState('');

  function startEdit(tag) {
    setEditId(tag.id);
    setEditCategory(tag.category ?? '');
  }

  async function saveEdit(id) {
    await onUpdate(id, editCategory || null);
    setEditId(null);
  }

  return (
    <div className="pm-insights-card">
      <div className="pm-insights-card-header">
        <span className="pm-insights-card-title">Hashtag Library</span>
        <span className="pm-insights-card-sub">{tags.length} tags</span>
      </div>
      <div className="pm-insights-hashtag-list">
        {tags.slice(0, 30).map(tag => (
          <div key={tag.id} className="pm-insights-hashtag-row">
            <span className="pm-insights-hashtag-name">#{tag.tag}</span>
            {editId === tag.id ? (
              <select
                className="pm-insights-select"
                value={editCategory}
                onChange={e => setEditCategory(e.target.value)}
                style={{ padding: '3px 6px', fontSize: 11 }}
              >
                <option value="">No category</option>
                {HASHTAG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              tag.category
                ? <span className="pm-insights-hashtag-cat">{tag.category}</span>
                : <span />
            )}
            <span className="pm-insights-hashtag-count">{tag.useCount}×</span>
            {isAdmin && (
              <div className="pm-insights-hashtag-actions">
                {editId === tag.id ? (
                  <button className="pm-insights-icon-btn" onClick={() => saveEdit(tag.id)} title="Save">
                    <i className="fas fa-check" aria-hidden="true" />
                  </button>
                ) : (
                  <button className="pm-insights-icon-btn" onClick={() => startEdit(tag)} title="Edit category">
                    <i className="fas fa-tag" aria-hidden="true" />
                  </button>
                )}
                <button className="pm-insights-icon-btn danger" onClick={() => onDelete(tag.id)} title="Delete">
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        ))}
        {tags.length === 0 && (
          <div className="pm-insights-empty">No hashtags tracked yet. Post metrics to start building history.</div>
        )}
      </div>
    </div>
  );
}

// ── Gap Analysis panel ────────────────────────────────────────

function GapAnalysis({ onRequestDraft }) {
  const [gaps, setGaps] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadGaps() {
    setLoading(true);
    try {
      const data = await get('/api/outreach/insights/gaps');
      setGaps(data);
    } catch {
      toast.error('Failed to load gap analysis');
    } finally {
      setLoading(false);
    }
  }

  const PRIORITY_COLORS = { HIGH: '#e17055', MEDIUM: '#fdcb6e', LOW: '#636e72' };

  return (
    <div className="pm-insights-card">
      <div className="pm-insights-card-header">
        <span className="pm-insights-card-title">
          <i className="fas fa-search-plus" aria-hidden="true" style={{ marginRight: 6, color: 'var(--pm-accent-teal)' }} />
          Content Gap Analysis
        </span>
        <button className="pm-insights-refresh-btn" onClick={loadGaps} disabled={loading}>
          {loading ? <i className="fas fa-spinner fa-spin" aria-hidden="true" /> : 'Analyze with AI'}
        </button>
      </div>
      {gaps === null && !loading && (
        <div className="pm-insights-empty">Click "Analyze with AI" to find missed content opportunities.</div>
      )}
      {gaps?.gaps?.length === 0 && (
        <div className="pm-insights-empty" style={{ color: '#00b894' }}>
          <i className="fas fa-check-circle" aria-hidden="true" style={{ marginRight: 6 }} />
          No major content gaps detected — great coverage!
        </div>
      )}
      {gaps?.gaps?.length > 0 && (
        <div className="pm-insights-gap-list">
          {gaps.gaps.map((g, i) => (
            <div key={i} className="pm-insights-gap-item">
              <div className="pm-insights-gap-header">
                <span className="pm-insights-gap-priority" style={{ color: PRIORITY_COLORS[g.priority] }}>
                  {g.priority}
                </span>
                <span className="pm-insights-gap-type">{g.suggestedType?.replace('_', ' ')}</span>
              </div>
              <div className="pm-insights-gap-title">{g.title}</div>
              <div className="pm-insights-gap-reason">{g.reason}</div>
              {onRequestDraft && (
                <button className="pm-insights-gap-draft-btn" onClick={() => onRequestDraft(g)}>
                  <i className="fas fa-pen" aria-hidden="true" /> Create draft
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AI Weekly Digest card ─────────────────────────────────────

function WeeklyDigestCard() {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadDigest() {
    setLoading(true);
    try {
      const data = await get('/api/outreach/insights/digest');
      setDigest(data.digest);
    } catch {
      toast.error('Failed to generate digest');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pm-insights-card pm-insights-digest-card">
      <div className="pm-insights-card-header">
        <span className="pm-insights-card-title">
          <i className="fas fa-robot" aria-hidden="true" style={{ marginRight: 6, color: '#a29bfe' }} />
          AI Weekly Digest
        </span>
        <button className="pm-insights-refresh-btn" onClick={loadDigest} disabled={loading}>
          {loading ? <i className="fas fa-spinner fa-spin" aria-hidden="true" /> : 'Generate'}
        </button>
      </div>
      {digest ? (
        <>
          <div className="pm-insights-digest-body">{digest}</div>
          <button
            className="pm-insights-copy-btn"
            onClick={() => { navigator.clipboard.writeText(digest); toast.success('Copied!'); }}
          >
            <i className="fas fa-copy" aria-hidden="true" /> Copy
          </button>
        </>
      ) : (
        <div className="pm-insights-empty">
          Click "Generate" to get an AI-written narrative of last week's outreach performance.
        </div>
      )}
    </div>
  );
}

// ── MetricsForm modal ─────────────────────────────────────────

function MetricsFormModal({ submissions, onClose }) {
  const [submissionId, setSubmissionId] = useState(submissions[0]?.id ?? '');
  const [platform, setPlatform] = useState('instagram');
  const [fields, setFields] = useState({ impressions: '', likes: '', comments: '', shares: '', clicks: '' });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!submissionId || !platform) return;
    setSaving(true);
    try {
      const payload = {
        platform,
        impressions: fields.impressions !== '' ? Number(fields.impressions) : null,
        likes:       fields.likes       !== '' ? Number(fields.likes)       : null,
        comments:    fields.comments    !== '' ? Number(fields.comments)    : null,
        shares:      fields.shares      !== '' ? Number(fields.shares)      : null,
        clicks:      fields.clicks      !== '' ? Number(fields.clicks)      : null,
      };
      await post(`/api/outreach/submissions/${submissionId}/metrics`, payload);
      toast.success('Metrics recorded');
      onClose(true);
    } catch {
      toast.error('Failed to save metrics');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pm-insights-modal-backdrop" onClick={onClose}>
      <div className="pm-insights-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-insights-modal-title">
          <i className="fas fa-chart-bar" aria-hidden="true" style={{ marginRight: 8, color: 'var(--pm-accent-teal)' }} />
          Log Engagement Metrics
        </div>

        <div className="pm-insights-form-group">
          <label className="pm-insights-form-label">Post</label>
          <select className="pm-insights-form-select" value={submissionId} onChange={e => setSubmissionId(e.target.value)}>
            {submissions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>

        <div className="pm-insights-form-group">
          <label className="pm-insights-form-label">Platform</label>
          <select className="pm-insights-form-select" value={platform} onChange={e => setPlatform(e.target.value)}>
            {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
          </select>
        </div>

        <div className="pm-insights-metrics-grid">
          {['impressions', 'likes', 'comments', 'shares', 'clicks'].map(f => (
            <div key={f} className="pm-insights-form-group">
              <label className="pm-insights-form-label">{f.charAt(0).toUpperCase() + f.slice(1)}</label>
              <input
                type="number"
                min="0"
                className="pm-insights-form-input"
                placeholder="—"
                value={fields[f]}
                onChange={e => setFields(prev => ({ ...prev, [f]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="pm-insights-modal-footer">
          <button className="pm-insights-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="pm-insights-modal-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Metrics'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── UTM Top Tracked Links ─────────────────────────────────────

const UTM_PLATFORM_ICONS = {
  instagram: 'fab fa-instagram',
  linkedin:  'fab fa-linkedin',
  twitter:   'fab fa-twitter',
  website:   'fas fa-globe',
  newsletter:'fas fa-envelope',
};

function UtmLinksCard({ links }) {
  const topLinks = (links ?? []).filter(l => (l.clicks ?? 0) > 0);

  function copyLink(code) {
    const url = `${window.location.origin}/r/${code}`;
    navigator.clipboard.writeText(url)
      .then(() => toast.success('Copied'))
      .catch(() => toast.error('Failed to copy'));
  }

  return (
    <div className="pm-insights-card">
      <div className="pm-insights-card-header">
        <span className="pm-insights-card-title">
          <i className="fas fa-link" aria-hidden="true" style={{ marginRight: 6, color: 'var(--pm-accent-teal)' }} />
          Top Tracked Links
        </span>
        <span className="pm-insights-card-sub">{topLinks.length} of {links?.length ?? 0}</span>
      </div>
      {topLinks.length === 0 ? (
        <div className="pm-insights-empty">
          No UTM clicks yet. Generate tracked short links from the Composer / submission detail.
        </div>
      ) : (
        <div className="pm-insights-utm-list">
          {topLinks.slice(0, 10).map(l => (
            <div key={l.id} className="pm-insights-utm-row">
              {l.platform && (
                <i className={UTM_PLATFORM_ICONS[l.platform] ?? 'fas fa-globe'} aria-hidden="true" style={{ width: 16, textAlign: 'center', color: 'var(--clubpm-text-secondary)' }} />
              )}
              <div className="pm-insights-utm-info">
                <div className="pm-insights-utm-title">{l.submission?.title ?? '(unlinked)'}</div>
                <div className="pm-insights-utm-code">/r/{l.code}</div>
              </div>
              <span className="pm-insights-utm-clicks">{l.clicks} {l.clicks === 1 ? 'click' : 'clicks'}</span>
              <button className="pm-insights-icon-btn" onClick={() => copyLink(l.code)} title="Copy link">
                <i className="fas fa-copy" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Syndication Helper ────────────────────────────────────────

function SyndicationHelper() {
  const [milestones, setMilestones] = useState([]);
  const [milestoneId, setMilestoneId] = useState('');
  const [posts, setPosts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMilestones, setLoadingMilestones] = useState(false);

  useEffect(() => {
    setLoadingMilestones(true);
    get('/api/milestones?status=COMPLETED')
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setMilestones(list);
        if (list.length > 0) setMilestoneId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingMilestones(false));
  }, []);

  async function generate() {
    if (!milestoneId) return;
    setLoading(true);
    try {
      const data = await post('/api/outreach/ai/syndicate', { milestoneId });
      setPosts(data.posts ?? []);
    } catch {
      toast.error('Failed to generate syndication posts');
    } finally {
      setLoading(false);
    }
  }

  const PLATFORM_ICONS = { instagram: 'fab fa-instagram', linkedin: 'fab fa-linkedin', twitter: 'fab fa-twitter' };

  return (
    <div className="pm-insights-card">
      <div className="pm-insights-card-header">
        <span className="pm-insights-card-title">
          <i className="fas fa-share-alt" aria-hidden="true" style={{ marginRight: 6, color: '#fdcb6e' }} />
          Syndication Helper
        </span>
        <span className="pm-insights-card-sub">AI-tailored posts per audience from a milestone</span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="pm-insights-select"
          value={milestoneId}
          onChange={e => { setMilestoneId(e.target.value); setPosts(null); }}
          disabled={loadingMilestones || milestones.length === 0}
          style={{ flex: 1, minWidth: 200 }}
        >
          {milestones.length === 0
            ? <option>No completed milestones</option>
            : milestones.map(m => <option key={m.id} value={m.id}>{m.title}{m.project ? ` — ${m.project.name}` : ''}</option>)
          }
        </select>
        <button className="pm-insights-refresh-btn" onClick={generate} disabled={loading || !milestoneId}>
          {loading ? <i className="fas fa-spinner fa-spin" aria-hidden="true" /> : 'Generate'}
        </button>
      </div>

      {posts === null && !loading && (
        <div className="pm-insights-empty">Pick a milestone and click Generate to get audience-tailored posts.</div>
      )}
      {posts?.length === 0 && (
        <div className="pm-insights-empty">No suggestions generated. Try a different milestone.</div>
      )}
      {posts?.map((p, i) => (
        <div key={i} className="pm-insights-syndication-post">
          <div className="pm-insights-syndication-header">
            <span className="pm-insights-syndication-audience">{p.audience}</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {(p.platform ?? []).map(pl => (
                <i key={pl} className={PLATFORM_ICONS[pl] ?? 'fas fa-globe'} aria-hidden="true"
                   style={{ fontSize: 13, color: 'var(--clubpm-text-secondary)' }} />
              ))}
            </div>
          </div>
          <div className="pm-insights-syndication-caption">{p.caption}</div>
          <button
            className="pm-insights-copy-btn"
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
            onClick={() => { navigator.clipboard.writeText(p.caption); toast.success('Copied!'); }}
          >
            <i className="fas fa-copy" aria-hidden="true" /> Copy
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Spotlight Helper ─────────────────────────────────────────

function SpotlightHelper() {
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    get('/api/members')
      .then(data => {
        const list = (Array.isArray(data) ? data : []).filter(m => !m.isBot);
        setMembers(list);
        if (list.length > 0) setMemberId(list[0].id);
      })
      .catch(() => {});
  }, []);

  async function generate() {
    if (!memberId) return;
    setLoading(true);
    try {
      const data = await post('/api/outreach/ai/spotlight', { memberId });
      setDraft(data.draft ?? '');
    } catch {
      toast.error('Failed to generate spotlight');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pm-insights-card">
      <div className="pm-insights-card-header">
        <span className="pm-insights-card-title">
          <i className="fas fa-star" aria-hidden="true" style={{ marginRight: 6, color: '#fdcb6e' }} />
          Member Spotlight
        </span>
        <span className="pm-insights-card-sub">AI-generated spotlight post for any member</span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="pm-insights-select"
          value={memberId}
          onChange={e => { setMemberId(e.target.value); setDraft(null); }}
          style={{ flex: 1, minWidth: 180 }}
        >
          {members.map(m => <option key={m.id} value={m.id}>{m.displayName}{m.title ? ` — ${m.title}` : ''}</option>)}
        </select>
        <button className="pm-insights-refresh-btn" onClick={generate} disabled={loading || !memberId}>
          {loading ? <i className="fas fa-spinner fa-spin" aria-hidden="true" /> : 'Generate'}
        </button>
      </div>

      {draft === null && !loading && (
        <div className="pm-insights-empty">Pick a member and click Generate for an AI-written spotlight post.</div>
      )}
      {draft !== null && (
        <>
          <div className="pm-insights-digest-body">{draft}</div>
          <button
            className="pm-insights-copy-btn"
            onClick={() => { navigator.clipboard.writeText(draft); toast.success('Copied!'); }}
          >
            <i className="fas fa-copy" aria-hidden="true" /> Copy
          </button>
        </>
      )}
    </div>
  );
}

// ── InsightsTab root ──────────────────────────────────────────

export default function InsightsTab({ submissions = [], isAdmin = false }) {
  const [summary, setSummary]     = useState(null);
  const [bestTimes, setBestTimes] = useState(null);
  const [sourceMix, setSourceMix] = useState(null);
  const [hashtags, setHashtags]   = useState([]);
  const [utmLinks, setUtmLinks]   = useState([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [loadingMain, setLoadingMain] = useState(true);

  const publishedSubs = submissions.filter(s => s.status === 'PUBLISHED');

  const loadAll = useCallback(async () => {
    setLoadingMain(true);
    try {
      const [sum, times, mix, tags, utm] = await Promise.all([
        get('/api/outreach/insights/summary'),
        get('/api/outreach/insights/best-times'),
        get('/api/outreach/insights/source-mix'),
        get('/api/outreach/insights/hashtags'),
        get('/api/outreach/insights/utm').catch(() => []),
      ]);
      setSummary(sum);
      setBestTimes(times);
      setSourceMix(mix);
      setHashtags(tags);
      setUtmLinks(Array.isArray(utm) ? utm : []);
    } catch {
      toast.error('Failed to load insights');
    } finally {
      setLoadingMain(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleHashtagUpdate(id, category) {
    try {
      const updated = await patch(`/api/outreach/insights/hashtags/${id}`, { category });
      setHashtags(prev => prev.map(t => t.id === id ? updated : t));
      toast.success('Category updated');
    } catch {
      toast.error('Failed to update hashtag');
    }
  }

  async function handleHashtagDelete(id) {
    try {
      await del(`/api/outreach/insights/hashtags/${id}`);
      setHashtags(prev => prev.filter(t => t.id !== id));
      toast.success('Hashtag removed');
    } catch {
      toast.error('Failed to delete hashtag');
    }
  }

  if (loadingMain) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--pm-accent-teal)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="pm-insights-root">
      {/* Toolbar */}
      <div className="pm-insights-toolbar">
        <h2 className="pm-insights-section-title">
          <i className="fas fa-chart-line" aria-hidden="true" />
          Insights
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="pm-insights-action-btn" onClick={loadAll}>
            <i className="fas fa-sync-alt" aria-hidden="true" /> Refresh
          </button>
          {publishedSubs.length > 0 && (
            <button className="pm-insights-action-btn primary" onClick={() => setShowMetrics(true)}>
              <i className="fas fa-chart-bar" aria-hidden="true" /> Log Metrics
            </button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="pm-insights-kpi-row">
        <KpiCard
          icon="fas fa-paper-plane"
          label="Posts this month"
          value={summary?.publishedThisMonth ?? 0}
          delta={summary?.publishedDelta}
        />
        <KpiCard
          icon="fas fa-heart"
          label="Avg engagement"
          value={summary?.avgEngagement ?? 0}
          sub="likes + comments + shares per post"
        />
        <KpiCard
          icon="fas fa-trophy"
          label="Top platform"
          value={summary?.topPlatform ? PLATFORM_LABELS[summary.topPlatform] ?? summary.topPlatform : '—'}
          sub="by published post count"
        />
        <KpiCard
          icon="fas fa-exclamation-triangle"
          label="At-risk drafts"
          value={summary?.atRiskDrafts ?? 0}
          sub="unscheduled or overdue"
        />
      </div>

      {/* Charts row */}
      <div className="pm-insights-charts-row">
        <BestTimesChart data={bestTimes} />
        <SourceMixChart data={sourceMix} />
        <CrmFunnelChart funnel={summary?.crmFunnel} />
      </div>

      {/* AI section */}
      <div className="pm-insights-ai-row">
        <WeeklyDigestCard />
        <GapAnalysis />
      </div>

      {/* Spotlight + Syndication */}
      <div className="pm-insights-ai-row">
        <SpotlightHelper />
        <SyndicationHelper />
      </div>

      {/* UTM Top Tracked Links */}
      <UtmLinksCard links={utmLinks} />

      {/* Hashtag library */}
      <HashtagLeaderboard
        tags={hashtags}
        isAdmin={isAdmin}
        onUpdate={handleHashtagUpdate}
        onDelete={handleHashtagDelete}
      />

      {/* Metrics modal */}
      {showMetrics && (
        <MetricsFormModal
          submissions={publishedSubs}
          onClose={(refreshed) => {
            setShowMetrics(false);
            if (refreshed) loadAll();
          }}
        />
      )}
    </div>
  );
}
