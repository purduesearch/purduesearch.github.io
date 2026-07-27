// Framework-free provider-widget enhancer, the sibling of blogCarousel.js.
//
// buildEmbed() in BlogEmbed.jsx turns YouTube/Vimeo/CodePen URLs into real
// iframes, which need nothing at runtime. X and Instagram have no such iframe
// URL, so it emits the providers' own placeholder blockquotes instead — and an
// Instagram placeholder is literally `<blockquote><a href=…></a></blockquote>`
// with no text inside. Until the provider's widget script rewrites it, it
// occupies no space and the reader sees *nothing at all*.
//
// The editor's NodeView loads those scripts itself, but the published article
// (BlogPost.jsx) and the preview (BlogPreviewFrame.jsx) inject the server's
// renderedHtml as raw HTML — innerHTML never executes scripts — so they must
// run this after the injection.

const PROVIDERS = [
  {
    name: 'instagram',
    selector: 'blockquote.instagram-media',
    id: 'instagram-embed-js',
    src: 'https://www.instagram.com/embed.js',
    ready: (win) => Boolean(win.instgrm?.Embeds?.process),
    process: (win) => win.instgrm.Embeds.process(),
  },
  {
    name: 'twitter',
    selector: 'blockquote.twitter-tweet',
    id: 'twitter-wjs',
    src: 'https://platform.twitter.com/widgets.js',
    ready: (win) => Boolean(win.twttr?.widgets?.load),
    process: (win) => win.twttr.widgets.load(),
  },
];

/** Names of the widget scripts `container` actually needs. Exported for tests. */
export function providersIn(container) {
  if (!container) return [];
  return PROVIDERS.filter((p) => container.querySelector(p.selector)).map((p) => p.name);
}

// Resolves once the provider's global is available. Never rejects: a blocked or
// failed script just leaves the blockquote as-is rather than breaking the page.
function whenReady(doc, win, provider) {
  return new Promise((resolve) => {
    if (provider.ready(win)) { resolve(true); return; }

    const existing = doc.getElementById(provider.id);
    if (existing) {
      existing.addEventListener('load', () => resolve(provider.ready(win)), { once: true });
      return;
    }

    const script = doc.createElement('script');
    script.id = provider.id;
    script.async = true;
    script.src = provider.src;
    script.addEventListener('load', () => resolve(provider.ready(win)), { once: true });
    script.addEventListener('error', () => resolve(false), { once: true });
    (doc.body || doc.head).appendChild(script);
  });
}

/**
 * Hydrate every X/Instagram embed inside `container` (default: the whole
 * document). Safe to call repeatedly — the scripts load once and each
 * provider's process() skips blockquotes it has already rewritten.
 */
export function initBlogEmbeds(container) {
  const scope = container || (typeof document !== 'undefined' ? document : null);
  if (!scope) return;
  const doc = scope.ownerDocument || scope;
  const win = doc.defaultView;
  if (!win) return;

  const needed = providersIn(scope);
  PROVIDERS.filter((p) => needed.includes(p.name)).forEach((provider) => {
    whenReady(doc, win, provider).then((ok) => { if (ok) provider.process(win); });
  });
}

export default initBlogEmbeds;
