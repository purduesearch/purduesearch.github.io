import React, { useState, useRef, useCallback, useEffect } from 'react';
import { post, patch } from '../../api/clubPmClient';
import toast from 'react-hot-toast';
import PlatformPreview from './PlatformPreview';
import AiAssistPanel from './AiAssistPanel';
import AssetPicker from './AssetPicker';
import TemplatePicker from './TemplatePicker';
import useSuggestBestTime from './useSuggestBestTime';
import NewsletterEditor from './NewsletterEditor';
import SubscriberManager from './SubscriberManager';

// ── Constants ─────────────────────────────────────────────────

const SUBMISSION_TYPES = [
  { value: 'SOCIAL_POST',  label: 'Social Post' },
  { value: 'NEWSLETTER',   label: 'Newsletter' },
  { value: 'PHOTO',        label: 'Photo' },
  { value: 'VIDEO',        label: 'Video' },
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
  { value: 'EVENT_PROMO',  label: 'Event Promo' },
];

const PLATFORM_META = {
  instagram: { icon: 'fab fa-instagram', color: '#e1306c', label: 'Instagram', limit: 2200 },
  linkedin:  { icon: 'fab fa-linkedin',  color: '#0077b5', label: 'LinkedIn',  limit: 3000 },
  twitter:   { icon: 'fab fa-twitter',   color: '#1da1f2', label: 'X / Twitter', limit: 280 },
  website:   { icon: 'fas fa-globe',     color: 'var(--pm-accent-teal)', label: 'Website', limit: null },
};

const ALL_PLATFORMS = Object.keys(PLATFORM_META);

// ── CharCounter ───────────────────────────────────────────────

