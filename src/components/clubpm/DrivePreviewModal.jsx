// Iframe-based preview modal for Google Drive items (Docs/Sheets/Slides/PDF/folders).
//
// Caveat: Drive's /preview URLs only render in an iframe when the file is
// shared with the viewer's Google account (or set to "Anyone with link").
// If embedding fails Google serves a "Request access" interstitial inside the
// iframe — we have no postMessage signal to detect this, so we always render
// an "Open in Drive ↗" link as the escape hatch.

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { parseDriveUrl, getPreviewUrl, getTypeMeta } from "../../utils/driveUtils";

export default function DrivePreviewModal({ url, label, onClose }) {
  const parsed = parseDriveUrl(url);
  const previewUrl = getPreviewUrl(parsed);
  const meta = getTypeMeta(parsed.kind);
  const displayLabel = label || parsed.kind === "folder" ? "Drive folder" : "Drive file";

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="cpm-drive-preview-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-drive-preview-modal" role="dialog" aria-label={`Preview of ${displayLabel}`}>
        <div className="cpm-drive-preview-header">
          <span className="cpm-drive-preview-title">
            <i className={`fas ${meta.icon}`} style={{ color: meta.color, marginRight: 10 }} aria-hidden="true" />
            <span className="cpm-drive-preview-label">{label || displayLabel}</span>
            <span className="cpm-drive-preview-kind">{meta.label}</span>
          </span>
          <span className="cpm-drive-preview-actions">
            <a href={url} target="_blank" rel="noopener noreferrer" className="cpm-drive-preview-open">
              Open in Drive <i className="fas fa-external-link-alt" aria-hidden="true" />
            </a>
            <button className="cpm-drive-preview-close" onClick={onClose} aria-label="Close preview">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </span>
        </div>

        <div className="cpm-drive-preview-body">
          {previewUrl ? (
            <iframe
              title={`Drive preview: ${displayLabel}`}
              src={previewUrl}
              className="cpm-drive-preview-iframe"
              loading="lazy"
              allow="autoplay; clipboard-read; clipboard-write"
              allowFullScreen
            />
          ) : (
            <div className="cpm-drive-preview-fallback">
              <i className={`fas ${meta.icon}`} style={{ color: meta.color, fontSize: 48 }} aria-hidden="true" />
              <p>This link can't be previewed inline.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="clubpm-btn-primary">
                Open in new tab
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
