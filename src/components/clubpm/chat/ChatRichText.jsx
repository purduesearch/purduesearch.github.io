/**
 * Renders the token array from GET .../chat/messages.
 *
 * NO SPAN AND NO PARAGRAPH ELEMENTS ANYWHERE IN THIS FILE.
 * public/clubpm-theme.css:969 gives both of those tags, under .clubpm-app,
 *   `color: inherit !important`
 * so a token rendered that way loses its color with no way to override it —
 * every mention, link, and code fragment would silently read as body text.
 * Use <a>, <code>, <b>, <i>, <s>, <div>, <label> instead.
 */
export default function ChatRichText({ tokens }) {
  if (!tokens || tokens.length === 0) return null;

  return (
    <div className="cpm-chat-text">
      {tokens.map((t, i) => {
        switch (t.type) {
          case "mention":
            return <b key={i} className="cpm-chat-mention">@{t.label}</b>;

          case "channel":
            return <b key={i} className="cpm-chat-channel">#{t.label}</b>;

          case "link":
            return (
              <a
                key={i}
                className="cpm-chat-link"
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.label}
              </a>
            );

          case "code":
            return <code key={i} className="cpm-chat-code">{t.value}</code>;

          case "codeblock":
            return (
              <code key={i} className="cpm-chat-codeblock">
                {t.value}
              </code>
            );

          case "emoji":
            return t.url
              ? <img key={i} className="cpm-chat-emoji" src={t.url} alt={`:${t.name}:`} title={`:${t.name}:`} />
              : <code key={i} className="cpm-chat-emoji-name">:{t.name}:</code>;

          case "text":
          default:
            // A <label> is the only inline text element the blanket !important
            // rule above leaves alone.
            return <label key={i} className="cpm-chat-plain">{t.value}</label>;
        }
      })}
    </div>
  );
}
