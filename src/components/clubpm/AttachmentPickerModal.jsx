// Replaces AddLinkModal. Two tabs:
//   1. Paste URL   — original behavior (URL + label).
//   2. Browse folder — picks one or more files from the project's linked
//      Drive folder via GET /api/projects/:id/drive-files.
//
// Returns selections to the caller via onAdd, which accepts either a single
// {url,label} object (paste tab) or an array of them (browse tab, multi-select).

import React, { useState } from "react";
import { createPortal } from "react-dom";
import DriveFolderBrowser, { driveItemUrl } from "./DriveFolderBrowser";

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
  const [selected, setSelected] = useState({});

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
      url: driveItemUrl(f),
      label: f.name,
    }));
    if (items.length === 0) return;
    onAdd(items.length === 1 ? items[0] : items);
    onClose();
  }

  const selectedCount = Object.keys(selected).length;

  return (
    <>
      <DriveFolderBrowser key={projectId} projectId={projectId} selected={selected} onToggle={toggle} />

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
