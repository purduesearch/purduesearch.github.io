import { useState } from "react";
import { conversationFileUrl } from "../../../api/clubPmClient";

/** Human-readable byte count. */
function sizeLabel(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ChatFileAttachment({ file }) {
  const [broken, setBroken] = useState(false);

  // The archive's whole point is that this stays rare — but when Slack expired
  // a file before the sweep reached it, say so instead of showing a broken
  // image icon.
  if (file.storage === "UNAVAILABLE") {
    return (
      <div className="cpm-chat-file cpm-chat-file--gone">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        <div className="cpm-chat-file-meta">
          <div className="cpm-chat-file-name">{file.name}</div>
          <div className="cpm-chat-file-sub">Expired in Slack before it could be archived</div>
        </div>
      </div>
    );
  }

  const href = conversationFileUrl(file.id);

  if (file.isImage && !broken) {
    return (
      <a className="cpm-chat-image-link" href={href} target="_blank" rel="noopener noreferrer">
        <img
          className="cpm-chat-image"
          src={href}
          alt={file.name}
          loading="lazy"
          width={file.width || undefined}
          height={file.height || undefined}
          onError={() => setBroken(true)}
        />
      </a>
    );
  }

  return (
    <a className="cpm-chat-file" href={href} target="_blank" rel="noopener noreferrer">
      <i className="fas fa-paperclip" aria-hidden="true" />
      <div className="cpm-chat-file-meta">
        <div className="cpm-chat-file-name">{file.name}</div>
        <div className="cpm-chat-file-sub">
          {[file.mimeType, sizeLabel(file.sizeBytes)].filter(Boolean).join(" · ")}
        </div>
      </div>
    </a>
  );
}