function CharCounter({ content, platforms }) {
  if (!platforms.length) return null;
  return (
    <div className="pm-char-counter-row">
      {platforms.map(p => {
        const meta = PLATFORM_META[p];
        if (!meta || !meta.limit) return null;
        const len = (content ?? '').length;
        const pct = len / meta.limit;
        const isWarn  = pct >= 0.8;
        const isError = len > meta.limit;
        return (
          <span
            key={p}
            className={`pm-char-chip${isError ? ' pm-char-chip--error' : isWarn ? ' pm-char-chip--warn' : ''}`}
            title={meta.label}
          >
            <i className={meta.icon} aria-hidden="true" />
            {' '}{len}/{meta.limit}
            {p === 'twitter' && len > meta.limit && (
              <span className="pm-char-thread-note"> (thread: {Math.ceil(len / meta.limit)} tweets)</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ── PlatformToggle ────────────────────────────────────────────

function PlatformToggle({ selected, onChange }) {
  const toggle = (p) => {
    onChange(selected.includes(p) ? selected.filter(x => x !== p) : [...selected, p]);
  };
  return (
    <div className="pm-composer-platform-toggles">
      {ALL_PLATFORMS.map(p => {
        const meta = PLATFORM_META[p];
        const active = selected.includes(p);
        return (
          <button
            key={p}
            type="button"
            className={`pm-composer-platform-btn${active ? ' pm-composer-platform-btn--active' : ''}`}
            style={active ? { borderColor: meta.color, color: meta.color } : {}}
            onClick={() => toggle(p)}
            title={meta.label}
          >
            <i className={meta.icon} aria-hidden="true" />
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── OverrideTabs ──────────────────────────────────────────────

function OverrideTabs({ platforms, overrides, onChange, baseContent }) {
  const [activeTab, setActiveTab] = useState(null);

  // Keep activeTab valid
  useEffect(() => {
    if (activeTab && !platforms.includes(activeTab)) {
      setActiveTab(null);
    }
  }, [platforms, activeTab]);

  if (platforms.length < 2) return null;

  const handleToggleTab = (p) => {
    setActiveTab(prev => prev === p ? null : p);
  };

  const currentContent = activeTab
    ? (overrides[activeTab] ?? baseContent ?? '')
    : '';

  const handleChange = (val) => {
    if (!activeTab) return;
    onChange({ ...overrides, [activeTab]: val });
  };

  const handleClear = () => {
    if (!activeTab) return;
    const next = { ...overrides };
    delete next[activeTab];
    onChange(next);
  };

  const hasAnyOverride = platforms.some(p => overrides[p] !== undefined);

  return (
    <div className="pm-composer-overrides">
      <div className="pm-composer-overrides-header">
        <span className="pm-composer-overrides-label">Per-Platform Customization</span>
        {hasAnyOverride && <span className="pm-composer-overrides-hint">Overrides active</span>}
      </div>
      <div className="pm-composer-override-tabs">
        {platforms.map(p => {
          const meta = PLATFORM_META[p];
          const hasOverride = overrides[p] !== undefined;
          const isActive = activeTab === p;
          return (
            <button
              key={p}
              type="button"
              className={`pm-composer-override-tab${isActive ? ' pm-composer-override-tab--active' : ''}${hasOverride ? ' pm-composer-override-tab--has-override' : ''}`}
              style={isActive ? { borderBottomColor: meta.color, color: meta.color } : {}}
              onClick={() => handleToggleTab(p)}
            >
              <i className={meta.icon} aria-hidden="true" />
              {meta.label}
              {hasOverride && <span className="pm-override-dot" />}
            </button>
          );
        })}
      </div>

      {activeTab && (
        <div className="pm-composer-override-editor">
          <textarea
            className="cpm-form-textarea pm-composer-override-textarea"
            value={currentContent}
            onChange={e => handleChange(e.target.value)}
            placeholder={`Custom ${PLATFORM_META[activeTab]?.label ?? activeTab} copy… (defaults to base content)`}
            rows={5}
          />
          <div className="pm-composer-override-footer">
            <CharCounter content={currentContent} platforms={[activeTab]} />
            {overrides[activeTab] !== undefined && (
              <button
                type="button"
                className="pm-composer-override-clear"
                onClick={handleClear}
              >
                <i className="fas fa-times" aria-hidden="true" /> Use base content
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PreviewSection ────────────────────────────────────────────

function PreviewSection({ platforms, overrides, baseContent, mediaUrls }) {
  const [activePreview, setActivePreview] = useState(null);

  useEffect(() => {
    if (!activePreview && platforms.length) setActivePreview(platforms[0]);
    if (activePreview && !platforms.includes(activePreview)) setActivePreview(platforms[0] ?? null);
  }, [platforms]);

  if (!platforms.length) return null;

  const previewContent = activePreview
    ? (overrides[activePreview] ?? baseContent ?? '')
    : '';

  return (
    <div className="pm-composer-preview-section">
      <div className="pm-composer-preview-header">
        <span className="pm-composer-preview-label">Live Preview</span>
        <div className="pm-composer-preview-tabs">
          {platforms.map(p => {
            const meta = PLATFORM_META[p];
            return (
              <button
                key={p}
                type="button"
                className={`pm-composer-preview-tab${activePreview === p ? ' pm-composer-preview-tab--active' : ''}`}
                style={activePreview === p ? { borderColor: meta.color, color: meta.color } : {}}
                onClick={() => setActivePreview(p)}
              >
                <i className={meta.icon} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      {activePreview && (
        <PlatformPreview
          platform={activePreview}
          content={previewContent}
          mediaUrls={mediaUrls}
        />
      )}
    </div>
  );
}

// ── ComposerTab ───────────────────────────────────────────────

export default function ComposerTab({ onSaved }) {
  const [title, setTitle]               = useState('');
  const [type, setType]                 = useState('SOCIAL_POST');
  const [platforms, setPlatforms]       = useState([]);
  const [baseContent, setBaseContent]   = useState('');
  const [overrides, setOverrides]       = useState({});
  const [scheduledAt, setScheduledAt]   = useState('');
  const [isTemplate, setIsTemplate]     = useState(false);
  const [saving, setSaving]             = useState(false);
  const [savedId, setSavedId]           = useState(null);
  const [showPreview, setShowPreview]   = useState(false);
  const [showAiPanel, setShowAiPanel]   = useState(true);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showSubscribers, setShowSubscribers]       = useState(false);
  const [newsletterHtml, setNewsletterHtml]         = useState('');
  const [sendingNewsletter, setSendingNewsletter]   = useState(false);
  const { suggest: suggestBestTime, suggesting: suggestingTime, lastInfo: suggestedTimeInfo } = useSuggestBestTime();

  const contentRef = useRef(null);

  const reset = useCallback(() => {
    setTitle('');
    setType('SOCIAL_POST');
    setPlatforms([]);
    setBaseContent('');
    setOverrides({});
    setScheduledAt('');
    setIsTemplate(false);
    setSavedId(null);
    setMediaUrls([]);
  }, []);

  // Insert variant into base content
  const handleInsertVariant = useCallback((text) => {
    setBaseContent(text);
    contentRef.current?.focus();
  }, []);

  // Append hashtags to base content
  const handleInsertHashtags = useCallback((tags) => {
    const tagStr = tags.map(t => `#${t}`).join(' ');
    setBaseContent(prev => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed}\n\n${tagStr}` : tagStr;
    });
    contentRef.current?.focus();
  }, []);

  // Replace base content with voice rewrite
  const handleVoiceRewrite = useCallback((text) => {
    setBaseContent(text);
    contentRef.current?.focus();
  }, []);

  const buildPayload = (status) => {
    const platformContent = {};
    platforms.forEach(p => {
      if (overrides[p] !== undefined) {
        platformContent[p] = { caption: overrides[p] };
      }
    });
    return {
      title: title.trim(),
      type,
      status,
      content: baseContent.trim() || undefined,
      platform: platforms,
      mediaUrls: mediaUrls.length ? mediaUrls : undefined,
      platformContent: Object.keys(platformContent).length ? platformContent : undefined,
      scheduledAt: scheduledAt || undefined,
      isTemplate,
    };
  };

  const handleSave = async (status = 'DRAFT') => {
    if (!title.trim()) {
      toast.error('Title is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(status);
      let result;
      if (savedId) {
        result = await patch(`/api/outreach/submissions/${savedId}`, payload);
      } else {
        result = await post('/api/outreach/submissions', payload);
        setSavedId(result.id);
      }
      onSaved?.(result);
      toast.success(status === 'SUBMITTED' ? 'Submitted for review!' : 'Draft saved.');
      if (status === 'SUBMITTED') reset();
    } catch (err) {
      toast.error(err.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const [mediaUrls, setMediaUrls] = useState([]);

  const handleAssetSelect = useCallback((asset) => {
    if (!mediaUrls.includes(asset.url)) {
      setMediaUrls(prev => [...prev, asset.url]);
      toast.success(`${asset.name} added.`);
    }
    setShowAssetPicker(false);
  }, [mediaUrls]);

  return (
    <div className="pm-composer-layout">
      {/* Main form column */}
      <div className="pm-composer-main">
        <div className="pm-composer-form">
          {/* Title */}
          <div className="cpm-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="cpm-form-label">Title *</label>
              <button
                type="button"
                className="pm-composer-template-btn"
                onClick={() => setShowTemplatePicker(true)}
                title="Browse template library"
              >
                <i className="fas fa-clone" aria-hidden="true" /> Use template
              </button>
            </div>
            <input
              type="text"
              className="cpm-form-input"
              placeholder="e.g. Fall Callout Announcement"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Type + Platform row */}
          <div className="pm-composer-row">
            <div className="cpm-form-group pm-composer-type-group">
              <label className="cpm-form-label">Type</label>
              <select
                className="cpm-form-select"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                {SUBMISSION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="cpm-form-group pm-composer-platform-group">
              <label className="cpm-form-label">Platforms</label>
              <PlatformToggle selected={platforms} onChange={setPlatforms} />
            </div>
          </div>

          {/* Base content */}
          <div className="cpm-form-group">
            <div className="pm-composer-content-header">
              <label className="cpm-form-label">Base Content</label>
              {platforms.length > 0 && (
                <button
                  type="button"
                  className="pm-composer-preview-toggle"
                  onClick={() => setShowPreview(v => !v)}
                >
                  <i className={`fas fa-${showPreview ? 'eye-slash' : 'eye'}`} aria-hidden="true" />
                  {showPreview ? 'Hide preview' : 'Preview'}
                </button>
              )}
            </div>
            <textarea
              ref={contentRef}
              className="cpm-form-textarea pm-composer-textarea"
              placeholder="Write your content here. Use the AI panel on the right to generate or improve it."
              value={baseContent}
              onChange={e => setBaseContent(e.target.value)}
              rows={8}
            />
            <CharCounter content={baseContent} platforms={platforms} />
          </div>

          {/* Newsletter rich-text editor */}
          {type === 'NEWSLETTER' && (
            <NewsletterEditor
              submissionId={savedId}
              initialHtml={newsletterHtml}
              onChange={setNewsletterHtml}
            />
          )}

          {/* Live preview */}
          {showPreview && platforms.length > 0 && (
            <PreviewSection
              platforms={platforms}
              overrides={overrides}
              baseContent={baseContent}
              mediaUrls={mediaUrls}
            />
          )}

          {/* Media / Assets */}
          <div className="cpm-form-group">
            <div className="pm-composer-content-header">
              <label className="cpm-form-label">Media</label>
              <button
                type="button"
                className="pm-composer-preview-toggle"
                onClick={() => setShowAssetPicker(true)}
              >
                <i className="fas fa-photo-video" aria-hidden="true" /> Asset Library
              </button>
            </div>
            {mediaUrls.length > 0 ? (
              <div className="pm-composer-media-list">
                {mediaUrls.map((url, i) => (
                  <div key={url} className="pm-composer-media-item">
                    <img src={url} alt="" className="pm-composer-media-thumb" onError={e => { e.target.style.display='none'; }} />
                    <span className="pm-composer-media-url" title={url}>{url}</span>
                    <button
                      type="button"
                      className="pm-composer-media-remove"
                      onClick={() => setMediaUrls(prev => prev.filter((_, j) => j !== i))}
                      title="Remove"
                    >
                      <i className="fas fa-times" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pm-composer-media-empty">No media attached. Use the Asset Library to browse or add images.</p>
            )}
          </div>

          {/* Per-platform overrides */}
          {platforms.length > 1 && (
            <OverrideTabs
              platforms={platforms}
              overrides={overrides}
              onChange={setOverrides}
              baseContent={baseContent}
            />
          )}

          {/* Schedule + Template */}
          <div className="pm-composer-row pm-composer-schedule-row">
            <div className="cpm-form-group pm-composer-schedule-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="cpm-form-label" style={{ margin: 0 }}>
                  <i className="fas fa-clock" aria-hidden="true" /> Schedule (optional)
                </label>
                <button
                  type="button"
                  className="pm-suggest-time-btn"
                  onClick={async () => {
                    const value = await suggestBestTime(platforms);
                    if (value) setScheduledAt(value);
                  }}
                  disabled={suggestingTime || platforms.length === 0}
                  title="Suggest the best time to post based on past engagement"
                >
                  {suggestingTime
                    ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Suggesting…</>
                    : <><i className="fas fa-magic" aria-hidden="true" /> Suggest best time</>}
                </button>
              </div>
              <input
                type="datetime-local"
                className="cpm-form-input"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
              />
              {suggestedTimeInfo && (
                <div className="pm-suggest-time-info">{suggestedTimeInfo}</div>
              )}
            </div>
            <div className="pm-composer-template-check">
              <label className="pm-composer-template-label">
                <input
                  type="checkbox"
                  checked={isTemplate}
                  onChange={e => setIsTemplate(e.target.checked)}
                  className="pm-composer-template-input"
                />
                Save as reusable template
              </label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pm-composer-actions">
            <button
              type="button"
              className="cpm-btn cpm-btn--secondary"
              onClick={reset}
              disabled={saving}
            >
              <i className="fas fa-times" aria-hidden="true" /> Clear
            </button>
            <div className="pm-composer-actions-right">
              {savedId && (
                <span className="pm-composer-saved-hint">
                  <i className="fas fa-check-circle" aria-hidden="true" /> Draft saved
                </span>
              )}
              {type === 'NEWSLETTER' && (
                <>
                  <button
                    type="button"
                    className="cpm-btn cpm-btn--secondary"
                    onClick={() => setShowSubscribers(true)}
                    title="Manage newsletter subscribers"
                  >
                    <i className="fas fa-users" aria-hidden="true" /> Subscribers
                  </button>
                  {savedId && (
                    <button
                      type="button"
                      className="cpm-btn cpm-btn--primary"
                      onClick={async () => {
                        if (!newsletterHtml?.trim()) {
                          toast.error('Newsletter body is empty');
                          return;
                        }
                        if (!window.confirm('Send to all confirmed subscribers? This cannot be undone.')) return;
                        setSendingNewsletter(true);
                        try {
                          const result = await post(`/api/outreach/submissions/${savedId}/newsletter/send`);
                          const r = result.result ?? {};
                          toast.success(`Sent to ${r.succeeded ?? 0} (${r.failed ?? 0} failed)`);
                        } catch (err) {
                          toast.error(err.message ?? 'Failed to send');
                        } finally {
                          setSendingNewsletter(false);
                        }
                      }}
                      disabled={sendingNewsletter}
                    >
                      {sendingNewsletter
                        ? <><span className="pm-bulk-spinner" /> Sending…</>
                        : <><i className="fas fa-paper-plane" aria-hidden="true" /> Send Newsletter</>}
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                className="cpm-btn cpm-btn--secondary"
                onClick={() => handleSave('DRAFT')}
                disabled={saving}
              >
                {saving ? <span className="pm-bulk-spinner" /> : <i className="fas fa-save" aria-hidden="true" />}
                {' '}Save Draft
              </button>
              <button
                type="button"
                className="cpm-btn cpm-btn--primary"
                onClick={() => handleSave('SUBMITTED')}
                disabled={saving}
              >
                {saving ? <span className="pm-bulk-spinner" /> : <i className="fas fa-paper-plane" aria-hidden="true" />}
                {' '}Submit for Review
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* AI Assist panel */}
      <div className={`pm-composer-sidebar${showAiPanel ? '' : ' pm-composer-sidebar--collapsed'}`}>
        <button
          type="button"
          className="pm-composer-sidebar-toggle"
          onClick={() => setShowAiPanel(v => !v)}
          title={showAiPanel ? 'Collapse AI panel' : 'Open AI panel'}
        >
          <i className={`fas fa-${showAiPanel ? 'chevron-right' : 'robot'}`} aria-hidden="true" />
          {!showAiPanel && <span className="pm-composer-sidebar-toggle-label">AI</span>}
        </button>

        {showAiPanel && (
          <AiAssistPanel
            content={baseContent}
            selectedPlatforms={platforms}
            submissionId={savedId}
            onInsertVariant={handleInsertVariant}
            onInsertHashtags={handleInsertHashtags}
            onVoiceRewrite={handleVoiceRewrite}
          />
        )}
      </div>

      <AssetPicker
        isOpen={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        onSelect={handleAssetSelect}
        title="Select Media Asset"
      />

      <TemplatePicker
        isOpen={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onTemplateInstantiated={(created) => {
          // Load the freshly-created draft into composer state
          setTitle(created.title ?? '');
          setType(created.type ?? 'SOCIAL_POST');
          setPlatforms(created.platform ?? []);
          setBaseContent(created.content ?? '');
          setMediaUrls(created.mediaUrls ?? []);
          setScheduledAt(created.scheduledAt ? created.scheduledAt.slice(0, 16) : '');
          setSavedId(created.id);
          setIsTemplate(false);
          onSaved?.(created);
          toast.success('Template loaded into composer — review & save');
        }}
      />

      <SubscriberManager
        isOpen={showSubscribers}
        onClose={() => setShowSubscribers(false)}
      />
    </div>
  );
}
