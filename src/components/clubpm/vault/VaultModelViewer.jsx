import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { vaultDownloadUrl, authHeaders } from "../../../api/clubPmClient";
import { extensionOf } from "./vaultUtils";

// Three.js + its loaders are ~150+ kB gzip — this module must only ever be
// reached via React.lazy() from VaultItemModal so it lands in its own chunk,
// never the main bundle. Do not import this file anywhere eagerly.
// (vaultUtils is a dependency-free leaf module, safe to share with it.)

/**
 * Interactive 3D preview for a vault version. Renders in-place with
 * three.js; supports STL, OBJ, and glTF/GLB. Props:
 *   versionId          — VaultVersion id to fetch and render
 *   fileName           — used to pick a loader by extension
 *   height             — canvas height in pixels (default 420)
 *   color              — mesh color for STL/OBJ (materials without their own)
 *   onCaptureThumbnail — optional; called once with a PNG Blob shortly after
 *                        the first successful render (fire-and-forget upload
 *                        is the caller's responsibility)
 *   onControlsReady    — optional; called with { camera, controls } (the live
 *                        three.js PerspectiveCamera + OrbitControls instances)
 *                        once the scene is set up, and again with `null` on
 *                        teardown. Lets a parent (e.g. VaultCompareView) read
 *                        or drive the camera without this component knowing
 *                        anything about that use case.
 */
export default function VaultModelViewer({
  versionId,
  fileName,
  height = 420,
  color = "#c8d0d8",
  onCaptureThumbnail,
  onControlsReady,
}) {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const ext = extensionOf(fileName);

  // The caller (VaultItemModal) re-renders on every unrelated state change
  // (busy flags, tab switches, etc.) and can't easily keep this callback
  // referentially stable across renders. Route it through a ref so the main
  // setup effect below — which builds an entire three.js scene — only
  // depends on versionId/ext/height/color and doesn't tear down/rebuild the
  // canvas every time the parent re-renders.
  const onCaptureThumbnailRef = useRef(onCaptureThumbnail);
  useEffect(() => {
    onCaptureThumbnailRef.current = onCaptureThumbnail;
  }, [onCaptureThumbnail]);

  const onControlsReadyRef = useRef(onControlsReady);
  useEffect(() => {
    onControlsReadyRef.current = onControlsReady;
  }, [onControlsReady]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    if (!["stl", "obj", "gltf", "glb"].includes(ext)) {
      setError("This file type can't be previewed.");
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    let objectUrl = null;
    let captured = false;
    let framesRendered = 0;
    let object = null; // loaded Mesh (STL) or Group (OBJ/GLTF)

    setLoading(true);
    setError(null);

    // ── Scene ──────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0d0f14");

    const grid = new THREE.GridHelper(500, 30, 0x333333, 0x222222);
    scene.add(grid);

    // ── Renderer ───────────────────────────────────────────
    const w = mount.clientWidth;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── Camera ─────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, w / height, 0.01, 100000);
    camera.position.set(0, 50, 200);

    // ── Lights ─────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(200, 300, 200);
    key.castShadow = true;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8ab4f8, 0.5);
    fill.position.set(-200, 100, -100);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x4a7c3f, 0.35);
    rim.position.set(0, -200, -200);
    scene.add(rim);

    // ── Controls ───────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 2000;

    onControlsReadyRef.current?.({ camera, controls });

    function fitToObject(obj) {
      const box = new THREE.Box3().setFromObject(obj);
      const center = new THREE.Vector3();
      box.getCenter(center);
      obj.position.sub(center);

      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;

      const fovRad = camera.fov * (Math.PI / 180);
      const dist = ((maxDim / 2) / Math.tan(fovRad / 2)) * 2.2;
      camera.position.set(dist * 0.55, dist * 0.35, dist);
      camera.near = maxDim / 1000;
      camera.far = maxDim * 100;
      camera.updateProjectionMatrix();

      grid.position.y = -size.y / 2;
      controls.maxDistance = maxDim * 8;
      controls.minDistance = maxDim * 0.3;
      controls.target.set(0, 0, 0);
      controls.update();
    }

    function onLoaded(obj) {
      if (cancelled) return;
      object = obj;
      scene.add(object);
      fitToObject(object);
      setLoading(false);
    }

    function onLoadError(err) {
      console.error("[VaultModelViewer] load error:", err);
      if (!cancelled) {
        setError("Could not load 3D model.");
        setLoading(false);
      }
    }

    async function load() {
      try {
        // Bearer header included — cross-origin users may have no usable
        // session cookie (third-party cookies blocked).
        const res = await fetch(vaultDownloadUrl(versionId), {
          credentials: "include",
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);

        if (ext === "stl") {
          new STLLoader().load(
            objectUrl,
            (geometry) => {
              if (cancelled) return;
              geometry.computeBoundingBox();
              geometry.computeVertexNormals();
              const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color(color),
                specular: new THREE.Color(0x555555),
                shininess: 40,
              });
              const mesh = new THREE.Mesh(geometry, material);
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              onLoaded(mesh);
            },
            undefined,
            onLoadError
          );
        } else if (ext === "obj") {
          new OBJLoader().load(
            objectUrl,
            (group) => {
              if (cancelled) return;
              group.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                  child.material = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(color),
                    specular: new THREE.Color(0x555555),
                    shininess: 40,
                  });
                }
              });
              onLoaded(group);
            },
            undefined,
            onLoadError
          );
        } else {
          new GLTFLoader().load(
            objectUrl,
            (gltf) => {
              if (cancelled) return;
              gltf.scene.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
              onLoaded(gltf.scene);
            },
            undefined,
            onLoadError
          );
        }
      } catch (err) {
        onLoadError(err);
      }
    }
    load();

    // ── Render loop ────────────────────────────────────────
    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      // Capture a thumbnail a few frames after the model first appears so
      // the pose (auto-rotate having nudged the camera) looks intentional.
      // Read the callback from the ref (not the closed-over prop) so a
      // fresh function identity on re-render doesn't matter here.
      if (object && !captured && onCaptureThumbnailRef.current) {
        framesRendered += 1;
        if (framesRendered > 3) {
          captured = true;
          renderer.domElement.toBlob((blob) => {
            if (blob && !cancelled) onCaptureThumbnailRef.current?.(blob);
          }, "image/png");
        }
      }
    };
    animate();

    // ── Resize ─────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (!mount) return;
      const nw = mount.clientWidth;
      camera.aspect = nw / height;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, height);
    });
    ro.observe(mount);

    // ── Cleanup ────────────────────────────────────────────
    return () => {
      cancelled = true;
      onControlsReadyRef.current?.(null);
      cancelAnimationFrame(frameId);
      ro.disconnect();
      controls.dispose();
      if (object) {
        object.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material?.dispose();
          }
        });
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [versionId, ext, height, color]);

  return (
    <div className="cpm-vault-model-viewer" style={{ height }}>
      {loading && !error && (
        <div className="cpm-vault-model-viewer-overlay">
          <div className="cpm-spinner" />
          <span>Loading 3D model…</span>
        </div>
      )}
      {error && (
        <div className="cpm-vault-model-viewer-overlay cpm-vault-model-viewer-error">
          <i className="fas fa-exclamation-circle" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
