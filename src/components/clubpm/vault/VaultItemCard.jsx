import React, { useState } from "react";
import { apiBaseUrl } from "../../../api/clubPmClient";

// Extension → Font Awesome icon. Anything unrecognized (native CAD formats
// like .prt/.sldprt/.f3d included) falls back to fa-cube.
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"]);

function extensionOf(fileName) {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx + 1).toLowerCase();
}

function iconForFileName(fileName) {
  const ext = extensionOf(fileName);
  if (ext === "pdf") return "fa-file-pdf";
  if (IMAGE_EXTENSIONS.has(ext)) return "fa-image";
  return "fa-cube";
}

export default function VaultItemCard({ item, onClick }) {
  const [thumbFailed, setThumbFailed] = useState(false);

  const latest = item.latestVersion;
  const icon = iconForFileName(latest?.fileName);
  const checkedOutName = item.checkedOutBy?.displayName;
  const clickable = typeof onClick === "function";

  // Client-rendered 3D-preview snapshot (Pack A). Only present once a
  // teammate has opened the item's 3D tab at least once; falls back to the
  // extension icon otherwise, or if the authenticated proxy request errors.
  const thumbUrl = latest?.thumbnailFileId
    ? `${apiBaseUrl}/api/vault/versions/${latest.id}/thumbnail`
    : null;
  const showThumb = !!thumbUrl && !thumbFailed;

  return (
    <div
      className="cpm-vault-card"
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }) : undefined}
    >
      {checkedOutName && (
        <span
          className="cpm-vault-checkout-badge"
          title={`Being edited by ${checkedOutName}`}
        >
          <i className="fas fa-pen" aria-hidden="true" /> {checkedOutName}
        </span>
      )}

      {showThumb ? (
        <img
          className="cpm-vault-card-thumb"
          src={thumbUrl}
          alt=""
          crossOrigin="use-credentials"
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <div className="cpm-vault-card-icon">
          <i className={`fas ${icon}`} aria-hidden="true" />
        </div>
      )}

      <div className="cpm-vault-card-name" title={item.name}>{item.name}</div>

      <div className="cpm-vault-card-chips">
        {item.partNumber && (
          <span className="cpm-vault-chip-part">{item.partNumber}</span>
        )}
        {item.currentRevision ? (
          <span className="cpm-vault-chip-rev">Rev {item.currentRevision}</span>
        ) : (
          <span className="cpm-vault-chip-unreleased">Unreleased</span>
        )}
        {latest && <span className="cpm-vault-chip-version">v{latest.versionNumber}</span>}
      </div>
    </div>
  );
}
