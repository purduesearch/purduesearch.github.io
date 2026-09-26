import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getVaultGeometryDiff, requestVaultGeometryDiff } from "../../../api/clubPmClient";
import { extensionOf, isPreviewable, isStepFile, UNITLESS_GEOMETRY_EXTENSIONS } from "./vaultUtils";

// three.js lands in its own chunk: VaultCompareView imports VaultModelViewer.
const VaultCompareView = lazy(() => import("./VaultCompareView"));

// Same hues as VaultModelViewer's OVERLAY_COLORS / ARROW_COLOR (not imported:
// that module pulls three.js into whatever imports it).
const LEGEND = [
  { key: "added", label: "Added material", color: "#2dd4a8" },
  { key: "removed", label: "Removed material", color: "#ff5c7a" },
  { key: "changed", label: "Changed surface (material side unknown)", color: "#f5a623" },
  { key: "moved", label: "Displacement", color: "#9b8cff" },
];
const POLL_MS = 2500;
const UNITS = ["mm", "cm", "m", "in", "ft"];

const VERDICT = {
  IDENTICAL_WITHIN_TOLERANCE: "Identical within tolerance",
  TRANSLATED: "Moved without changing shape",
  CHANGED: "Geometry changed",
};
const COMPONENT_STATUS = {
  UNCHANGED: "Unchanged", MOVED: "Moved", MODIFIED: "Modified", ADDED: "Added", REMOVED: "Removed", NOT_COMPARED: "Not compared",
};
const FAILURE = {
  UNSUPPORTED_FORMAT: "Unsupported format",
  UNSUPPORTED_FEATURE: "Unsupported file feature",
  PARSE_FAILED: "Could not read the file",
  CONVERSION_FAILED: "STEP conversion failed",
  EMPTY_GEOMETRY: "No geometry in the file",
  TOO_LARGE: "Too large to diff",
  TIMEOUT: "Timed out",
  MEMORY_LIMIT: "Memory limit exceeded",
};

