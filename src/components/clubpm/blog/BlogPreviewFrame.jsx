import React from 'react';
import { previewBlogPost } from '../../../api/clubPmClient';

// Renders the post exactly as the public article page will. Two things make
// this accurate, and both matter:
//   1. The HTML comes from the server's renderJsonToHtml() — the same function
//      the publish path calls — not from the editor's getHTML().
//   2. It lives in an iframe, so ClubPM's dark theme and its !important editor
//      overrides cannot reach inside.
// The markup below must mirror src/pages/BlogPost.jsx.

const WIDTHS = [
  { id: 'desktop', label: 'Desktop', icon: 'fa-desktop', width: '100%' },
  { id: 'tablet', label: 'Tablet', icon: 'fa-tablet-screen-button', width: '820px' },
  { id: 'mobile', label: 'Mobile', icon: 'fa-mobile-screen', width: '414px' },
];

// The enhancer runs inside the iframe, where module imports aren't available —
// so the same behaviour is inlined here. Keep in sync with src/lib/blogCarousel.js.
const CAROUSEL_INLINE = `
document.querySelectorAll('[data-carousel]').forEach(function (root) {
  var track = root.querySelector('.cpm-blog-carousel-track');
  if (!track) return;
  var slides = Array.prototype.slice.call(track.querySelectorAll('.cpm-blog-carousel-slide'));
  if (!slides.length) return;
  var dots = Array.prototype.slice.call(root.querySelectorAll('.cpm-blog-carousel-dot'));
  var prev = root.querySelector('.cpm-blog-carousel-prev');
  var next = root.querySelector('.cpm-blog-carousel-next');
  var i = 0;
  function clamp(n) { return Math.min(Math.max(n, 0), slides.length - 1); }
  function paint() {
    dots.forEach(function (d, k) { d.classList.toggle('is-active', k === i); });
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === slides.length - 1;
  }
  function go(n) { i = clamp(n); slides[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); paint(); }
  if (prev) prev.addEventListener('click', function () { go(i - 1); });
  if (next) next.addEventListener('click', function () { go(i + 1); });
  dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); }); });
  paint();
});`;

// Same story for the X / Instagram widget scripts: their embeds are empty
// placeholder blockquotes until the provider's script rewrites them, and the
// preview must load them or the embed shows up blank here but fine in the
// editor. Keep in sync with src/lib/blogEmbeds.js.
const EMBEDS_INLINE = `
[
  { sel: 'blockquote.instagram-media', id: 'instagram-embed-js', src: 'https://www.instagram.com/embed.js',
    go: function () { if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process(); } },
  { sel: 'blockquote.twitter-tweet', id: 'twitter-wjs', src: 'https://platform.twitter.com/widgets.js',
    go: function () { if (window.twttr && window.twttr.widgets) window.twttr.widgets.load(); } }
].forEach(function (p) {
  if (!document.querySelector(p.sel) || document.getElementById(p.id)) return;
  var s = document.createElement('script');
  s.id = p.id; s.async = true; s.src = p.src;
  s.addEventListener('load', p.go);
  document.body.appendChild(s);
});`;

function buildSrcDoc({ html, meta, title, origin }) {
  const theme = meta?.theme ?? {};
  const cover = meta?.coverImageUrl || '/Purdue_Sky.webp';
  const date = meta?.publishedAt
    ? new Date(meta.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const byline = [meta?.authorName, date, meta?.readingTimeMin ? `${meta.readingTimeMin} min read` : '']
    .filter(Boolean).join(' · ');
  const accent = theme.accent ? `--post-accent:${theme.accent};` : '';

  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="${origin}/search-theme.css"/>
<link rel="stylesheet" href="${origin}/clubpm-theme.css"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Montserrat:wght@400;500;700;900&family=Ubuntu:wght@400;500;700&family=Lato:wght@300;400&family=Work+Sans:wght@300;400;700&family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;700&display=swap"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>
<style>body{margin:0;background:#fff;}</style>
</head><body>
<div class="jumbotron jumbotron-single d-flex align-items-center" style="background-image:url(${cover})">
  <div class="container text-center">
    <h1 class="display-3 mb-3">${title || 'Untitled post'}</h1>
    ${byline ? `<p class="header-sub-title">${byline}</p>` : ''}
  </div>
</div>
<section class="bg-white"><div class="container"><div class="section-content">
  <div class="pm-blog-post-body" data-fontpair="${theme.fontPair || 'syne-dmsans'}" data-width="${theme.width || 'wide'}" style="${accent}">${html}</div>
</div></div></section>
<script>
${CAROUSEL_INLINE}
${EMBEDS_INLINE}
</script>
</body></html>`;
}

export default function BlogPreviewFrame({ postId, title, contentJson }) {
  const [srcDoc, setSrcDoc] = React.useState('');
  const [state, setState] = React.useState('loading');
  const [device, setDevice] = React.useState('desktop');

  React.useEffect(() => {
    let cancelled = false;
    setState('loading');
    previewBlogPost(postId, contentJson)
      .then(({ html, meta }) => {
        if (cancelled) return;
        setSrcDoc(buildSrcDoc({ html, meta, title, origin: window.location.origin }));
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [postId, contentJson, title]);

  const active = WIDTHS.find((w) => w.id === device) ?? WIDTHS[0];

  return (
    <div className="cpm-blog-previewframe">
      <div className="cpm-blog-previewframe-bar">
        <span className="cpm-blog-previewframe-lab">Exactly as it will publish</span>
        <div className="cpm-blog-seg">
          {WIDTHS.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`cpm-blog-seg-b${device === w.id ? ' on' : ''}`}
              onClick={() => setDevice(w.id)}
              title={w.label}
            >
              <i className={`fas ${w.icon}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {state === 'error' ? (
        <p className="cpm-blog-previewframe-error">Could not render the preview. Check that the backend is reachable.</p>
      ) : (
        <iframe
          title="Post preview"
          className="cpm-blog-previewframe-frame"
          style={{ width: active.width }}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
        />
      )}
    </div>
  );
}
