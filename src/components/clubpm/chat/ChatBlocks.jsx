import ChatRichText from "./ChatRichText";

/**
 * Draws the render tree from backend/src/services/slackBlocks.ts.
 * NO SPAN AND NO PARAGRAPH ELEMENTS (see ChatRichText.jsx for why).
 * Buttons from other apps are inert labels: only the app that owns a button
 * receives its click, and that happens inside Slack.
 */
export default function ChatBlocks({ blocks }) {
  if (!blocks?.length) return null;
  return (
    <div className="cpm-chat-blocks">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "header":
            return <b key={i} className="cpm-chat-block-header">{b.text}</b>;
          case "section":
            return (
              <div key={i} className="cpm-chat-block-section">
                <ChatRichText tokens={b.tokens} />
                {b.fields?.length > 0 && (
                  <div className="cpm-chat-block-fields">
                    {b.fields.map((f, j) => <ChatRichText key={j} tokens={f} />)}
                  </div>
                )}
              </div>
            );
          case "context":
            return <div key={i} className="cpm-chat-block-context"><ChatRichText tokens={b.tokens} /></div>;
          case "divider":
            return <hr key={i} className="cpm-chat-block-divider" />;
          case "actions":
            return (
              <div key={i} className="cpm-chat-block-actions" title="App buttons only work inside Slack">
                {b.labels.map((l, j) => <label key={j} className="cpm-chat-block-chip">{l}</label>)}
              </div>
            );
          case "image":
            return (
              <div key={i} className="cpm-chat-block-image">
                <i className="fas fa-image" aria-hidden="true" />
                <label className="cpm-chat-plain"> {b.alt || "Image"}</label>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