const unitLabel = (unit) => unit || "model units";
const fmt = (v) => (v == null ? "—" : String(v));
const fmtVec = (v, unit) => (v ? `(${v.map(fmt).join(", ")}) ${unitLabel(unit)}` : "—");
const fmtSize = (size, unit) => (size ? `${size.map(fmt).join(" × ")} ${unitLabel(unit)}` : "—");
const signed = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}`);

function volumeText(volume, unit) {
  if (!volume) return "—";
  if (volume.status !== "COMPUTED") return `Not computed (${volume.status.toLowerCase().replace(/_/g, " ")})`;
  return `${fmt(volume.value)} ${unit}³`;
}
function exactnessText(exactness) {
  if (exactness === "EXACT_FOR_STORED_MESH") return "exact for the stored mesh";
  if (exactness === "TESSELLATION_APPROXIMATION") return "tessellation approximation";
  return "";
}
function meshCheck(topology) {
  if (!topology) return "—";
  const issues = [];
  if (!topology.closed) issues.push(`open (${topology.boundaryEdges} boundary edges)`);
  if (!topology.manifold) issues.push(`non-manifold (${topology.nonManifoldEdges} edges)`);
  if (!topology.oriented) issues.push(`inconsistent orientation (${topology.inconsistentEdges} edges)`);
  if (topology.degenerateTriangles) issues.push(`${topology.degenerateTriangles} degenerate triangles`);
  return issues.length ? issues.join("; ") : "Closed, manifold, consistently oriented";
}
function versionName(v) {
  return `${v.revision ? `Rev ${v.revision}` : `v${v.versionNumber}`} · ${v.fileName}`;
}

/**
 * Measured geometry diff between two pinned versions (Phase 9). Requests the
 * server-side diff (cached by both versions' SHA-256 + algorithm version),
 * polls while it runs, then shows units, tolerance, measurements, component
 * changes and aligned side-by-side views with annotations. Every number
 * carries its status; nothing is shown as exact that is not.
 */
export default function VaultGeometryDiffPanel({ before, after }) {
  const needsUnits = useMemo(
    () => [before, after].filter((v) => UNITLESS_GEOMETRY_EXTENSIONS.has(extensionOf(v.fileName))),
    [before, after]
  );
  const [units, setUnits] = useState("");
  const [tolerance, setTolerance] = useState("");
  const [applied, setApplied] = useState({ units: "", tolerance: "" });
  const [diff, setDiff] = useState(null);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const inFlight = useRef(false);

  const request = useCallback(async (opts) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRequesting(true);
    setError("");
    try {
      const body = { beforeVersionId: before.id, afterVersionId: after.id };
      if (opts.units) body.units = opts.units;
      if (opts.tolerance) body.tolerance = Number(opts.tolerance);
      const res = await requestVaultGeometryDiff(body);
      setDiff(res.diff);
    } catch (err) {
      setDiff(null);
      setError(err.message || "Could not request the geometry diff.");
    } finally {
      inFlight.current = false;
      setRequesting(false);
    }
  }, [before.id, after.id]);

  // New pair: reset options and request with defaults (the server returns a cached result when it has one).
  useEffect(() => {
    setUnits(""); setTolerance(""); setApplied({ units: "", tolerance: "" });
    setDiff(null);
    request({ units: "", tolerance: "" });
  }, [request]);

  // Poll while queued or running.
  const pending = diff && (diff.state === "PENDING" || diff.state === "RUNNING" || (diff.state === "FAILED" && diff.retrying));
  useEffect(() => {
    if (!pending) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await getVaultGeometryDiff(diff.id);
        if (!cancelled) setDiff(res.diff);
      } catch (err) {
        if (!cancelled) setError(err.message || "Lost track of the geometry diff.");
      }
    }, POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pending, diff]);

  function apply(e) {
    e.preventDefault();
    const tol = tolerance.trim();
    if (tol && !(Number(tol) > 0)) { setError("Tolerance must be a positive number."); return; }
    setApplied({ units, tolerance: tol });
    request({ units, tolerance: tol });
  }

  const report = diff?.result?.status === "COMPLETE" ? diff.result : null;
  const failure = diff?.result && diff.result.status !== "COMPLETE" ? diff.result : null;
  const unit = report?.units.comparison ?? null;
  const canView = report && [before, after].every((v) => isPreviewable(v.fileName) || isStepFile(v.fileName));
  const dirty = units !== applied.units || tolerance.trim() !== applied.tolerance;

  return (
    <section className="cpm-vault-geometry" data-tour-id="vault.geometryDiff" aria-labelledby="cpm-vault-geometry-title">
      <h4 id="cpm-vault-geometry-title">Geometry diff</h4>
      <form className="cpm-vault-geometry-controls" onSubmit={apply}>
        {needsUnits.length > 0 && (
          <label>
            Export unit of {needsUnits.map((v) => extensionOf(v.fileName).toUpperCase()).filter((x, i, a) => a.indexOf(x) === i).join(" / ")} file
            <select value={units} onChange={(e) => setUnits(e.target.value)}>
              <option value="">Not declared (no volume)</option>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        )}
        <label>
          Tolerance
          <input type="number" min="0" step="any" inputMode="decimal" value={tolerance} placeholder="Automatic" onChange={(e) => setTolerance(e.target.value)} aria-describedby="cpm-vault-geometry-tolerance-hint" />
        </label>
        <button type="submit" className="cpm-vault-btn-ghost" disabled={requesting || !dirty}>Recompute</button>
        <div id="cpm-vault-geometry-tolerance-hint" className="cpm-vault-geometry-hint">
          Tolerance is a length in the comparison unit{report ? ` (${unitLabel(unit)})` : ""}. Surfaces closer than it count as unchanged.
          {needsUnits.length > 0 && " STL and OBJ files carry no unit; declare the one they were exported in to get physical dimensions and volume."}
        </div>
      </form>

      <div className="cpm-vault-geometry-status" role="status" aria-live="polite">
        {error ? <div className="cpm-vault-geometry-error">{error}</div>
          : !diff ? "Requesting geometry diff…"
          : diff.state === "PENDING" ? "Queued — large models are processed in the background."
          : diff.state === "RUNNING" ? "Computing geometry diff…"
          : diff.state === "FAILED" ? <div className="cpm-vault-geometry-error">{FAILURE[diff.outcomeStatus] ? `${FAILURE[diff.outcomeStatus]}: ` : ""}{diff.error}{diff.retrying ? " Retrying automatically." : ""}</div>
          : failure ? <div className="cpm-vault-geometry-error">{FAILURE[failure.status] || failure.status} ({failure.side === "before" ? versionName(before) : versionName(after)}): {failure.message}</div>
          : report ? <div className={`cpm-vault-geometry-verdict cpm-vault-geometry-verdict--${report.summary.verdict.toLowerCase()}`}>{VERDICT[report.summary.verdict]}{report.summary.translation ? ` by ${fmtVec(report.summary.translation, unit)}` : ""}</div>
          : null}
      </div>

      {report && <DiffReport report={report} unit={unit} before={before} after={after} />}

      {report && (canView ? (
        <div className="cpm-vault-geometry-views">
          <div className="cpm-vault-geometry-legend" aria-label="Overlay legend">
            {LEGEND.map((l) => <div key={l.key} className="cpm-vault-geometry-legend-item"><div className="cpm-vault-geometry-swatch" style={{ background: l.color }} aria-hidden="true" />{l.label}</div>)}
          </div>
          <div className="cpm-vault-geometry-hint">
            Both views share one coordinate frame, so a moved part appears moved. Markers show through the model; each side marks its own surface.
            {(report.overlay.pointCaps.before || report.overlay.pointCaps.after) && " Markers are thinned to a representative subset."}
          </div>
          <Suspense fallback={<div className="cpm-vault-geometry-hint">Loading viewers…</div>}>
            <VaultCompareView versions={[after, before]} diff={diff} />
          </Suspense>
          {report.overlay.arrows.length > 0 && (
            <ul className="cpm-vault-geometry-annotations" aria-label="Annotations">
              {report.overlay.arrows.map((a, i) => <li key={i}>{a.label}: moved {fmtVec(a.to.map((t, k) => Number((t - a.from[k]).toPrecision(6))), unit)}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <div className="cpm-vault-geometry-hint">This format has no in-browser preview; the measurements above are complete.</div>
      ))}
    </section>
  );
}

function DiffReport({ report, unit, before, after }) {
  const { summary } = report;
  const volUnit = unit;
  return (
    <div className="cpm-vault-geometry-report">
      <dl className="cpm-vault-geometry-facts">
        <div><dt>Units</dt><dd>{unit ? `${unit} — ${report.units.note}` : report.units.note}</dd></div>
        <div><dt>Tolerance</dt><dd>{fmt(report.tolerance.value)} {unitLabel(report.tolerance.unit)} ({report.tolerance.source === "auto" ? "automatic" : "requested"}). {report.tolerance.note}</dd></div>
        <div><dt>Computed with</dt><dd><code>{report.algorithmVersion}</code>{[report.before, report.after].some((s) => s.conversion) && <> · STEP via <code>{(report.before.conversion || report.after.conversion).tool}@{(report.before.conversion || report.after.conversion).version}</code></>}</dd></div>
      </dl>

      <div className="cpm-vault-geometry-table-wrap">
        <table className="cpm-vault-geometry-table">
          <caption>Measurements</caption>
          <thead><tr><th scope="col" /><th scope="col">Before · {versionName(before)}</th><th scope="col">After · {versionName(after)}</th><th scope="col">Change</th></tr></thead>
          <tbody>
            <tr><th scope="row">Bounding box</th><td>{fmtSize(report.before.bbox?.size, unit)}</td><td>{fmtSize(report.after.bbox?.size, unit)}</td><td>{summary.bboxDelta.map(signed).join(" × ")} {unitLabel(unit)}</td></tr>
            <tr>
              <th scope="row">Volume</th>
              <td>{volumeText(report.before.volume, volUnit)}<VolumeNote volume={report.before.volume} /></td>
              <td>{volumeText(report.after.volume, volUnit)}<VolumeNote volume={report.after.volume} /></td>
              <td>{summary.volumeDelta ? <>{signed(summary.volumeDelta.value)} {unit}³<div className="cpm-vault-geometry-qualifier">{exactnessText(summary.volumeDelta.exactness)}</div></> : "Not computed"}</td>
            </tr>
            <tr><th scope="row">Mesh check</th><td>{meshCheck(report.before.topology)}</td><td>{meshCheck(report.after.topology)}</td><td /></tr>
            <tr><th scope="row">Triangles</th><td>{report.before.triangleCount.toLocaleString()}</td><td>{report.after.triangleCount.toLocaleString()}</td><td>{signed(report.after.triangleCount - report.before.triangleCount)}</td></tr>
            <tr><th scope="row">Units source</th><td>{unitSource(report.before)}</td><td>{unitSource(report.after)}</td><td /></tr>
          </tbody>
        </table>
      </div>

      {summary.verdict !== "IDENTICAL_WITHIN_TOLERANCE" && (
        <dl className="cpm-vault-geometry-facts">
          <div><dt>Max deviation</dt><dd>before → after {fmt(summary.maxDeviation.beforeToAfter)}, after → before {fmt(summary.maxDeviation.afterToBefore)} {unitLabel(unit)}{summary.maxDeviation.capped ? ` (at least; search stopped at ${summary.maxDeviation.searchLimit})` : ""} — sampled</dd></div>
          {summary.verdict === "CHANGED" && (
            <div><dt>Deviating area (estimate)</dt><dd>
              {summary.materialClassification === "INSIDE_OUTSIDE_TEST"
                ? `added ${fmt(summary.deviatingArea.added)}, removed ${fmt(summary.deviatingArea.removed)} ${unit ? `${unit}²` : "model units²"}`
                : `changed ${fmt(summary.deviatingArea.changed)} ${unit ? `${unit}²` : "model units²"} — added/removed cannot be told apart because a model is not a closed solid`}
              {" "}from {summary.deviatingArea.sampleCount.before.toLocaleString()} + {summary.deviatingArea.sampleCount.after.toLocaleString()} surface samples
            </dd></div>
          )}
        </dl>
      )}

      <ComponentTable components={report.components} unit={unit} />

      {[report.before, report.after].map((side, i) => side.conversion || side.warnings.length ? (
        <div key={i} className="cpm-vault-geometry-hint">
          <strong>{i === 0 ? "Before" : "After"}:</strong> {side.conversion?.note} {side.warnings.join(" ")}
        </div>
      ) : null)}

      <details className="cpm-vault-geometry-limits">
        <summary>What this diff can and cannot tell you</summary>
        <ul>{report.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </details>
    </div>
  );
}

function unitSource(side) {
  const s = side.units.source;
  if (!side.units.unit) return "None (file has no unit)";
  return `${side.units.unit} — ${s === "file" ? "declared in the file" : s === "format-spec" ? "defined by the format" : "declared by the requester"}`;
}

function VolumeNote({ volume }) {
  if (!volume) return null;
  return <div className="cpm-vault-geometry-qualifier">{volume.status === "COMPUTED" ? exactnessText(volume.exactness) : volume.note}</div>;
}

function ComponentTable({ components, unit }) {
  if (!components.compared) return <div className="cpm-vault-geometry-hint">Components: {components.note}</div>;
  return (
    <div className="cpm-vault-geometry-table-wrap">
      <table className="cpm-vault-geometry-table">
        <caption>Components</caption>
        <thead><tr><th scope="col">Component</th><th scope="col">Status</th><th scope="col">Size before → after</th><th scope="col">Volume change</th><th scope="col">Detail</th></tr></thead>
        <tbody>
          {components.rows.map((row) => (
            <tr key={row.name} className={`cpm-vault-geometry-row--${row.status.toLowerCase()}`}>
              <th scope="row">{row.name}</th>
              <td><div className={`cpm-vault-geometry-chip cpm-vault-geometry-chip--${row.status.toLowerCase()}`}>{COMPONENT_STATUS[row.status]}</div></td>
              <td>{fmtSize(row.before?.size, unit)} → {fmtSize(row.after?.size, unit)}</td>
              <td>{row.volumeDelta != null ? `${signed(row.volumeDelta)} ${unit}³` : row.status === "ADDED" ? volumeText(row.after?.volume, unit) : row.status === "REMOVED" ? volumeText(row.before?.volume, unit) : "Not computed"}</td>
              <td>{row.translation ? `moved ${fmtVec(row.translation, unit)}` : row.maxDeviation != null ? `max deviation ${fmt(row.maxDeviation)} ${unitLabel(unit)}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cpm-vault-geometry-hint">{components.note}</div>
    </div>
  );
}
