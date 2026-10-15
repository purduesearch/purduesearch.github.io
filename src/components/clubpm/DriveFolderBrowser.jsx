import React, { useEffect, useState } from "react";
import { get } from "../../api/clubPmClient";
import { mimeTypeToKind, getTypeMeta, formatRelativeTime, getWebViewUrl } from "../../utils/driveUtils";

export function driveItemUrl(file) {
  return file.webViewLink || getWebViewUrl({ kind: mimeTypeToKind(file.mimeType), id: file.id });
}

// Shared by project Files and task attachments. The API validates every folder
// against the linked root; the path here is only for navigation and breadcrumbs.
export default function DriveFolderBrowser({ projectId, driveLink, selected, onToggle, onPreview }) {
  const [path, setPath] = useState([]);
  const [rootName, setRootName] = useState("Drive folder");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const currentFolderId = path.length ? path[path.length - 1].id : null;

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    const qs = currentFolderId ? `?folderId=${encodeURIComponent(currentFolderId)}` : "";
    get(`/api/projects/${projectId}/drive-files${qs}`)
      .then(data => {
        if (cancelled) return;
        setState({ loading: false, data, error: null });
        if (!currentFolderId) setRootName(data.folderName || "Drive folder");
      })
      .catch(err => {
        if (!cancelled) setState({ loading: false, data: null, error: err?.message || "Couldn't load this folder." });
      });
    return () => { cancelled = true; };
  }, [projectId, driveLink, currentFolderId, revision]);

  function navigate(nextPath) {
    setQuery("");
    setPath(nextPath);
  }

  const { data, loading, error } = state;
  const files = data?.files || [];
  const filtered = files.filter(file => file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  filtered.sort((a, b) => {
    const folderOrder = Number(mimeTypeToKind(b.mimeType) === "folder") - Number(mimeTypeToKind(a.mimeType) === "folder");
    if (folderOrder) return folderOrder;
    if (sort === "modified") {
      const timeOrder = (Date.parse(b.modifiedTime) || 0) - (Date.parse(a.modifiedTime) || 0);
      if (timeOrder) return timeOrder;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
  const folderUrl = currentFolderId
    ? getWebViewUrl({ kind: "folder", id: currentFolderId })
    : data?.folderWebViewLink || driveLink;

  return (
    <div role="region" className={`cpm-drive-browser${onToggle ? " cpm-drive-browser--picker" : ""}`} aria-label="Drive folder browser">
      <div className="cpm-drive-browser-location">
        <button type="button" className="cpm-drive-browser-tool" disabled={!path.length} onClick={() => navigate(path.slice(0, -1))} aria-label="Up one folder">
          <i className="fas fa-arrow-left" aria-hidden="true" />
        </button>
        <nav className="cpm-drive-browser-crumbs" aria-label="Drive folder path">
          {[{ name: rootName }, ...path].map((folder, index) => (
            <React.Fragment key={folder.id || "root"}>
              {index > 0 && <i className="fas fa-chevron-right" aria-hidden="true" />}
              <button type="button" onClick={() => navigate(path.slice(0, index))} aria-current={index === path.length ? "location" : undefined} title={folder.name}>
                {index === 0 && <i className="fas fa-folder" aria-hidden="true" />} {folder.name}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <button type="button" className="cpm-drive-browser-tool" disabled={loading} onClick={() => setRevision(value => value + 1)} aria-label="Refresh folder">
          <i className="fas fa-sync-alt" aria-hidden="true" />
        </button>
        {folderUrl && <a className="cpm-drive-browser-tool" href={folderUrl} target="_blank" rel="noopener noreferrer" aria-label="Open current folder in Drive" title="Open current folder in Drive"><i className="fas fa-external-link-alt" aria-hidden="true" /></a>}
      </div>
      <div className="cpm-drive-browser-toolbar">
        <label className="cpm-drive-browser-search">
          <i className="fas fa-search" aria-hidden="true" />
          <input type="search" aria-label="Search this folder" placeholder="Search this folder…" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <select aria-label="Sort files" value={sort} onChange={event => setSort(event.target.value)}>
          <option value="name">Name A–Z</option>
          <option value="modified">Recently modified</option>
        </select>
      </div>
      <div className="cpm-drive-browser-content" aria-busy={loading}>
        {loading ? <div className="cpm-drive-browser-empty" role="status"><span className="cpm-spinner" /> Loading files…</div>
          : error ? <div className="cpm-drive-browser-empty" role="alert"><i className="fas fa-exclamation-circle" aria-hidden="true" /><strong>Couldn't load this folder</strong><p>{error}</p><button type="button" className="cpm-attach-cancel" onClick={() => setRevision(value => value + 1)}>Try again</button></div>
          : data?.noLink ? <div className="cpm-drive-browser-empty"><strong>No Drive folder linked</strong><p>Ask an admin to link a folder for this project.</p></div>
          : data?.notFolder ? <div className="cpm-drive-browser-empty"><strong>The linked item isn't a folder</strong><p>Open it in Drive, or ask an admin to link a folder.</p></div>
          : !filtered.length ? <div className="cpm-drive-browser-empty"><i className={`fas ${query ? "fa-search" : "fa-folder-open"}`} aria-hidden="true" /><strong>{query ? "No matching files" : "No files to show"}</strong><p>{query ? "Try another name or clear your search." : "This folder is empty, or its contents aren't available to Constellation. You can check it in Drive."}</p>{query && <button type="button" className="cpm-attach-cancel" onClick={() => setQuery("")}>Clear search</button>}</div>
          : <ul className="cpm-drive-browser-list" aria-label="Folder contents">
            {filtered.map(file => {
              const kind = mimeTypeToKind(file.mimeType);
              const meta = getTypeMeta(kind);
              const isFolder = kind === "folder";
              return (
                <li key={file.id} className={`cpm-drive-browser-row${selected?.[file.id] ? " is-selected" : ""}`}>
                  {onToggle && <input type="checkbox" aria-label={`Select ${file.name}`} checked={!!selected?.[file.id]} onChange={() => onToggle(file)} />}
                  <button type="button" className="cpm-drive-browser-item" onClick={() => isFolder ? navigate([...path, { id: file.id, name: file.name }]) : onToggle ? onToggle(file) : onPreview?.({ url: driveItemUrl(file), label: file.name })} aria-label={`${isFolder ? "Open folder" : onToggle ? "Select file" : "Preview"} ${file.name}`}>
                    <span className={`cpm-drive-browser-icon cpm-drive-browser-icon--${kind}`}><i className={`fas ${meta.icon}`} aria-hidden="true" /></span>
                    <span className="cpm-drive-browser-file"><span className="cpm-drive-browser-name" title={file.name}>{file.name}</span><small className="cpm-drive-browser-type">{meta.label}</small></span>
                    <time className="cpm-drive-browser-date" dateTime={file.modifiedTime} title={file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : undefined}>{formatRelativeTime(file.modifiedTime)}</time>
                    {isFolder && <i className="fas fa-chevron-right cpm-drive-browser-chevron" aria-hidden="true" />}
                  </button>
                  {!onToggle && <a className="cpm-drive-browser-tool" href={driveItemUrl(file)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name} in Drive`} title="Open in Drive"><i className="fas fa-external-link-alt" aria-hidden="true" /></a>}
                </li>
              );
            })}
          </ul>}
      </div>
      <div className="cpm-drive-browser-summary" role="status">
        {!loading && !error && !data?.noLink && !data?.notFolder && <span>{query ? `${filtered.length} of ${files.length}` : files.length} item{files.length !== 1 ? "s" : ""}{files.length >= 50 ? " loaded · Open in Drive for the full folder" : ""}</span>}
        <span>{onToggle ? "Select items to attach · Click folders to browse" : "Click a folder to browse or a file to preview"}</span>
      </div>
    </div>
  );
}
