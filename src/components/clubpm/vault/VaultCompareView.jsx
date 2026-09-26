import { useEffect, useRef, useState } from "react";
import VaultModelViewer from "./VaultModelViewer";
import { vaultGeometryMeshUrl } from "../../../api/clubPmClient";
import { isStepFile } from "./vaultUtils";

// Loaded only via React.lazy from VaultItemModal — it imports VaultModelViewer
// (and therefore three.js) eagerly, which is fine because this whole module
// only ever lands in its own lazy chunk, never the main bundle.

/**
 * Side-by-side 3D compare view for two vault versions (e.g. Rev A vs Rev B).
 * Renders two independent VaultModelViewer instances, each with its own
 * version select, plus a "sync cameras" toggle that mirrors orbit/pan/zoom
 * from whichever pane the user last dragged onto the other.
 *
 * Props:
 *   versions — previewable versions for the item (VaultItemModal already
 *              filters item.versions down to STL/OBJ/GLB before passing this
 *              in), desc order (newest first), each with
 *              id/versionNumber/fileName/revision.
 *   diff     — optional completed geometry diff (VaultGeometryDiffPanel). When
 *              set, the pair is fixed to its before/after versions, both
 *              viewers share the diff's frame (so displacements are visible,
 *              not re-centred away), draw its markers and arrows, and a STEP
 *              side renders the tessellation the diff measured.
 */
export default function VaultCompareView({ versions, diff }) {
  const list = versions ?? [];
  const report = diff?.result?.status === "COMPLETE" ? diff.result : null;

  // Default to comparing the two newest previewable versions: left = older
  // ("before"), right = newer ("after").
  const [leftId, setLeftId] = useState(report ? diff.beforeVersionId : list[1]?.id ?? list[0]?.id ?? "");
  const [rightId, setRightId] = useState(report ? diff.afterVersionId : list[0]?.id ?? "");
  const [syncEnabled, setSyncEnabled] = useState(!!report);

  const leftApiRef = useRef(null);
  const rightApiRef = useRef(null);
  const driverRef = useRef("left");
  const driverCleanupRef = useRef({ left: null, right: null });

  const leftVersion = list.find((v) => v.id === leftId) ?? null;
  const rightVersion = list.find((v) => v.id === rightId) ?? null;

  // Track which pane the user last grabbed so sync (when enabled) knows which
  // camera pose to copy onto the other one.
  function attachDriverTracking(side, api) {
    driverCleanupRef.current[side]?.();
    driverCleanupRef.current[side] = null;
    if (!api) return;
    const markDriver = () => { driverRef.current = side; };
    api.controls.addEventListener("start", markDriver);
    driverCleanupRef.current[side] = () => api.controls.removeEventListener("start", markDriver);
  }

  function handleLeftControlsReady(api) {
    leftApiRef.current = api;
    attachDriverTracking("left", api);
  }

  function handleRightControlsReady(api) {
    rightApiRef.current = api;
    attachDriverTracking("right", api);
  }

  useEffect(() => () => {
    driverCleanupRef.current.left?.();
    driverCleanupRef.current.right?.();
  }, []);

  // While enabled, copy the last-dragged viewer's camera position/target onto
  // the other one every frame. Kept deliberately simple (a direct copy, not a
  // physically-linked orbit) — good enough for lining up a before/after pose.
  useEffect(() => {
    if (!syncEnabled) return undefined;

    driverRef.current = "left";
    let frameId;

    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const left = leftApiRef.current;
      const right = rightApiRef.current;
      if (!left || !right) return;

      // Disable each viewer's own auto-rotate every frame (covers the case
      // where a version select swaps in a freshly-mounted viewer, which
      // defaults auto-rotate back on) so it doesn't fight the copy below.
      left.controls.autoRotate = false;
      right.controls.autoRotate = false;

      const [from, to] = driverRef.current === "right" ? [right, left] : [left, right];
      to.camera.position.copy(from.camera.position);
      to.camera.quaternion.copy(from.camera.quaternion);
      to.controls.target.copy(from.controls.target);
      to.controls.update();
    };
    tick();

    return () => {
      cancelAnimationFrame(frameId);
      if (report) return; // aligned diff views never auto-rotate
      if (leftApiRef.current) leftApiRef.current.controls.autoRotate = true;
      if (rightApiRef.current) rightApiRef.current.controls.autoRotate = true;
    };
  }, [syncEnabled, report]);

  if (list.length === 0) {
    return (
      <div className="cpm-vault-placeholder">
        No previewable versions to compare — check in an STL/OBJ/GLB export alongside the native file.
      </div>
    );
  }

  return (
    <div className="cpm-vault-compare-tab">
      <label className="cpm-vault-compare-sync">
        <input
          type="checkbox"
          checked={syncEnabled}
          onChange={(e) => setSyncEnabled(e.target.checked)}
          disabled={!leftVersion || !rightVersion || leftVersion.id === rightVersion.id}
        />
        Sync cameras
      </label>

      <div className="cpm-vault-compare-grid">
        <ComparePane
          label={report ? "Before" : "Left"}
          list={list}
          versionId={leftId}
          onVersionChange={setLeftId}
          version={leftVersion}
          onControlsReady={handleLeftControlsReady}
          locked={!!report}
          viewerProps={report ? alignedProps(diff, report, "before") : null}
        />
        <ComparePane
          label={report ? "After" : "Right"}
          list={list}
          versionId={rightId}
          onVersionChange={setRightId}
          version={rightVersion}
          onControlsReady={handleRightControlsReady}
          locked={!!report}
          viewerProps={report ? alignedProps(diff, report, "after") : null}
        />
      </div>
    </div>
  );
}

/** Shared frame + this side's markers; the after side also carries the displacement arrows. */
function alignedProps(diff, report, side) {
  const summary = report[side];
  return {
    frame: report.overlay.frame,
    scale: summary.scaleToComparison ?? 1,
    overlay: { points: report.overlay[side], arrows: side === "after" ? report.overlay.arrows : [] },
    autoRotate: false,
    meshUrl: summary.format === "step" ? vaultGeometryMeshUrl(diff.id, side) : undefined,
  };
}

function versionLabel(v) {
  return `${v.revision ? `Rev ${v.revision}` : `v${v.versionNumber}`} · ${v.fileName}`;
}

function ComparePane({ label, list, versionId, onVersionChange, version, onControlsReady, locked, viewerProps }) {
  return (
    <div className="cpm-vault-compare-pane">
      {locked ? (
        <div className="cpm-vault-field">
          <div className="cpm-vault-compare-pane-title">{label}</div>
          <div>{version ? versionLabel(version) : "Version unavailable"}</div>
        </div>
      ) : (
        <label className="cpm-vault-field">
          <span>{label}</span>
          <select value={versionId} onChange={(e) => onVersionChange(e.target.value)}>
            {list.map((v) => (
              <option key={v.id} value={v.id}>
                {versionLabel(v)}
              </option>
            ))}
          </select>
        </label>
      )}
      {version && (!isStepFile(version.fileName) || viewerProps?.meshUrl) && (
        <VaultModelViewer
          key={version.id}
          versionId={version.id}
          fileName={version.fileName}
          height={320}
          onControlsReady={onControlsReady}
          {...(viewerProps || {})}
        />
      )}
    </div>
  );
}
