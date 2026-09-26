import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  apiBaseUrl,
  buildVaultReleasePackage,
  getCrRelease,
  getVaultReleaseManifestText,
  getVaultReleasePackageUrl,
  verifyVaultRelease,
} from "../../../api/clubPmClient";
import { formatBytes } from "./vaultUtils";

const STATE_LABEL = { ready: "Ready to build", warnings: "Ready with warnings", blocked: "Blocked" };
const ROLE_LABEL = { RELEASED: "Released", COMPONENT: "Component", DRAWING: "Drawing" };
const PACKAGE_LABEL = { PENDING: "Queued", BUILDING: "Building", READY: "Ready", FAILED: "Failed" };
const short = (sha) => (sha ? sha.slice(0, 12) : "—");

// Pre-approval build readiness and impact for one change request. Blockers
// stop approval (the server enforces the same rules in the approval
// transaction); warnings are for the reviewer's judgement.
export function ReadinessPanel({ readiness, loading, error, onRefresh }) {
  return (
    <section className="cpm-vault-review-panel cpm-vault-readiness" data-tour-id="cr.readiness">
      <h3>Build readiness{readiness?.stored ? " at approval" : ""}</h3>
      {error ? <div className="cpm-vault-placeholder">{error}</div>
        : !readiness ? <div className="cpm-vault-loading"><div className="cpm-spinner" /></div>
        : <ReadinessBody readiness={readiness} loading={loading} onRefresh={onRefresh} />}
    </section>
  );
}

function ReadinessBody({ readiness, loading, onRefresh }) {
  const label = (id) => readiness.labels?.[id] || id;
  return (
    <>
      <strong className={`cpm-vault-readiness-state cpm-vault-readiness-state-${readiness.state}`}>{STATE_LABEL[readiness.state] || readiness.state}</strong>
      <div className="cpm-vault-readiness-meta">{readiness.entryCount} file{readiness.entryCount === 1 ? "" : "s"} will be pinned in the release package.</div>
      {onRefresh && <button type="button" className="cpm-vault-btn-ghost" onClick={onRefresh} disabled={loading}>{loading ? "Checking…" : "Recheck"}</button>}

      {readiness.blockers.length > 0 && (
        <div className="cpm-vault-readiness-group">
          <h4>Blocks approval</h4>
          <ul>{readiness.blockers.map((f, i) => <li key={`${f.code}-${i}`} className="cpm-vault-finding cpm-vault-finding-blocker"><code>{f.code}</code> {f.message}</li>)}</ul>
        </div>
      )}
      {readiness.warnings.length > 0 && (
        <div className="cpm-vault-readiness-group">
          <h4>Warnings (approval allowed)</h4>
          <ul>{readiness.warnings.map((f, i) => <li key={`${f.code}-${i}`} className="cpm-vault-finding cpm-vault-finding-warning"><code>{f.code}</code> {f.message}</li>)}</ul>
        </div>
      )}

      <div className="cpm-vault-readiness-group">
        <h4>Where used</h4>
        {readiness.whereUsed.every((w) => w.chains.length === 0)
          ? <div>No assembly uses these items.</div>
          : <ul>{readiness.whereUsed.flatMap((w) => w.chains.map((chain) => <li key={chain.join(">")}>{chain.map(label).join(" → ")}</li>))}</ul>}
      </div>

      <div className="cpm-vault-readiness-group">
        <h4>Missing required drawings ({readiness.missingDrawings.length})</h4>
        {readiness.missingDrawings.length === 0
          ? <div>None.</div>
          : <ul>{readiness.missingDrawings.map((m) => <li key={m.itemId}>{label(m.itemId)} · {m.severity === "BLOCKER" ? "blocks approval" : "warning"}</li>)}</ul>}
      </div>

      <div className="cpm-vault-readiness-group">
        <h4>Assemblies on stale revisions ({readiness.staleAssemblies.length})</h4>
        {readiness.staleAssemblies.length === 0
          ? <div>None.</div>
          : <ul>{readiness.staleAssemblies.map((s) => <li key={`${s.assemblyId}-${s.childId}`}>{label(s.assemblyId)}{s.assemblyRevision ? ` Rev ${s.assemblyRevision}` : ""} ← {label(s.childId)}</li>)}</ul>}
      </div>

      <div className="cpm-vault-readiness-group">
        <h4>Affected open tasks ({readiness.affectedTasks.length})</h4>
        {readiness.affectedTasks.length === 0
          ? <div>No open tasks reference these items.</div>
          : <ul>{readiness.affectedTasks.map((t) => <li key={t.id}>{t.title} · {t.status.replace("_", " ").toLowerCase()} · {t.reasons.join("; ")}</li>)}</ul>}
      </div>
    </>
  );
}

// Immutable release record for an approved change request: manifest hash,
// pinned files, and the reproducible assembly package.
export function ReleasePanel({ crId }) {
  return (
    <section className="cpm-vault-review-panel cpm-vault-release" data-tour-id="cr.release">
      <h3>Release package</h3>
      <ReleaseBody crId={crId} />
    </section>
  );
}

