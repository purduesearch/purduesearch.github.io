import { useEffect, useState } from "react";
import { apiBaseUrl, authHeaders } from "../../../api/clubPmClient";

export default function VaultVersionThumbnail({ version }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!version?.thumbnailFileId && !version?.thumbnailPath) return undefined;
    let disposed = false;
    let objectUrl;
    fetch(`${apiBaseUrl}/api/vault/versions/${version.id}/thumbnail`, { credentials: "include", headers: authHeaders() })
      .then(response => { if (!response.ok) throw new Error("Thumbnail unavailable"); return response.blob(); })
      .then(blob => { objectUrl = URL.createObjectURL(blob); if (!disposed) setSrc(objectUrl); else URL.revokeObjectURL(objectUrl); })
      .catch(() => {});
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [version]);
  return src ? <img className="cpm-vault-version-thumb" src={src} alt={`Preview of ${version.fileName}`} /> : null;
}
