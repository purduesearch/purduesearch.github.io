import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

// ── Map exact node labels to model builder keys ───────────────────────────────
const NODE_MODEL_MAP = {
  // Power system
  'Power Generation, Supply, and Storage System': 'solar',
  // Water system
  'Water Waste Tank': 'water',
  // Bioreactor / waste treatment
  'APMBR':                              'bioreactor',
  'SAMBR':                              'bioreactor',
  'Waste Management Bioreactor Systems': 'bioreactor',
};

// ── Fallback: map system IDs (from AstroFlowDiagram) to model builder keys ───
const SYSTEM_MODEL_MAP = {
  power: 'solar',
  water: 'water',
  waste: 'bioreactor',
};

// ── Shared material helpers ───────────────────────────────────────────────────
const mat = (color, metalness = 0.5, roughness = 0.4, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

// ── Procedural model builders ─────────────────────────────────────────────────

function buildSolarArray() {
  const group = new THREE.Group();

  // Mounting pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.2, 10),
    mat(0x9e9e9e, 0.85, 0.25)
  );
  pole.position.y = -0.2;
  group.add(pole);

  // Yaw joint (sphere at top of pole)
  const joint = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 8),
    mat(0x757575, 0.9, 0.2)
  );
  joint.position.y = 0.95;
  group.add(joint);

  // Panel frame backing
  const panelMat = mat(0x1a3a5c, 0.55, 0.45);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.15, 0.06), panelMat);
  panel.position.y = 1.0;
  group.add(panel);

  // Solar cells (3 × 3 grid) — emissive blue
  const cellMat = mat(0x1a237e, 0.25, 0.08);
  cellMat.emissive = new THREE.Color(0x0d47a1);
  cellMat.emissiveIntensity = 0.35;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cell = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.025), cellMat);
      cell.position.set((col - 1) * 0.66, 1.0 + (row - 1) * 0.35, 0.045);
      group.add(cell);
    }
  }

  // Cell dividers (thin strips)
  const divMat = mat(0x37474f, 0.8, 0.3);
  // Horizontal dividers
  [-0.175, 0.175].forEach(y => {
    const div = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 0.035), divMat);
    div.position.set(0, 1.0 + y, 0.048);
    group.add(div);
  });
  // Vertical dividers
  [-0.33, 0.33].forEach(x => {
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.1, 0.035), divMat);
    div.position.set(x, 1.0, 0.048);
    group.add(div);
  });

  group.position.y = -0.3;
  return group;
}

function buildWaterTank() {
  const group = new THREE.Group();
  const tankMat = mat(0x4fc3f7, 0.65, 0.18, { transparent: true, opacity: 0.82 });
  const metalMat = mat(0x90a4ae, 0.88, 0.22);

  // Main body — CapsuleGeometry gives a cylinder with hemispherical caps
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.68, 1.6, 12, 24), tankMat);
  group.add(body);

  // Band rings (structural reinforcement look)
  [0.6, 0, -0.6].forEach(y => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 8, 32), metalMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  });

  // Inlet pipe (right side, upper)
  const pipeGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.42, 10);
  const inPipe = new THREE.Mesh(pipeGeo, metalMat);
  inPipe.rotation.z = Math.PI / 2;
  inPipe.position.set(0.82, 0.45, 0);
  group.add(inPipe);

  // Outlet pipe (right side, lower)
  const outPipe = new THREE.Mesh(pipeGeo, metalMat);
  outPipe.rotation.z = Math.PI / 2;
  outPipe.position.set(0.82, -0.45, 0);
  group.add(outPipe);

  // Pressure gauge dome (top)
  const gauge = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), metalMat);
  gauge.position.set(0.2, 1.1, 0);
  group.add(gauge);

  // Fill indicator strip (emissive blue-green)
  const fillMat = mat(0x00bcd4, 0.3, 0.1);
  fillMat.emissive = new THREE.Color(0x006064);
  fillMat.emissiveIntensity = 0.5;
  const fill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), fillMat);
  fill.position.set(-0.71, -0.3, 0);
  group.add(fill);

  group.position.y = -0.1;
  return group;
}

