import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const PLATFORM_META = {
  instagram: { icon: 'fab fa-instagram', label: 'Instagram' },
  linkedin:  { icon: 'fab fa-linkedin',  label: 'LinkedIn' },
  twitter:   { icon: 'fab fa-twitter',   label: 'Twitter' },
  website:   { icon: 'fas fa-globe',     label: 'Website' },
  newsletter:{ icon: 'fas fa-envelope',  label: 'Newsletter' },
};

const GOAL_TYPE_LABELS = {
  RECRUITMENT:  'Recruitment',
  SPONSORSHIP:  'Sponsorship',
  EVENT:        'Event',
  AWARENESS:    'Awareness',
};

// Simple SVG progress ring (extracted concept from CampaignsTab.GoalRing)
function GoalRing({ progress, target, color }) {
  if (!target) return null;
  const pct = Math.min(100, Math.round((progress / target) * 100));
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="pm-pubc-ring">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle
          cx="46" cy="46" r={r}
          fill="none"
          stroke={color || '#00e5c3'}
          strokeWidth="6"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 46 46)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x="46" y="50" textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor">{pct}%</text>
      </svg>
      <div className="pm-pubc-ring-label">
        <strong>{progress}</strong> of {target}
      </div>
    </div>
  );
}

export default function PublicCampaign() {
  const { slug } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const [form, setForm] = useState({ name: '', email: '', role: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${BASE_URL}/api/public/campaigns/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status === 404 ? 'Not found' : 'Failed to load'))
      .then(data => { if (!cancelled) setCampaign(data); })
      .catch(err => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${BASE_URL}/api/public/campaigns/${slug}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Signup failed');
      setSubmitted(true);
    } catch (err) {
      alert(err.message ?? 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="pm-pubc-root">
        <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>Loading…</div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="pm-pubc-root">
        <div className="pm-pubc-error">
          <i className="fas fa-exclamation-circle" aria-hidden="true" />
          <h1>Campaign not found</h1>
          <p>This campaign may not be publicly available, or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  const accent = campaign.color || '#00e5c3';
  const goalLabel = campaign.goalType ? GOAL_TYPE_LABELS[campaign.goalType] ?? campaign.goalType : null;

  return (
    <div className="pm-pubc-root" style={{ '--pubc-accent': accent }}>
      <div className="pm-pubc-hero" style={{ borderTopColor: accent }}>
        <div className="pm-pubc-hero-inner">
          <div className="pm-pubc-hero-text">
            <div className="pm-pubc-brand">
              <i className="fas fa-broadcast-tower" aria-hidden="true" style={{ color: accent }} />
              Purdue SEARCH
            </div>
            <h1 className="pm-pubc-title">{campaign.name}</h1>
            {campaign.description && <p className="pm-pubc-description">{campaign.description}</p>}
            <div className="pm-pubc-meta">
              {goalLabel && (
                <span className="pm-pubc-meta-chip"><i className="fas fa-bullseye" aria-hidden="true" /> {goalLabel}</span>
              )}
              <span className="pm-pubc-meta-chip">
                <i className="fas fa-calendar" aria-hidden="true" />
                {new Date(campaign.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {campaign.endDate && (
                  <> – {new Date(campaign.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                )}
              </span>
            </div>
          </div>
          {campaign.goalTarget && (
            <GoalRing progress={campaign.goalProgress} target={campaign.goalTarget} color={accent} />
          )}
        </div>
      </div>

      <div className="pm-pubc-content">
        {/* Signup form */}
        <section className="pm-pubc-signup-section">
          <h2 className="pm-pubc-section-title">
            <i className="fas fa-user-plus" aria-hidden="true" /> Get Involved
          </h2>
          {submitted ? (
            <div className="pm-pubc-success">
              <i className="fas fa-check-circle" aria-hidden="true" />
              <h3>Thanks for signing up!</h3>
              <p>We'll be in touch soon with next steps.</p>
            </div>
          ) : (
            <form className="pm-pubc-form" onSubmit={handleSubmit}>
              <div className="pm-pubc-form-row">
                <input
                  type="text"
                  className="pm-pubc-input"
                  placeholder="Full name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
                <input
                  type="email"
                  className="pm-pubc-input"
                  placeholder="Email address"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <input
                type="text"
                className="pm-pubc-input"
                placeholder="Role / interest (optional, e.g. 'sponsor', 'mentor', 'undergrad ME')"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              />
              <button
                type="submit"
                className="pm-pubc-submit"
                style={{ background: accent }}
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Sign Up'}
              </button>
            </form>
          )}
        </section>

        {/* Recent posts */}
        {campaign.submissions?.length > 0 && (
          <section className="pm-pubc-posts-section">
            <h2 className="pm-pubc-section-title">
              <i className="fas fa-newspaper" aria-hidden="true" /> Recent Updates
            </h2>
            <div className="pm-pubc-posts-grid">
              {campaign.submissions.map(s => (
                <div key={s.id} className="pm-pubc-post-card">
                  {s.mediaUrls?.[0] && (
                    <img src={s.mediaUrls[0]} alt="" className="pm-pubc-post-image" />
                  )}
                  <div className="pm-pubc-post-body">
                    <h3 className="pm-pubc-post-title">{s.title}</h3>
                    {s.content && <p className="pm-pubc-post-content">{s.content}</p>}
                    <div className="pm-pubc-post-meta">
                      {(s.platform ?? []).map(p => {
                        const m = PLATFORM_META[p];
                        if (!m) return null;
                        return (
                          <span key={p} title={m.label}>
                            <i className={m.icon} aria-hidden="true" />
                          </span>
                        );
                      })}
                      {s.publishedAt && (
                        <span className="pm-pubc-post-date">
                          {new Date(s.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="pm-pubc-footer">
        <span>Purdue SEARCH · Engineering, Science, Architecture, Research, Computing, Healthcare</span>
      </footer>
    </div>
  );
}
