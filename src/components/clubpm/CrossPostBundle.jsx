import React, { useState, useEffect } from 'react';
import { patch } from '../../api/clubPmClient';
import toast from 'react-hot-toast';
import PlatformPreview from './PlatformPreview';

// ── Helpers ───────────────────────────────────────────────────

const PLATFORM_META = {
  instagram: { icon: 'fab fa-instagram', color: '#e1306c', label: 'Instagram', limit: 2200 },
  linkedin:  { icon: 'fab fa-linkedin',  color: '#0077b5', label: 'LinkedIn',  limit: 3000 },
  twitter:   { icon: 'fab fa-twitter',   color: '#1da1f2', label: 'X / Twitter', limit: 280 },
  website:   { icon: 'fas fa-globe',     color: 'var(--pm-accent-teal)', label: 'Website', limit: null },
};

function splitThread(text, limit = 280) {
  if (!text || text.length <= limit) return [text];
  const tweets = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) { tweets.push(remaining); break; }
    let cutAt = remaining.lastIndexOf(' ', limit - 10);
    if (cutAt < 200) cutAt = limit - 10;
    tweets.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  return tweets;
}

function separateHashtags(text) {
  if (!text) return { caption: '', hashtags: '' };
  const words = text.split(/\s+/);
  const firstHashIdx = words.findIndex(w => w.startsWith('#'));
  if (firstHashIdx < 0) return { caption: text, hashtags: '' };
  return {
    caption: words.slice(0, firstHashIdx).join(' '),
    hashtags: words.slice(firstHashIdx).join(' '),
  };
}

function copyToClipboard(text) {
  return navigator.clipboard.writeText(text)
    .then(() => toast.success('Copied!'))
    .catch(() => toast.error('Copy failed — select and copy manually.'));
}

// ── CopyRow ───────────────────────────────────────────────────

