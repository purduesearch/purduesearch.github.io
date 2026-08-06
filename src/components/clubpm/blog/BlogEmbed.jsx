import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useIsEditable } from './useIsEditable';

// Resolve a pasted URL into sanitized embed HTML. YouTube/Vimeo/CodePen use
// iframes; X and Instagram use their free widget blockquotes (rendered by the
// provider's widget script, loaded on demand in the NodeView). Anything else
// falls back to a plain link (empty html → renderer emits an anchor).
export function buildEmbed(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) return { provider: 'link', html: '' };

  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { provider: 'youtube', html: `<iframe src="https://www.youtube.com/embed/${yt[1]}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` };

  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return { provider: 'vimeo', html: `<iframe src="https://player.vimeo.com/video/${vm[1]}" title="Vimeo video" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>` };

  const cp = url.match(/codepen\.io\/([\w-]+)\/pen\/([\w-]+)/);
  if (cp) return { provider: 'codepen', html: `<iframe src="https://codepen.io/${cp[1]}/embed/${cp[2]}?default-tab=result" title="CodePen embed" frameborder="0" scrolling="no" allowfullscreen></iframe>` };

  if (/(?:twitter\.com|x\.com)\/[^/]+\/status\/\d+/.test(url)) {
    return { provider: 'twitter', html: `<blockquote class="twitter-tweet"><a href="${url}"></a></blockquote>` };
  }

  if (/instagram\.com\/(?:p|reel|tv)\//.test(url)) {
    return { provider: 'instagram', html: `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14"><a href="${url}"></a></blockquote>` };
  }

  return { provider: 'link', html: '' };
}

// Load a provider widget script once, then (re)process embeds.
function hydrateWidget(provider) {
  const ensure = (src, id) =>
    new Promise((resolve) => {
      const existing = document.getElementById(id);
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.id = id; s.async = true; s.src = src;
      s.onload = () => resolve();
      document.body.appendChild(s);
    });

  if (provider === 'twitter') {
    ensure('https://platform.twitter.com/widgets.js', 'twitter-wjs').then(() => {
      window.twttr?.widgets?.load?.();
    });
  } else if (provider === 'instagram') {
    ensure('https://www.instagram.com/embed.js', 'instagram-embed-js').then(() => {
      window.instgrm?.Embeds?.process?.();
    });
  }
}

function EmbedView({ node, updateAttributes, editor }) {
  const { url, html, provider } = node.attrs;
  const [draft, setDraft] = React.useState(url || '');
  const editable = useIsEditable(editor);

  React.useEffect(() => {
    if (html && (provider === 'twitter' || provider === 'instagram')) hydrateWidget(provider);
  }, [html, provider]);

  const apply = () => {
    const { provider: p, html: h } = buildEmbed(draft);
    updateAttributes({ url: draft.trim(), provider: p, html: h });
  };

  return (
    <NodeViewWrapper className="cpm-blog-embed-node" as="div">
      {editable && (
        <div className="cpm-blog-embed-bar" contentEditable={false}>
          <i className="fas fa-photo-film" aria-hidden="true" />
          <input
            className="cpm-blog-embed-input"
            placeholder="Paste a YouTube, Vimeo, X, Instagram, or CodePen URL…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
          />
          <button type="button" className="clubpm-btn-secondary" onClick={apply}>Embed</button>
        </div>
      )}
      {html ? (
        <div className="cpm-blog-embed" data-embed-url={url} dangerouslySetInnerHTML={{ __html: html }} />
      ) : url ? (
        <div className="cpm-blog-embed">
          <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
        </div>
      ) : (
        <div className="cpm-blog-embed cpm-blog-embed--empty">No embed yet — paste a URL above.</div>
      )}
    </NodeViewWrapper>
  );
}

export const BlogEmbed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      url: { default: '' },
      html: { default: '' },
      provider: { default: 'link' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed-url]', getAttrs: (el) => ({ url: el.getAttribute('data-embed-url') || '', html: el.innerHTML || '' }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { url, html } = node.attrs;
    // Server render (blogRender.ts) owns the published output; this is only for
    // client copy/serialize. Emit the wrapper + raw html string.
    return ['div', mergeAttributes(HTMLAttributes, { class: 'cpm-blog-embed', 'data-embed-url': url }), html];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },
});

export default BlogEmbed;
