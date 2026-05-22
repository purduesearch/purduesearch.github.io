// Replaces AddLinkModal. Two tabs:
//   1. Paste URL   — original behavior (URL + label).
//   2. Browse folder — picks one or more files from the project's linked
//      Drive folder via GET /api/projects/:id/drive-files.
//
// Returns selections to the caller via onAdd, which accepts either a single
// {url,label} object (paste tab) or an array of them (browse tab, multi-select).

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { get } from "../../api/clubPmClient";
import { mimeTypeToKind, getTypeMeta, formatRelativeTime, getWebViewUrl } from "../../utils/driveUtils";

export default function AttachmentPickerModal({ projectId, onAdd, onClose }) {
  const [tab, setTab] = useState("paste");

  return createPortal(
    <div className="cpm-attach-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-attach-modal" role="dialog" aria-label="Add attachment">
        <div className="cpm-attach-header">
          <span style={{ fontSize: 14, fontWeight: 700 }}>
            <i className="fab fa-google-drive" style={{ marginRight: 8, color: "#4285F4" }} aria-hidden="true" />
            Add Attachment
          </span>
          <button className="cpm-attach-close" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="cpm-attach-tabs">
          <button
            className={`cpm-attach-tab ${tab === "paste" ? "is-active" : ""}`}
            onClick={() => setTab("paste")}
            type="button"
          >
            <i className="fas fa-link" aria-hidden="true" /> Paste URL
          </button>
          <button
            className={`cpm-attach-tab ${tab === "browse" ? "is-active" : ""}`}
            onClick={() => setTab("browse")}
            type="button"
          >
            <i className="fas fa-folder-open" aria-hidden="true" /> Browse folder
          </button>
        </div>

        {tab === "paste"
          ? <PasteTab onAdd={onAdd} onClose={onClose} />
          : <BrowseTab projectId={projectId} onAdd={onAdd} onClose={onClose} />}
      </div>
    </div>,
    document.body
  );
}

function PasteTab({ onAdd, onClose }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    onAdd({ url: url.trim(), label: label.trim() || url.trim() });
    onClose();
  }

  return (
    <form onSubmit={submit} className="cpm-attach-paste">
      <label className="cpm-attach-field-label">URL *</label>
      <input
        autoFocus
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://drive.google.com/…"
        className="cpm-attach-input"
      />
      <label className="cpm-attach-field-label">Label (optional)</label>
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="e.g. Design Specs v2"
        className="cpm-attach-input"
      />

      <div className="cpm-attach-footer">
        <button type="button" className="cpm-attach-cancel" onClick={onClose}>Cancel</button>
        <button type="submit" className="clubpm-btn-primary" disabled={!url.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}

function BrowseTab({ projectId, onAdd, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [selected, setSelected] = useState({}); // { [fileId]: file }

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    get(`/api/projects/${projectId}/drive-files`)
      .then(data => { if (!cancelled) setState({ loading: false, data, error: null }); })
      .catch(err => { if (!cancelled) setState({ loading: false, data: null, error: err?.message ?? "Failed to load files" }); });
    return () => { cancelled = true; };
  }, [projectId]);

  function toggle(file) {
    setSelected(prev => {
      const next = { ...prev };
      if (next[file.id]) delete next[file.id];
      else next[file.id] = file;
      return next;
    });
  }

  function addSelected() {
    const items = Object.values(selected).map(f => ({
      url: f.webViewLink || getWebViewUrl({ kind: mimeTypeToKind(f.mimeType), id: f.id }),
      label: f.name,
    }));
    if (items.length === 0) return;
    onAdd(items.length === 1 ? items[0] : items);
    onClose();
  }

  const selectedCount = Object.keys(selected).length;

  if (state.loading) {
    return <div className="cpm-attach-browse-empty"><span className="cpm-spinner" /> Loading files…</div>;
  }
  if (state.error) {
    return <div className="cpm-attach-browse-empty cpm-attach-browse-error">{state.error}</div>;
  }

  const { data } = state;
  if (data?.noLink) {
    return (
      <div className="cpm-attach-browse-empty">
        <i className="fab fa-google-drive" style={{ fontSize: 28, color: "#4285F4", marginBottom: 8 }} aria-hidden="true" />
        <p>No Drive folder linked to this project yet.</p>
        <p style={{ fontSize: 11, opacity: 0.7 }}>An admin needs to link one before you can browse files.</p>
      </div>
    );
  }
  if (data?.notFolder) {
    return (
      <div className="cpm-attach-browse-empty">
        <p>The linked Drive item isn't a folder, so there's nothing to browse.</p>
        <p style={{ fontSize: 11, opacity: 0.7 }}>Use "Paste URL" instead, or ask an admin to link a folder.</p>
      </div>
    );
  }
  if (!data?.files?.length) {
    return <div className="cpm-attach-browse-empty">This Drive folder is empty.</div>;
  }

  return (
    <>
      <div className="cpm-attach-browse-header">
        <span>
          <i className="fas fa-folder" style={{ color: "#FFC107", marginRight: 6 }} aria-hidden="true" />
          {data.folderName || "Drive folder"}
        </span>
        <span style={{ fontSize: 11, color: "var(--clubpm-text-muted)" }}>
          {data.files.length} item{data.files.length !== 1 ? "s" : ""}
        </span>
      </div>

      <ul className="cpm-attach-browse-list">
        {data.files.map(f => {
          const kind = mimeTypeToKind(f.mimeType);
          const meta = getTypeMeta(kind);
          const isSelected = !!selected[f.id];
          return (
            <li
              key={f.id}
              className={`cpm-attach-browse-row ${isSelected ? "is-selected" : ""}`}
              onClick={() => toggle(f)}
            >
              <span className="cpm-attach-browse-check" aria-hidden="true">
                {isSelected ? <i className="fas fa-check-square" /> : <i className="far fa-square" />}
              </span>
              <i className={`fas ${meta.icon} cpm-attach-browse-icon`} style={{ color: meta.color }} aria-hidden="true" />
              <span className="cpm-attach-browse-name" title={f.name}>{f.name}</span>
              <span className="cpm-attach-browse-meta">
                {meta.label}{f.modifiedTime ? ` · ${formatRelativeTime(f.modifiedTime)}` : ""}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="cpm-attach-footer">
        <button type="button" className="cpm-attach-cancel" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="clubpm-btn-primary"
          disabled={selectedCount === 0}
          onClick={addSelected}
        >
          Add{selectedCount > 0 ? ` ${selectedCount}` : ""}
        </button>
      </div>
    </>
  );
}
