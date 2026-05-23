import React from 'react';

// Platform character limits
const PLATFORM_LIMITS = {
  instagram: 2200,
  linkedin: 3000,
  twitter: 280,
  website: null,
};

function threadSplit(text, limit = 280) {
  if (!text || text.length <= limit) return [text];
  const tweets = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      tweets.push(remaining);
      break;
    }
    // Try to split at a word boundary near limit
    let cutAt = remaining.lastIndexOf(' ', limit - 10);
    if (cutAt < 200) cutAt = limit - 10;
    tweets.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  return tweets;
}

// ── Instagram Preview ─────────────────────────────────────────

function InstagramPreview({ content, mediaUrls = [] }) {
  const hasMedia = mediaUrls.length > 0;
  const limit = PLATFORM_LIMITS.instagram;
  const over = content && content.length > limit;

  // Separate caption from hashtags (hashtags start with #)
  const words = (content ?? '').split(/\s+/);
  const hashtagStart = words.findIndex(w => w.startsWith('#'));
  const caption = hashtagStart > 0 ? words.slice(0, hashtagStart).join(' ') : (content ?? '');
  const hashtags = hashtagStart > 0 ? words.slice(hashtagStart).join(' ') : '';

  return (
    <div className="pm-preview-card pm-preview-instagram">
      <div className="pm-preview-card-header">
        <div className="pm-preview-avatar" />
        <div className="pm-preview-username">
          <span className="pm-preview-handle">searchclubpurdue</span>
          <span className="pm-preview-platform-label">
            <i className="fab fa-instagram" aria-hidden="true" /> Instagram
          </span>
        </div>
      </div>

      <div className="pm-preview-media">
        {hasMedia ? (
          <img src={mediaUrls[0]} alt="" className="pm-preview-media-img" />
        ) : (
          <div className="pm-preview-media-placeholder">
            <i className="fas fa-image" aria-hidden="true" />
            <span>No media attached</span>
          </div>
        )}
      </div>

      <div className="pm-preview-body">
        {content ? (
          <>
            <p className="pm-preview-caption">
              <strong>searchclubpurdue</strong>{' '}{caption}
            </p>
            {hashtags && (
              <p className="pm-preview-hashtags">{hashtags}</p>
            )}
          </>
        ) : (
          <p className="pm-preview-empty">Caption will appear here…</p>
        )}
        {over && (
          <p className="pm-preview-warning">
            <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {content.length}/{limit} — exceeds Instagram limit
          </p>
        )}
      </div>
    </div>
  );
}

// ── LinkedIn Preview ──────────────────────────────────────────

function LinkedInPreview({ content, mediaUrls = [] }) {
  const hasMedia = mediaUrls.length > 0;
  const limit = PLATFORM_LIMITS.linkedin;
  const over = content && content.length > limit;
  const [expanded, setExpanded] = React.useState(false);
  const previewLen = 280;
  const needsTruncation = content && content.length > previewLen;

  return (
    <div className="pm-preview-card pm-preview-linkedin">
      <div className="pm-preview-card-header">
        <div className="pm-preview-avatar pm-preview-avatar--linkedin" />
        <div className="pm-preview-username">
          <span className="pm-preview-handle">SEARCH Club at Purdue</span>
          <span className="pm-preview-subline">Student Organization · Just now</span>
          <span className="pm-preview-platform-label">
            <i className="fab fa-linkedin" aria-hidden="true" /> LinkedIn
          </span>
        </div>
      </div>

      {hasMedia && (
        <div className="pm-preview-media">
          <img src={mediaUrls[0]} alt="" className="pm-preview-media-img" />
        </div>
      )}

      <div className="pm-preview-body">
        {content ? (
          <>
            <p className="pm-preview-caption pm-preview-caption--linkedin">
              {needsTruncation && !expanded
                ? <>{content.slice(0, previewLen)}…<button className="pm-preview-see-more" onClick={() => setExpanded(true)}>see more</button></>
                : content
              }
            </p>
            {over && (
              <p className="pm-preview-warning">
                <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {content.length}/{limit} — exceeds LinkedIn limit
              </p>
            )}
          </>
        ) : (
          <p className="pm-preview-empty">Post content will appear here…</p>
        )}
      </div>
    </div>
  );
}

// ── Twitter/X Preview ─────────────────────────────────────────

function TwitterPreview({ content, mediaUrls = [] }) {
  const hasMedia = mediaUrls.length > 0;
  const limit = PLATFORM_LIMITS.twitter;
  const tweets = threadSplit(content ?? '', limit);
  const isThread = tweets.length > 1;

  return (
    <div className="pm-preview-card pm-preview-twitter">
      <div className="pm-preview-card-header">
        <div className="pm-preview-avatar pm-preview-avatar--twitter" />
        <div className="pm-preview-username">
          <span className="pm-preview-handle">@SEARCHPurdue</span>
          {isThread && (
            <span className="pm-preview-platform-label pm-preview-thread-badge">
              <i className="fas fa-list-ol" aria-hidden="true" /> {tweets.length}-tweet thread
            </span>
          )}
          <span className="pm-preview-platform-label">
            <i className="fab fa-twitter" aria-hidden="true" /> X / Twitter
          </span>
        </div>
      </div>

      {tweets.map((tweet, i) => (
        <div key={i} className={`pm-preview-tweet${i > 0 ? ' pm-preview-tweet--reply' : ''}`}>
          {i > 0 && <div className="pm-preview-thread-line" />}
          <p className="pm-preview-caption">
            {tweet || <span className="pm-preview-empty">Tweet will appear here…</span>}
          </p>
          {i === 0 && hasMedia && (
            <div className="pm-preview-media pm-preview-media--twitter">
              <img src={mediaUrls[0]} alt="" className="pm-preview-media-img" />
            </div>
          )}
          <div className="pm-preview-tweet-footer">
            <span className={`pm-preview-char-count${tweet.length > limit * 0.9 ? ' pm-preview-char-count--warn' : ''}${tweet.length > limit ? ' pm-preview-char-count--over' : ''}`}>
              {tweet.length}/{limit}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── PlatformPreview (exported) ────────────────────────────────

export default function PlatformPreview({ platform, content, mediaUrls = [] }) {
  switch (platform) {
    case 'instagram': return <InstagramPreview content={content} mediaUrls={mediaUrls} />;
    case 'linkedin':  return <LinkedInPreview  content={content} mediaUrls={mediaUrls} />;
    case 'twitter':   return <TwitterPreview   content={content} mediaUrls={mediaUrls} />;
    case 'website':
      return (
        <div className="pm-preview-card pm-preview-website">
          <div className="pm-preview-card-header">
            <div className="pm-preview-avatar pm-preview-avatar--website" />
            <div className="pm-preview-username">
              <span className="pm-preview-handle">purduesearch.github.io</span>
              <span className="pm-preview-platform-label">
                <i className="fas fa-globe" aria-hidden="true" /> Website / Blog
              </span>
            </div>
          </div>
          <div className="pm-preview-body">
            {content
              ? <p className="pm-preview-caption">{content}</p>
              : <p className="pm-preview-empty">Content will appear here…</p>
            }
          </div>
        </div>
      );
    default: return null;
  }
}
