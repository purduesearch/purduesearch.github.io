// Syntax-highlighted preview of a single file from the linked repo.
// Uses react-syntax-highlighter (Prism mode) — same dep that backs many
// MDX renderers. For binary files we render a "download from GitHub" link.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { get } from "../../../api/clubPmClient";
import { languageFromPath } from "../../../utils/githubUtils";

export default function FilePreviewModal({ repoId, path, onClose }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get(`/api/github/repos/${repoId}/contents?path=${encodeURIComponent(path)}`)
      .then(data => {
        if (cancelled) return;
        if (data.kind !== "file") {
          setError("Not a file");
          return;
        }
        setFile(data);
      })
      .catch(err => { if (!cancelled) setError(err?.message ?? "Failed to load file"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repoId, path]);

  const lang = languageFromPath(path);

  return createPortal(
    <div className="cpm-gh-modal-overlay clubpm-portal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-gh-preview-modal cpm-gh-file-modal" role="dialog" aria-label={`File ${path}`}>
        <div className="cpm-gh-preview-header">
          <div className="cpm-gh-preview-title-row">
            <i className="fas fa-file-code" style={{ color: "var(--clubpm-text-secondary, #888)" }} aria-hidden="true" />
            <span className="cpm-gh-preview-title cpm-gh-path">{path}</span>
          </div>
          <div className="cpm-gh-preview-actions">
            {file?.htmlUrl && (
              <a href={file.htmlUrl} target="_blank" rel="noopener noreferrer" className="cpm-gh-preview-external">
                Open on GitHub <i className="fas fa-external-link-alt" aria-hidden="true" />
              </a>
            )}
            <button onClick={onClose} aria-label="Close" className="cpm-gh-modal-close">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="cpm-gh-preview-body cpm-gh-file-body">
          {loading && <p className="cpm-gh-loading">Loading file…</p>}
          {error && <p className="cpm-gh-error">{error}</p>}
          {file && file.encoding === "base64" && (
            <div className="cpm-gh-binary">
              <i className="fas fa-file" style={{ fontSize: 48 }} aria-hidden="true" />
              <p>Binary file ({(file.size / 1024).toFixed(1)} KB) — preview unavailable.</p>
              {file.htmlUrl && (
                <a href={file.htmlUrl} target="_blank" rel="noopener noreferrer" className="clubpm-btn-primary">
                  Open on GitHub
                </a>
              )}
            </div>
          )}
          {file && file.encoding === "utf8" && (
            <SyntaxHighlighter
              language={lang}
              style={oneDark}
              showLineNumbers
              customStyle={{
                margin: 0,
                borderRadius: 0,
                fontSize: 13,
                maxHeight: "100%",
                height: "100%",
              }}
            >
              {file.content}
            </SyntaxHighlighter>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
