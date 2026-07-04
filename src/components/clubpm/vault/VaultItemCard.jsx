import React from "react";

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
  const latest = item.latestVersion;
  const icon = iconForFileName(latest?.fileName);
  const checkedOutName = item.checkedOutBy?.displayName;
  const clickable = typeof onClick === "function";

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

      <div className="cpm-vault-card-icon">
        <i className={`fas ${icon}`} aria-hidden="true" />
      </div>

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
