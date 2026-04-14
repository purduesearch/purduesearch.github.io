import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

/**
 * Interactive STL model viewer backed by Three.js.
 * Props:
 *   url    — path to the .stl file (served from public/)
 *   height — canvas height in pixels (default 480)
 *   color  — mesh hex color (default #c8d0d8)
 */
const STLViewer = ({ url, height = 480, color = '#c8d0d8' }) => {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Scene ──────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d1117');

    // Subtle grid floor for spatial reference
    const grid = new THREE.GridHelper(500, 30, 0x333333, 0x222222);
    scene.add(grid);

    // ── Renderer ───────────────────────────────────────────
    const w = mount.clientWidth;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
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

    // ── STL Load ───────────────────────────────────────────
    let mesh = null;
    const loader = new STLLoader();

    loader.load(
      url,
      (geometry) => {
        geometry.computeBoundingBox();
        geometry.computeVertexNormals();

        // Center at origin
        const box = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
        const center = new THREE.Vector3();
        box.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);

        // Compute size after centering
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);

        // Fit camera
        const fovRad = camera.fov * (Math.PI / 180);
        const dist = (maxDim / 2) / Math.tan(fovRad / 2) * 2.2;
        camera.position.set(dist * 0.55, dist * 0.35, dist);
        camera.near = maxDim / 1000;
        camera.far = maxDim * 100;
        camera.updateProjectionMatrix();

        // Position grid below the model
        grid.position.y = -size.y / 2;

        controls.maxDistance = maxDim * 8;
        controls.minDistance = maxDim * 0.3;
        controls.target.set(0, 0, 0);
        controls.update();

        // Material
        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(color),
          specular: new THREE.Color(0x555555),
          shininess: 40,
        });

        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        setLoading(false);
      },
      undefined,
      (err) => {
        console.error('[STLViewer] load error:', err);
        setError('Could not load 3D model.');
        setLoading(false);
      }
    );

    // ── Render loop ────────────────────────────────────────
    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
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
      cancelAnimationFrame(frameId);
      ro.disconnect();
      controls.dispose();
      if (mesh) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [url, height, color]);

  return (
    <div className="stl-viewer-wrap" style={{ height }}>
      {loading && (
        <div className="stl-viewer-overlay">
          <i className="fas fa-circle-notch fa-spin stl-spinner" aria-hidden="true" />
          <span>Loading 3D model…</span>
        </div>
      )}
      {error && (
        <div className="stl-viewer-overlay stl-viewer-error">
          <i className="fas fa-exclamation-circle" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default STLViewer;