function ReleaseBody({ crId }) {
  const [release, setRelease] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState(null);
  const pollRef = useRef(0);

  const load = useCallback(async () => {
    try { setRelease(await getCrRelease(crId)); }
    catch (err) { setRelease(null); toast.error(err.message || "Failed to load release"); }
  }, [crId]);

  useEffect(() => { load(); }, [load]);

  // Poll while the package builds; stop after ~5 minutes and let the member refresh.
  useEffect(() => {
    if (!release || !["PENDING", "BUILDING"].includes(release.packageState) || pollRef.current > 60) return undefined;
    const timer = setTimeout(() => { pollRef.current += 1; load(); }, 5000);
    return () => clearTimeout(timer);
  }, [release, load]);

  if (release === undefined) return <div className="cpm-vault-loading"><div className="cpm-spinner" /></div>;
  if (release === null) return <div>This change request was approved before release manifests existed, so it has no pinned package.</div>;

  async function run(action) {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (err) { toast.error(err.message || "Release action failed"); }
    finally { setBusy(false); }
  }

  const download = () => run(async () => {
    const { url } = await getVaultReleasePackageUrl(release.id);
    window.location.assign(`${apiBaseUrl}${url}`);
  });
  const rebuild = () => run(async () => { pollRef.current = 0; setRelease(await buildVaultReleasePackage(release.id)); await load(); });
  const verify = () => run(async () => {
    const result = await verifyVaultRelease(release.id);
    setVerification(result);
    if (result.reproducible) toast.success("Package reproduced byte for byte");
    else toast.error(result.error || "Package could not be reproduced");
  });
  const saveManifest = () => run(async () => {
    const text = await getVaultReleaseManifestText(release.id);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = `CR-${release.changeRequestNumber}-manifest.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success("Copied"), () => {});
  const entries = release.manifest?.entries || [];

  return (
    <>
      <div className="cpm-vault-release-hashes">
        <div>Manifest SHA-256 <code>{short(release.manifestSha256)}</code> <button type="button" className="cpm-vault-btn-ghost" onClick={() => copy(release.manifestSha256)} aria-label="Copy manifest SHA-256">Copy</button></div>
        <div>
          Package <strong className={`cpm-vault-package-state cpm-vault-package-state-${release.packageState.toLowerCase()}`}>{PACKAGE_LABEL[release.packageState] || release.packageState}</strong>
          {release.packageSha256 && <> · <code>{short(release.packageSha256)}</code> <button type="button" className="cpm-vault-btn-ghost" onClick={() => copy(release.packageSha256)} aria-label="Copy package SHA-256">Copy</button></>}
          {release.packageSize && <> · {formatBytes(Number(release.packageSize))}</>}
        </div>
        {release.packageError && <div className="cpm-vault-finding cpm-vault-finding-blocker">{release.packageError}</div>}
      </div>
      <div className="cpm-vault-release-actions">
        <button type="button" className="clubpm-btn-primary" onClick={download} disabled={busy || release.packageState !== "READY"}>Download package</button>
        {["FAILED", "PENDING"].includes(release.packageState) && <button type="button" className="cpm-vault-btn-ghost" onClick={rebuild} disabled={busy}>{release.packageState === "FAILED" ? "Retry build" : "Build now"}</button>}
        <button type="button" className="cpm-vault-btn-ghost" onClick={verify} disabled={busy}>{busy ? "Working…" : "Verify reproducibility"}</button>
        <button type="button" className="cpm-vault-btn-ghost" onClick={saveManifest} disabled={busy}>Save manifest</button>
      </div>
      {verification && (
        <div className={`cpm-vault-finding ${verification.reproducible ? "cpm-vault-finding-ok" : "cpm-vault-finding-blocker"}`}>
          {verification.reproducible ? `Rebuilt from pinned versions: ${short(verification.rebuiltPackageSha256)} matches.` : `Not reproducible: ${verification.error}`}
        </div>
      )}
      <div className="cpm-vault-release-table" role="table" aria-label="Pinned files">
        {entries.map((e) => (
          <div key={e.packagePath} className="cpm-vault-release-row" role="row">
            <div role="cell" className="cpm-vault-release-role">{ROLE_LABEL[e.role] || e.role}</div>
            <div role="cell">{e.partNumber || e.name}{e.revision ? ` · Rev ${e.revision}` : ""} · v{e.versionNumber}</div>
            <div role="cell" className="cpm-vault-release-file">{e.fileName} · {formatBytes(e.sizeBytes)}</div>
            <div role="cell"><code title={e.sha256}>{short(e.sha256)}</code>{e.storage?.commitSha && <> · commit <code title={`${e.storage.repository}@${e.storage.commitSha}`}>{short(e.storage.commitSha)}</code></>}</div>
          </div>
        ))}
      </div>
    </>
  );
}
