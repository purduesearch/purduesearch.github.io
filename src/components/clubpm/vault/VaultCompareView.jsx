import { useEffect, useRef, useState } from "react";
import VaultModelViewer from "./VaultModelViewer";

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
 */
export default function VaultCompareView({ versions }) {
  const list = versions ?? [];

  // Default to comparing the two newest previewable versions: left = older
  // ("before"), right = newer ("after").
  const [leftId, setLeftId] = useState(list[1]?.id ?? list[0]?.id ?? "");
  const [rightId, setRightId] = useState(list[0]?.id ?? "");
  const [syncEnabled, setSyncEnabled] = useState(false);

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
      if (leftApiRef.current) leftApiRef.current.controls.autoRotate = true;
      if (rightApiRef.current) rightApiRef.current.controls.autoRotate = true;
    };
  }, [syncEnabled]);

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
          label="Left"
          list={list}
          versionId={leftId}
          onVersionChange={setLeftId}
          version={leftVersion}
          onControlsReady={handleLeftControlsReady}
        />
        <ComparePane
          label="Right"
          list={list}
          versionId={rightId}
          onVersionChange={setRightId}
          version={rightVersion}
          onControlsReady={handleRightControlsReady}
        />
      </div>
    </div>
  );
}

function ComparePane({ label, list, versionId, onVersionChange, version, onControlsReady }) {
  return (
    <div className="cpm-vault-compare-pane">
      <label className="cpm-vault-field">
        <span>{label}</span>
        <select value={versionId} onChange={(e) => onVersionChange(e.target.value)}>
          {list.map((v) => (
            <option key={v.id} value={v.id}>
              {v.revision ? `Rev ${v.revision}` : `v${v.versionNumber}`} · {v.fileName}
            </option>
          ))}
        </select>
      </label>
      {version && (
        <VaultModelViewer
          key={version.id}
          versionId={version.id}
          fileName={version.fileName}
          height={320}
          onControlsReady={onControlsReady}
        />
      )}
    </div>
  );
}