function CopyRow({ label, value, children }) {
  return (
    <div className="pm-bundle-copy-row">
      <span className="pm-bundle-copy-label">{label}</span>
      <div className="pm-bundle-copy-content">
        {children ?? <pre className="pm-bundle-copy-pre">{value}</pre>}
      </div>
      <button
        className="pm-copy-btn"
        onClick={() => copyToClipboard(value)}
        title={`Copy ${label}`}
        aria-label={`Copy ${label} to clipboard`}
      >
        <i className="fas fa-clipboard" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── InstagramBundle ───────────────────────────────────────────

function InstagramBundle({ content, mediaUrls, onMarkPosted, isMarked }) {
  const { caption, hashtags } = separateHashtags(content);
  return (
    <div className="pm-bundle-platform-body">
      <PlatformPreview platform="instagram" content={content} mediaUrls={mediaUrls} />
      <div className="pm-bundle-actions">
        {caption && <CopyRow label="Caption" value={caption} />}
        {hashtags && <CopyRow label="First Comment (Hashtags)" value={hashtags} />}
        {mediaUrls.length > 0 && (
          <div className="pm-bundle-copy-row">
            <span className="pm-bundle-copy-label">Image</span>
            <div className="pm-bundle-copy-content">
              <a href={mediaUrls[0]} target="_blank" rel="noopener noreferrer" className="pm-bundle-download-link">
                <i className="fas fa-download" aria-hidden="true" /> Download
              </a>
            </div>
          </div>
        )}
        <button
          className={`pm-bundle-mark-btn${isMarked ? ' pm-bundle-mark-btn--done' : ''}`}
          onClick={onMarkPosted}
        >
          <i className={`fas fa-${isMarked ? 'check-circle' : 'circle'}`} aria-hidden="true" />
          {isMarked ? 'Posted on Instagram' : 'Mark as Posted'}
        </button>
      </div>
    </div>
  );
}

// ── LinkedInBundle ────────────────────────────────────────────

function LinkedInBundle({ content, mediaUrls, onMarkPosted, isMarked }) {
  return (
    <div className="pm-bundle-platform-body">
      <PlatformPreview platform="linkedin" content={content} mediaUrls={mediaUrls} />
      <div className="pm-bundle-actions">
        {content && <CopyRow label="Post" value={content} />}
        {mediaUrls.length > 0 && (
          <div className="pm-bundle-copy-row">
            <span className="pm-bundle-copy-label">Image</span>
            <div className="pm-bundle-copy-content">
              <a href={mediaUrls[0]} target="_blank" rel="noopener noreferrer" className="pm-bundle-download-link">
                <i className="fas fa-download" aria-hidden="true" /> Download
              </a>
            </div>
          </div>
        )}
        <button
          className={`pm-bundle-mark-btn${isMarked ? ' pm-bundle-mark-btn--done' : ''}`}
          onClick={onMarkPosted}
        >
          <i className={`fas fa-${isMarked ? 'check-circle' : 'circle'}`} aria-hidden="true" />
          {isMarked ? 'Posted on LinkedIn' : 'Mark as Posted'}
        </button>
      </div>
    </div>
  );
}

// ── TwitterBundle ─────────────────────────────────────────────

function TwitterBundle({ content, mediaUrls, onMarkPosted, isMarked }) {
  const tweets = splitThread(content ?? '', 280);
  const isThread = tweets.length > 1;
  const fullThread = tweets.map((t, i) => `${i + 1}/${tweets.length}\n${t}`).join('\n\n');

  return (
    <div className="pm-bundle-platform-body">
      <PlatformPreview platform="twitter" content={content} mediaUrls={mediaUrls} />
      <div className="pm-bundle-actions">
        {isThread ? (
          <>
            <CopyRow label="Copy full thread" value={fullThread} />
            {tweets.map((tweet, i) => (
              <CopyRow key={i} label={`Tweet ${i + 1}/${tweets.length}`} value={tweet} />
            ))}
          </>
        ) : (
          content && <CopyRow label="Tweet" value={content} />
        )}
        {mediaUrls.length > 0 && (
          <div className="pm-bundle-copy-row">
            <span className="pm-bundle-copy-label">Image</span>
            <div className="pm-bundle-copy-content">
              <a href={mediaUrls[0]} target="_blank" rel="noopener noreferrer" className="pm-bundle-download-link">
                <i className="fas fa-download" aria-hidden="true" /> Download
              </a>
            </div>
          </div>
        )}
        <button
          className={`pm-bundle-mark-btn${isMarked ? ' pm-bundle-mark-btn--done' : ''}`}
          onClick={onMarkPosted}
        >
          <i className={`fas fa-${isMarked ? 'check-circle' : 'circle'}`} aria-hidden="true" />
          {isMarked ? 'Posted on X / Twitter' : 'Mark as Posted'}
        </button>
      </div>
    </div>
  );
}

// ── WebsiteBundle ─────────────────────────────────────────────

function WebsiteBundle({ content, mediaUrls, onMarkPosted, isMarked }) {
  return (
    <div className="pm-bundle-platform-body">
      <PlatformPreview platform="website" content={content} mediaUrls={mediaUrls} />
      <div className="pm-bundle-actions">
        {content && <CopyRow label="Content" value={content} />}
        <button
          className={`pm-bundle-mark-btn${isMarked ? ' pm-bundle-mark-btn--done' : ''}`}
          onClick={onMarkPosted}
        >
          <i className={`fas fa-${isMarked ? 'check-circle' : 'circle'}`} aria-hidden="true" />
          {isMarked ? 'Published on Website' : 'Mark as Published'}
        </button>
      </div>
    </div>
  );
}

// ── CrossPostBundle ───────────────────────────────────────────

export default function CrossPostBundle({ submission, onClose, onPublished }) {
  const platforms = (submission?.platform ?? []).filter(p => PLATFORM_META[p]);
  const [activeTab, setActiveTab] = useState(platforms[0] ?? 'instagram');
  const [markedPlatforms, setMarkedPlatforms] = useState(new Set());
  const [publishing, setPublishing] = useState(false);

  // Escape key to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const platformContent = submission?.platformContent ?? {};
  const mediaUrls = Array.isArray(submission?.mediaUrls)
    ? submission.mediaUrls.filter(Boolean)
    : [];

  const getContent = (platform) =>
    platformContent[platform]?.caption ?? submission?.content ?? '';

  const markPosted = (platform) => {
    const next = new Set(markedPlatforms);
    next.add(platform);
    setMarkedPlatforms(next);
    toast.success(`Marked as posted on ${PLATFORM_META[platform]?.label ?? platform}.`);
  };

  const allMarked = platforms.length > 0 && platforms.every(p => markedPlatforms.has(p));

  const handleMarkPublished = async () => {
    setPublishing(true);
    try {
      await patch(`/api/outreach/submissions/${submission.id}`, { status: 'PUBLISHED' });
      toast.success('Marked as Published!');
      onPublished?.();
      onClose();
    } catch (err) {
      toast.error(err.message ?? 'Failed to mark as published.');
    } finally {
      setPublishing(false);
    }
  };

  const renderPlatform = (p) => {
    const content = getContent(p);
    const isMarked = markedPlatforms.has(p);
    const props = { content, mediaUrls, isMarked, onMarkPosted: () => markPosted(p) };
    switch (p) {
      case 'instagram': return <InstagramBundle key={p} {...props} />;
      case 'linkedin':  return <LinkedInBundle  key={p} {...props} />;
      case 'twitter':   return <TwitterBundle   key={p} {...props} />;
      case 'website':   return <WebsiteBundle   key={p} {...props} />;
      default:          return null;
    }
  };

  return (
    <div
      className="pm-copy-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Publish Bundle"
      onClick={onClose}
    >
      <div className="pm-bundle-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pm-bundle-header">
          <div>
            <h2 className="pm-bundle-title">
              <i className="fas fa-share-alt" aria-hidden="true" /> Publish Bundle
            </h2>
            <p className="pm-bundle-subtitle">{submission?.title}</p>
          </div>
          <button className="pm-copy-close-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        {/* Platform tab bar */}
        {platforms.length > 1 && (
          <div className="pm-bundle-tabs">
            {platforms.map(p => {
              const meta = PLATFORM_META[p];
              const isActive = activeTab === p;
              const isMarked = markedPlatforms.has(p);
              return (
                <button
                  key={p}
                  className={`pm-bundle-tab${isActive ? ' pm-bundle-tab--active' : ''}${isMarked ? ' pm-bundle-tab--done' : ''}`}
                  style={isActive ? { borderBottomColor: meta.color, color: meta.color } : {}}
                  onClick={() => setActiveTab(p)}
                >
                  <i className={meta.icon} aria-hidden="true" />
                  {meta.label}
                  {isMarked && <i className="fas fa-check pm-bundle-tab-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Platform content */}
        <div className="pm-bundle-body">
          {platforms.length === 0 ? (
            <div className="pm-outreach-empty" style={{ padding: 24 }}>
              <i className="fas fa-exclamation-circle" aria-hidden="true" />
              <p>No platforms selected for this submission.</p>
            </div>
          ) : (
            renderPlatform(activeTab)
          )}
        </div>

        {/* Footer — publish when all platforms marked */}
        <div className="pm-bundle-footer">
          {platforms.length > 1 && (
            <span className="pm-bundle-progress">
              {markedPlatforms.size}/{platforms.length} platforms posted
            </span>
          )}
          <button
            className="pm-copy-publish-btn"
            onClick={handleMarkPublished}
            disabled={publishing}
          >
            {publishing
              ? <span className="pm-bulk-spinner" aria-hidden="true" />
              : <i className={`fas fa-${allMarked ? 'check-double' : 'check-circle'}`} aria-hidden="true" />
            }
            {publishing ? 'Updating…' : 'Mark as Published'}
          </button>
        </div>
      </div>
    </div>
  );
}
