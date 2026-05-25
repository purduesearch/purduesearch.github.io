import React, { useState, useEffect } from 'react';
import { get, post } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin',  label: 'LinkedIn' },
  { value: 'twitter',   label: 'X / Twitter' },
  { value: 'website',   label: 'Website' },
];

export default function AiAssistPanel({
  content,         // current base content
  selectedPlatforms,
  submissionId,    // set after first save — for UTM links
  onInsertVariant, // (text) => void
  onInsertHashtags, // (tags) => void
  onVoiceRewrite,  // (text) => void
  onImageGenerated, // (asset) => void
}) {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');

  // Draft section
  const [draftBrief, setDraftBrief] = useState('');
  const [draftPlatform, setDraftPlatform] = useState(selectedPlatforms?.[0] ?? 'instagram');
  const [draftLoading, setDraftLoading] = useState(false);
  const [variants, setVariants] = useState([]);

  // Hashtag section
  const [hashtagLoading, setHashtagLoading] = useState(false);
  const [hashtagSuggestions, setHashtagSuggestions] = useState([]);

  // Voice section
  const [voiceLoading, setVoiceLoading] = useState(false);

  // UTM section
  const [utmUrl, setUtmUrl] = useState('');
  const [utmLoading, setUtmLoading] = useState(false);
  const [utmLinks, setUtmLinks] = useState([]);
  const [utmPlatform, setUtmPlatform] = useState(selectedPlatforms?.[0] ?? 'instagram');

  // Image generation section
  const [imgPrompt, setImgPrompt]     = useState('');
  const [imgAspect, setImgAspect]     = useState('square');
  const [imgQuality, setImgQuality]   = useState('standard');
  const [imgLoading, setImgLoading]   = useState(false);
  const [imgResult, setImgResult]     = useState(null);

  async function handleGenerateImage() {
    if (!imgPrompt.trim()) { toast.error('Enter a prompt first.'); return; }
    setImgLoading(true);
    setImgResult(null);
    try {
      const { asset } = await post('/api/outreach/ai/generate-image', {
        prompt:      imgPrompt.trim(),
        aspectRatio: imgAspect,
        quality:     imgQuality,
      });
      setImgResult(asset);
      onImageGenerated?.(asset);
      toast.success('Image generated');
    } catch (err) {
      toast.error(err.message ?? 'Failed to generate image');
    } finally {
      setImgLoading(false);
    }
  }

  useEffect(() => {
    get('/api/outreach/brand-voices')
      .then(v => {
        setVoices(Array.isArray(v) ? v : []);
        const def = v.find(x => x.isDefault);
        if (def) setSelectedVoice(def.name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (submissionId) {
      get(`/api/outreach/submissions/${submissionId}/utm-links`)
        .then(links => setUtmLinks(Array.isArray(links) ? links : []))
        .catch(() => {});
    }
  }, [submissionId]);

  // Keep draft platform in sync when selected platforms change
  useEffect(() => {
    if (selectedPlatforms?.length && !selectedPlatforms.includes(draftPlatform)) {
      setDraftPlatform(selectedPlatforms[0]);
    }
  }, [selectedPlatforms]);

  const handleDraftForMe = async () => {
    const brief = draftBrief.trim() || content?.trim();
    if (!brief) {
      toast.error('Add a brief or write some content first.');
      return;
    }
    setDraftLoading(true);
    setVariants([]);
    try {
      const { variants: v } = await post('/api/outreach/ai/draft', {
        content: brief,
        platform: draftPlatform,
        voiceName: selectedVoice || undefined,
      });
      setVariants(Array.isArray(v) ? v : []);
      if (!v?.length) toast.error('No variants returned — try a different brief.');
    } catch (err) {
      toast.error(err.message ?? 'AI draft failed.');
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSuggestHashtags = async () => {
    const c = content?.trim();
    if (!c) {
      toast.error('Write some content first.');
      return;
    }
    setHashtagLoading(true);
    setHashtagSuggestions([]);
    try {
      const { hashtags } = await post('/api/outreach/ai/hashtags', { content: c });
      setHashtagSuggestions(Array.isArray(hashtags) ? hashtags : []);
      if (!hashtags?.length) toast('No hashtag suggestions — try adding more content.');
    } catch (err) {
      toast.error(err.message ?? 'Hashtag suggestion failed.');
    } finally {
      setHashtagLoading(false);
    }
  };

  const handleMatchVoice = async () => {
    const c = content?.trim();
    if (!c) { toast.error('Write some content first.'); return; }
    if (!selectedVoice) { toast.error('Select a brand voice first.'); return; }
    setVoiceLoading(true);
    try {
      const { content: rewritten } = await post('/api/outreach/ai/voice', {
        content: c,
        voiceName: selectedVoice,
      });
      if (rewritten) {
        onVoiceRewrite?.(rewritten);
        toast.success('Content rewritten in ' + selectedVoice + ' voice.');
      }
    } catch (err) {
      toast.error(err.message ?? 'Voice rewrite failed.');
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleCreateUtm = async () => {
    if (!utmUrl.trim()) { toast.error('Enter a URL first.'); return; }
    if (!submissionId) {
      toast.error('Save a draft first to attach UTM links.');
      return;
    }
    setUtmLoading(true);
    try {
      const link = await post(`/api/outreach/submissions/${submissionId}/utm-links`, {
        targetUrl: utmUrl.trim(),
        platform: utmPlatform,
      });
      setUtmLinks(prev => [link, ...prev]);
      setUtmUrl('');
      toast.success('Short link created!');
    } catch (err) {
      toast.error(err.message ?? 'Failed to create link.');
    } finally {
      setUtmLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success('Copied!'))
      .catch(() => toast.error('Copy failed.'));
  };

  return (
    <div className="pm-ai-panel">
      <div className="pm-ai-panel-header">
        <i className="fas fa-robot" aria-hidden="true" />
        <span>AI Assist</span>
      </div>

      {/* Brand voice selector (shared across sections) */}
      {voices.length > 0 && (
        <div className="pm-ai-panel-section pm-ai-voice-row">
          <label className="pm-ai-panel-label">Brand Voice</label>
          <select
            className="cpm-form-select pm-ai-voice-select"
            value={selectedVoice}
            onChange={e => setSelectedVoice(e.target.value)}
          >
            <option value="">— None —</option>
            {voices.map(v => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Draft for me */}
      <div className="pm-ai-panel-section">
        <div className="pm-ai-panel-section-title">
          <i className="fas fa-magic" aria-hidden="true" /> Draft for Me
        </div>
        <textarea
          className="cpm-form-textarea pm-ai-brief-input"
          placeholder="One-line brief (or leave empty to use current content)…"
          value={draftBrief}
          onChange={e => setDraftBrief(e.target.value)}
          rows={2}
        />
        <div className="pm-ai-panel-row">
          <select
            className="cpm-form-select pm-ai-platform-select"
            value={draftPlatform}
            onChange={e => setDraftPlatform(e.target.value)}
          >
            {PLATFORM_OPTIONS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            className="cpm-btn cpm-btn--primary pm-ai-btn"
            onClick={handleDraftForMe}
            disabled={draftLoading}
          >
            {draftLoading
              ? <><span className="pm-bulk-spinner" /> Drafting…</>
              : <><i className="fas fa-magic" aria-hidden="true" /> Generate</>
            }
          </button>
        </div>

        {variants.length > 0 && (
          <div className="pm-ai-variants">
            <div className="pm-ai-variants-label">Click a variant to insert it:</div>
            {variants.map((v, i) => (
              <button
                key={i}
                className="pm-ai-variant-item"
                onClick={() => { onInsertVariant?.(v); toast.success('Variant inserted.'); }}
                title="Click to use this variant"
              >
                <span className="pm-ai-variant-num">{i + 1}</span>
                <span className="pm-ai-variant-text">{v}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Suggest hashtags */}
      <div className="pm-ai-panel-section">
        <div className="pm-ai-panel-section-title">
          <i className="fas fa-hashtag" aria-hidden="true" /> Suggest Hashtags
        </div>
        <button
          className="cpm-btn cpm-btn--secondary pm-ai-btn pm-ai-btn--full"
          onClick={handleSuggestHashtags}
          disabled={hashtagLoading}
        >
          {hashtagLoading
            ? <><span className="pm-bulk-spinner" /> Analyzing…</>
            : <><i className="fas fa-hashtag" aria-hidden="true" /> Suggest Hashtags</>
          }
        </button>
        {hashtagSuggestions.length > 0 && (
          <div className="pm-ai-hashtag-chips">
            {hashtagSuggestions.map((tag, i) => (
              <button
                key={i}
                className="pm-ai-hashtag-chip"
                onClick={() => {
                  onInsertHashtags?.([tag]);
                  setHashtagSuggestions(prev => prev.filter((_, j) => j !== i));
                }}
                title="Click to add to content"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Match voice */}
      {voices.length > 0 && (
        <div className="pm-ai-panel-section">
          <div className="pm-ai-panel-section-title">
            <i className="fas fa-microphone" aria-hidden="true" /> Match Voice
          </div>
          <button
            className="cpm-btn cpm-btn--secondary pm-ai-btn pm-ai-btn--full"
            onClick={handleMatchVoice}
            disabled={voiceLoading || !selectedVoice}
          >
            {voiceLoading
              ? <><span className="pm-bulk-spinner" /> Rewriting…</>
              : <><i className="fas fa-microphone" aria-hidden="true" /> Rewrite in {selectedVoice || 'Voice'}</>
            }
          </button>
        </div>
      )}

      {/* Image generation */}
      <div className="pm-ai-panel-section">
        <div className="pm-ai-panel-section-title">
          <i className="fas fa-image" aria-hidden="true" /> Generate Cover Image
        </div>
        <textarea
          className="cpm-form-textarea pm-ai-prompt-input"
          placeholder="Describe the image — e.g. 'team of engineering students huddled around a robotic prototype, dramatic studio lighting'"
          value={imgPrompt}
          onChange={e => setImgPrompt(e.target.value)}
          rows={2}
          maxLength={600}
        />
        <div className="pm-ai-imggen-row">
          <select
            className="cpm-form-select"
            value={imgAspect}
            onChange={e => setImgAspect(e.target.value)}
          >
            <option value="square">Square (1:1)</option>
            <option value="portrait">Portrait (3:4)</option>
            <option value="landscape">Landscape (4:3)</option>
          </select>
          <select
            className="cpm-form-select"
            value={imgQuality}
            onChange={e => setImgQuality(e.target.value)}
          >
            <option value="fast">Fast</option>
            <option value="standard">Standard</option>
            <option value="ultra">Ultra</option>
          </select>
          <button
            type="button"
            className="cpm-btn cpm-btn--primary pm-ai-btn"
            onClick={handleGenerateImage}
            disabled={imgLoading}
          >
            {imgLoading
              ? <><span className="pm-bulk-spinner" /> Generating…</>
              : <><i className="fas fa-magic" aria-hidden="true" /> Generate</>}
          </button>
        </div>
        {imgResult && (
          <div className="pm-ai-imggen-result">
            <img src={imgResult.url} alt={imgResult.altText ?? imgPrompt} />
            <div style={{ fontSize: 10, color: 'var(--clubpm-text-secondary)', marginTop: 4 }}>
              <i className="fas fa-check-circle" aria-hidden="true" style={{ color: 'var(--pm-accent-teal)' }} /> Added to your asset library &amp; attached to this post.
            </div>
          </div>
        )}
        <p className="pm-ai-panel-hint">Powered by Pollinations.ai. 25 images/day per tier (Fast · Standard · Ultra).</p>
      </div>

      {/* UTM Link Builder */}
      <div className="pm-ai-panel-section">
        <div className="pm-ai-panel-section-title">
          <i className="fas fa-link" aria-hidden="true" /> UTM Link Builder
        </div>
        {!submissionId && (
          <p className="pm-ai-panel-hint">Save a draft first to attach tracked links.</p>
        )}
        <div className="pm-ai-utm-row">
          <input
            type="url"
            className="cpm-form-input pm-ai-utm-input"
            placeholder="https://purduesearch.github.io/…"
            value={utmUrl}
            onChange={e => setUtmUrl(e.target.value)}
            disabled={!submissionId}
          />
          <select
            className="cpm-form-select pm-ai-utm-platform-select"
            value={utmPlatform}
            onChange={e => setUtmPlatform(e.target.value)}
            disabled={!submissionId}
          >
            {PLATFORM_OPTIONS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            className="cpm-btn cpm-btn--primary pm-ai-btn"
            onClick={handleCreateUtm}
            disabled={utmLoading || !submissionId}
          >
            {utmLoading ? <span className="pm-bulk-spinner" /> : <i className="fas fa-plus" aria-hidden="true" />}
          </button>
        </div>

        {utmLinks.length > 0 && (
          <ul className="pm-ai-utm-list">
            {utmLinks.map(link => (
              <li key={link.code} className="pm-ai-utm-item">
                <span className="pm-ai-utm-platform">
                  {link.platform ?? 'all'}
                </span>
                <code className="pm-ai-utm-code">{link.shortUrl}</code>
                <button
                  className="pm-copy-btn"
                  onClick={() => copyToClipboard(link.shortUrl)}
                  title="Copy short link"
                >
                  <i className="fas fa-copy" aria-hidden="true" />
                </button>
                <span className="pm-ai-utm-clicks">{link.clicks} clicks</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