function buildBioreactor() {
  const group = new THREE.Group();
  const vesselMat = mat(0x66bb6a, 0.38, 0.52);
  const metalMat  = mat(0x78909c, 0.82, 0.28);

  // Main vessel body (capsule shape)
  const vessel = new THREE.Mesh(new THREE.CapsuleGeometry(0.58, 1.8, 12, 24), vesselMat);
  group.add(vessel);

  // Lower conical outlet
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.55, 24), vesselMat);
  cone.rotation.x = Math.PI;
  cone.position.y = -1.18;
  group.add(cone);

  // Outlet nozzle at bottom of cone
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), metalMat);
  nozzle.position.y = -1.6;
  group.add(nozzle);

  // Central agitator shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 10), metalMat);
  shaft.position.y = 0.25;
  group.add(shaft);

  // Agitator blades (two sets, offset 90°)
  const bladeMat = mat(0xb0bec5, 0.75, 0.35);
  [
    { y: 0.1,  rot: 0 },
    { y: 0.1,  rot: Math.PI / 2 },
    { y: 0.55, rot: Math.PI / 4 },
    { y: 0.55, rot: -Math.PI / 4 },
  ].forEach(({ y, rot }) => {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.14), bladeMat);
    blade.position.set(0, y, 0);
    blade.rotation.y = rot;
    group.add(blade);
  });

  // Side aeration port (left)
  const portGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.38, 10);
  const port = new THREE.Mesh(portGeo, metalMat);
  port.rotation.z = Math.PI / 2;
  port.position.set(-0.66, 0.3, 0);
  group.add(port);

  // Biogas outlet (top, small pipe)
  const gasPort = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 10), metalMat);
  gasPort.position.set(0.25, 1.2, 0);
  group.add(gasPort);

  // Membrane casing bands
  [0.5, -0.3].forEach(y => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 32), metalMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    group.add(band);
  });

  // Emissive bio-activity glow (inner cylinder — dim green)
  const glowMat = mat(0x1b5e20, 0.1, 0.9, { transparent: true, opacity: 0.35 });
  glowMat.emissive = new THREE.Color(0x2e7d32);
  glowMat.emissiveIntensity = 0.6;
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.75, 24), glowMat);
  glow.position.y = 0.1;
  group.add(glow);

  group.position.y = -0.1;
  return group;
}

const BUILDERS = {
  solar:      buildSolarArray,
  water:      buildWaterTank,
  bioreactor: buildBioreactor,
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function AstroSubsystem3D({ nodeLabel, systemId }) {
  const mountRef = useRef(null);
  // Prefer an exact label match; fall back to the parent system's default model.
  const modelKey = NODE_MODEL_MAP[nodeLabel] || SYSTEM_MODEL_MAP[systemId] || null;

  // Detect low-end devices: skip WebGL if hardware concurrency or memory is minimal
  const isLowEnd =
    (navigator.hardwareConcurrency ?? 4) <= 2 ||
    ((navigator.deviceMemory ?? 4) <= 2);

  useEffect(() => {
    if (!modelKey || isLowEnd) return;
    const mount = mountRef.current;
    if (!mount) return;

    // ── Scene setup ───────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const w = mount.clientWidth || 280;
    const h = mount.clientHeight || 200;
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(0, 0.6, 4.5);
    camera.lookAt(0, 0.2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // transparent — page bg shows through
    mount.appendChild(renderer.domElement);

    // ── Lighting ──────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8899cc, 0.4);
    fillLight.position.set(-5, -1, -4);
    scene.add(fillLight);

    // Subtle rim light from below (space bounce)
    const rimLight = new THREE.DirectionalLight(0x334466, 0.3);
    rimLight.position.set(0, -5, 2);
    scene.add(rimLight);

    // ── Model ─────────────────────────────────────────────────────────────
    const group = BUILDERS[modelKey]();
    scene.add(group);

    // ── Mouse drag-to-rotate + auto-rotate ────────────────────────────────
    let autoRotate  = true;
    let isDragging  = false;
    let prevX       = 0;
    let resumeTimer = null;

    const resumeAutoRotate = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { autoRotate = true; }, 2500);
    };

    const onMouseDown = (e) => {
      isDragging  = true;
      autoRotate  = false;
      prevX       = e.clientX;
      clearTimeout(resumeTimer);
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      group.rotation.y += (e.clientX - prevX) * 0.011;
      prevX = e.clientX;
    };
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      resumeAutoRotate();
    };

    // Touch support
    const onTouchStart = (e) => {
      isDragging  = true;
      autoRotate  = false;
      prevX       = e.touches[0].clientX;
      clearTimeout(resumeTimer);
    };
    const onTouchMove = (e) => {
      if (!isDragging) return;
      group.rotation.y += (e.touches[0].clientX - prevX) * 0.011;
      prevX = e.touches[0].clientX;
    };
    const onTouchEnd = () => {
      isDragging = false;
      resumeAutoRotate();
    };

    renderer.domElement.addEventListener('mousedown',  onMouseDown);
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('mousemove',  onMouseMove);
    window.addEventListener('mouseup',    onMouseUp);
    window.addEventListener('touchmove',  onTouchMove, { passive: true });
    window.addEventListener('touchend',   onTouchEnd);

    // ── Render loop ───────────────────────────────────────────────────────
    let rafId;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (autoRotate) group.rotation.y += 0.007;
      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(resumeTimer);
      renderer.domElement.removeEventListener('mousedown',  onMouseDown);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('mousemove',  onMouseMove);
      window.removeEventListener('mouseup',    onMouseUp);
      window.removeEventListener('touchmove',  onTouchMove);
      window.removeEventListener('touchend',   onTouchEnd);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [modelKey, isLowEnd]);

  // No model defined for this node — render nothing
  if (!modelKey) return null;

  // Low-end device fallback
  if (isLowEnd) {
    return (
      <div className="subsystem-3d-fallback">
        <i className="fas fa-cube" aria-hidden="true" />
        <span>3D preview unavailable on this device</span>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className="subsystem-3d-canvas-wrap"
      title="Drag to rotate"
      aria-label={`3D model of ${nodeLabel}`}
      role="img"
    />
  );
}
