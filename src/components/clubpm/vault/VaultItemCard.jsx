import React, { useEffect, useState } from "react";
import { apiBaseUrl, authHeaders } from "../../../api/clubPmClient";
import { extensionOf } from "./vaultUtils";

// Extension → Font Awesome icon. Anything unrecognized (native CAD formats
// like .prt/.sldprt/.f3d included) falls back to fa-cube.
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"]);

function iconForFileName(fileName) {
  const ext = extensionOf(fileName);
  if (ext === "pdf") return "fa-file-pdf";
  if (IMAGE_EXTENSIONS.has(ext)) return "fa-image";
  return "fa-cube";
}

// The thumbnail proxy is auth-gated, and an <img src> can't carry the Bearer
// header cross-origin users rely on when their session cookie is blocked —
// so fetch the bytes with full auth and render a blob URL instead. The HTTP
// cache still honors the endpoint's Cache-Control.
function useAuthedThumbnail(url) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!url) {
      setSrc(null);
      return undefined;
    }
    let cancelled = false;
    let objectUrl = null;
    fetch(url, { credentials: "include", headers: authHeaders() })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`Thumbnail ${res.status}`))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return src;
}

export default function VaultItemCard({ item, onClick }) {
  const latest = item.latestVersion;
  const icon = iconForFileName(latest?.fileName);
  const checkedOutName = item.checkedOutBy?.displayName;
  const clickable = typeof onClick === "function";

  // Client-rendered 3D-preview snapshot (Pack A). Only present once a
  // teammate has opened the item's 3D tab at least once; falls back to the
  // extension icon otherwise, or if the authenticated fetch fails.
  const thumbSrc = useAuthedThumbnail(
    latest?.thumbnailFileId ? `${apiBaseUrl}/api/vault/versions/${latest.id}/thumbnail` : null
  );

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

      {thumbSrc ? (
        <img className="cpm-vault-card-thumb" src={thumbSrc} alt="" />
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
