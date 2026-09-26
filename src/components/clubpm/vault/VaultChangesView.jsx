import React, { useEffect, useState } from "react";
import { apiBaseUrl, getVaultVersionDownloadUrl } from "../../../api/clubPmClient";
import { formatBytes, isGeometryDiffable } from "./vaultUtils";
import VaultVersionThumbnail from "./VaultVersionThumbnail";
import VaultGeometryDiffPanel from "./VaultGeometryDiffPanel";
const TEXT = /\.(txt|md|json|csv|xml|yaml|yml|js|jsx|ts|tsx|css|html|py|c|h|cpp|hpp|ino)$/i;

function patchLines(before, after) {
  const left = before.split("\n").slice(0, 1000);
  const right = after.split("\n").slice(0, 1000);
  const dp = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows = []; let i = 0; let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { rows.push({ kind: "same", line: left[i] }); i++; j++; }
    else if (j < right.length && (i === left.length || dp[i][j + 1] >= dp[i + 1][j])) { rows.push({ kind: "added", line: right[j++] }); }
    else { rows.push({ kind: "removed", line: left[i++] }); }
  }
  return rows;
}

export default function VaultChangesView({ versions, repository }) {
  const [beforeId, setBeforeId] = useState(versions[1]?.id || versions[0]?.id || "");
  const [afterId, setAfterId] = useState(versions[0]?.id || "");
  const [patch, setPatch] = useState(null);
  const [error, setError] = useState("");
  const before = versions.find(v => v.id === beforeId);
  const after = versions.find(v => v.id === afterId);
  const text = before && after && TEXT.test(before.fileName) && TEXT.test(after.fileName);
  const compareUrl = repository && before?.commitSha && after?.commitSha && before.repositoryId === after.repositoryId
    ? `https://github.com/${repository.slug}/compare/${before.commitSha}...${after.commitSha}` : null;

  useEffect(() => {
    let cancelled = false;
    setPatch(null); setError("");
    if (!text || beforeId === afterId) return () => { cancelled = true; };
    if (Number(before.sizeBytes) > 1024 * 1024 || Number(after.sizeBytes) > 1024 * 1024) { setError("Text patch is limited to 1 MB per version."); return () => { cancelled = true; }; }
    (async () => {
      const [a, b] = await Promise.all([getVaultVersionDownloadUrl(before.id), getVaultVersionDownloadUrl(after.id)]);
      const [ra, rb] = await Promise.all([fetch(`${apiBaseUrl}${a.url}`), fetch(`${apiBaseUrl}${b.url}`)]);
      if (!ra.ok || !rb.ok) throw new Error("Could not read one of the versions");
      const [ta, tb] = await Promise.all([ra.text(), rb.text()]);
      if (ta.split("\n").length > 1000 || tb.split("\n").length > 1000) throw new Error("Text patch is limited to 1,000 lines per version. Download both versions for a full comparison.");
      if (!cancelled) setPatch(patchLines(ta, tb));
    })().catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [beforeId, afterId, text, before, after]);

  if (versions.length < 2) return <div className="cpm-vault-placeholder">Check in another version to compare changes.</div>;
  return <div className="cpm-vault-changes" data-tour-id="vault.changes">
    <div className="cpm-vault-change-selectors">
      <label>Earlier version <select value={beforeId} onChange={e => setBeforeId(e.target.value)}>{versions.map(v => <option key={v.id} value={v.id}>v{v.versionNumber} · {v.fileName}</option>)}</select></label>
      <label>Later version <select value={afterId} onChange={e => setAfterId(e.target.value)}>{versions.map(v => <option key={v.id} value={v.id}>v{v.versionNumber} · {v.fileName}</option>)}</select></label>
    </div>
    {beforeId === afterId ? <p>Choose two different versions.</p> : <>
      <div className="cpm-vault-change-summary"><strong>{before.fileName === after.fileName ? "Modified" : "Renamed"}</strong> · {before.fileName} → {after.fileName} · {formatBytes(before.sizeBytes)} → {formatBytes(after.sizeBytes)}</div>
      <div className="cpm-vault-change-summary">SHA-256: <code>{before.sha256 || "Legacy Drive hash unavailable"}</code> → <code>{after.sha256 || "Legacy Drive hash unavailable"}</code></div>
      <div className="cpm-vault-change-summary">Notes: {before.note || "None"} → {after.note || "None"}</div>
      <div className="cpm-vault-change-thumbs"><VaultVersionThumbnail version={before} /><VaultVersionThumbnail version={after} /></div>
      {compareUrl && <a href={compareUrl} target="_blank" rel="noreferrer">Compare commits on GitHub</a>}
      {text ? <>{error && <p role="alert">{error}</p>}{patch ? <><p>{patch.filter(r => r.kind === "added").length} additions, {patch.filter(r => r.kind === "removed").length} deletions</p><pre className="cpm-vault-patch">{patch.map((row, index) => <div key={index} className={`cpm-vault-patch-${row.kind}`}>{row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " "} {row.line}</div>)}</pre></> : !error && <p>Loading text patch…</p>}</> : isGeometryDiffable(before.fileName) && isGeometryDiffable(after.fileName)
        ? <VaultGeometryDiffPanel key={`${before.id}:${after.id}`} before={before} after={after} />
        : <p>Hash and size changes show byte differences only. The geometry diff reads STL, OBJ, glTF/GLB and STEP/STP; native CAD files (for example .sldprt or .f3d) are not parsed, so check in a STEP or mesh export alongside them to measure what changed.</p>}
    </>}
  </div>;
}
