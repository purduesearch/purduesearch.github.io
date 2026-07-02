import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Lazy WebGL starfield — a subtle drifting point-cloud rendered behind the
 * Home mission-pillars section. Plain Three.js (no react-three-fiber),
 * following the STLViewer.jsx house pattern.
 *
 * Props:
 *   density — number of star points (default 1200)
 */
const StarfieldCanvas = ({ density = 1200 }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Scene ──────────────────────────────────────────────
    const scene = new THREE.Scene();

    // ── Renderer ───────────────────────────────────────────
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    // ── Camera ─────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    camera.position.set(0, 0, 60);

    // ── Star geometry ──────────────────────────────────────
    const CREAM = new THREE.Color('#f5efe6');
    const GREY = new THREE.Color('#7a6f68');
    const MARS = new THREE.Color('#b83225');

    const positions = new Float32Array(density * 3);
    const colors = new Float32Array(density * 3);

    for (let i = 0; i < density; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * 60;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * 35;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * 20;

      const r = Math.random();
      const color = r < 0.85 ? CREAM : r < 0.97 ? GREY : MARS;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ── Pointer parallax state ─────────────────────────────
    const pointer = { x: 0, y: 0 };
    const cameraTarget = { x: 0, y: 0 };

    const onPointerMove = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };

    if (!prefersReduced) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    // ── Render loop ────────────────────────────────────────
    let frameId = null;
    let running = false;

    const renderFrame = () => {
      renderer.render(scene, camera);
    };

    const animate = () => {
      frameId = requestAnimationFrame(animate);

      points.rotation.y += 0.0004;

      cameraTarget.x = pointer.x * 1.5;
      cameraTarget.y = pointer.y * 1.0;
      camera.position.x += (cameraTarget.x - camera.position.x) * 0.05;
      camera.position.y += (cameraTarget.y - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      renderFrame();
    };

    const start = () => {
      if (running || prefersReduced) return;
      running = true;
      animate();
    };

    const stop = () => {
      running = false;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };

    if (prefersReduced) {
      // Single static frame — no RAF loop, no pointer tracking.
      renderFrame();
    } else {
      start();
    }

    // ── Resize ─────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const nw = mount.clientWidth || 1;
      const nh = mount.clientHeight || 1;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(nw, nh);
      if (prefersReduced) renderFrame();
    });
    ro.observe(mount);

    // ── Visibility pause (offscreen / tab hidden) ──────────
    const io = new IntersectionObserver(
      (entries) => {
        if (prefersReduced) return;
        const entry = entries[0];
        if (entry.isIntersecting && document.visibilityState === 'visible') {
          start();
        } else {
          stop();
        }
      },
      { threshold: 0 }
    );
    io.observe(mount);

    const onVisibilityChange = () => {
      if (prefersReduced) return;
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        // Only resume if the mount is currently intersecting the viewport;
        // re-observing lets the IO callback fire again with fresh state.
        io.unobserve(mount);
        io.observe(mount);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // ── Cleanup ────────────────────────────────────────────
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (!prefersReduced) {
        window.removeEventListener('pointermove', onPointerMove);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [density]);

  return <div className="starfield-canvas-wrap" ref={mountRef} aria-hidden="true" />;
};

export default StarfieldCanvas;
