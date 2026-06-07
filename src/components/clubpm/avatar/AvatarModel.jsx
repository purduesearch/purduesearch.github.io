// VRM-based avatar renderer. Loads a base VRM, applies featureJson, attaches
// hair/outfit cosmetic VRMs, and exposes the R3F Canvas. Used in Editor
// preview pane and on the member's own Profile.
//
// Everywhere else uses AvatarPortrait (cached PNG snapshot) — this component
// is the heavy WebGL path and should never be rendered in lists.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import { loadVrm } from "../../../clubpm/avatar/vrm/loadVrm";
import { applyConfig } from "../../../clubpm/avatar/vrm/applyConfig";
import { attachHair, attachOutfit } from "../../../clubpm/avatar/vrm/attachCosmetic";
import { getBaseModel, DEFAULT_BASE_MODEL_ID } from "../../../clubpm/avatar/vrm/baseModels";
import { getHairAsset } from "../../../clubpm/avatar/vrm/hairAssets";
import { getOutfitAsset } from "../../../clubpm/avatar/vrm/outfitAssets";
import { migrateFeatureJson } from "../../../clubpm/avatar/vrm/migrateFeatureJson";

function VrmScene({ featureJson, equippedCosmetics, onReady, celebrationType }) {
  const [vrm, setVrm] = useState(null);
  const detachHairRef = useRef(() => {});
  const detachOutfitRef = useRef(() => {});
  // Celebration animation start timestamp (seconds). null when idle.
  const celebStartRef = useRef(null);
  useEffect(() => {
    celebStartRef.current = celebrationType ? performance.now() / 1000 : null;
  }, [celebrationType]);

  // Load base VRM whenever baseModelId changes.
  useEffect(() => {
    let cancelled = false;
    let disposed = () => {};
    const baseId = featureJson?.baseModelId ?? DEFAULT_BASE_MODEL_ID;
    const base = getBaseModel(baseId);
    loadVrm(base.url).then(({ vrm: loaded, dispose }) => {
      if (cancelled) { dispose(); return; }
      disposed = dispose;
      setVrm(loaded);
      onReady?.(loaded);
    }).catch((err) => {
      console.error("[AvatarModel] failed to load VRM", base.url, err);
    });
    return () => {
      cancelled = true;
      detachHairRef.current?.();
      detachOutfitRef.current?.();
      detachHairRef.current = () => {};
      detachOutfitRef.current = () => {};
      setVrm(null);
      disposed();
    };
  }, [featureJson?.baseModelId, onReady]);

  // Re-apply config on any featureJson change (cheap; runs in-place).
  useEffect(() => {
    if (!vrm) return;
    applyConfig(vrm, featureJson);
  }, [vrm, featureJson]);

  // Swap hair cosmetic.
  useEffect(() => {
    if (!vrm) return;
    let cancelled = false;
    detachHairRef.current?.();
    const hairDef = getHairAsset(equippedCosmetics?.hair);
    if (!hairDef) { detachHairRef.current = () => {}; return; }
    attachHair(vrm, hairDef).then((detach) => {
      if (cancelled) { detach(); return; }
      detachHairRef.current = detach;
    });
    return () => { cancelled = true; };
  }, [vrm, equippedCosmetics?.hair]);

  // Swap outfit cosmetic.
  useEffect(() => {
    if (!vrm) return;
    let cancelled = false;
    detachOutfitRef.current?.();
    const outfitDef = getOutfitAsset(equippedCosmetics?.outfit ?? equippedCosmetics?.clothing);
    if (!outfitDef) { detachOutfitRef.current = () => {}; return; }
    attachOutfit(vrm, outfitDef).then((detach) => {
      if (cancelled) { detach(); return; }
      detachOutfitRef.current = detach;
    });
    return () => { cancelled = true; };
  }, [vrm, equippedCosmetics?.outfit, equippedCosmetics?.clothing]);

  useFrame((_, dt) => {
    vrm?.update?.(dt);
    if (!vrm || !celebrationType || celebStartRef.current == null) return;

    const tNow = performance.now() / 1000 - celebStartRef.current;
    const duration = 2.5;
    const phase = Math.min(1, tNow / duration);

    // Hips / root transform animation. Most VRMs expose hips via humanoid bones,
    // but to be base-model-agnostic we animate scene.position / rotation directly.
    const root = vrm.scene;
    if (celebrationType === 'streak-milestone') {
      // Jump arc: y = 0.6 * sin(pi * phase) — peaks at t=duration/2.
      const jumpY = 0.6 * Math.sin(Math.PI * phase);
      root.position.y = -1.25 + jumpY;

      // Full 360 spin over the entire animation duration.
      root.rotation.y = phase * Math.PI * 2;

      // Slight forward lean at apex.
      const lean = 0.18 * Math.sin(Math.PI * phase);
      root.rotation.x = lean;
    }

    // VRM 1.x: trigger happy expression at peak.
    if (vrm.expressionManager && phase > 0.2 && phase < 0.85) {
      try {
        const intensity = Math.sin((phase - 0.2) / 0.65 * Math.PI);
        vrm.expressionManager.setValue?.('happy', intensity);
        vrm.expressionManager.update?.();
      } catch {/* expression manager not available */}
    }

    // Reset to rest pose when finished.
    if (phase >= 1) {
      root.position.y = -1.25;
      root.rotation.set(0, 0, 0);
      try {
        vrm.expressionManager?.setValue?.('happy', 0);
        vrm.expressionManager?.update?.();
      } catch {/* */}
    }
  });

  if (!vrm) return null;
  // Camera framing: head + shoulders. VRM origin is at the feet, head sits
  // around y=1.4. Pull the scene down so the head lands near y=0.
  return <primitive object={vrm.scene} position={[0, -1.25, 0]} />;
}

export default function AvatarModel({
  featureJson,
  equippedCosmetics,
  size = 240,
  interactive = false,
  preserveDrawingBuffer = false,
  onReady,
  celebrationType = null,
}) {
  const migrated = useMemo(() => migrateFeatureJson(featureJson), [featureJson]);
  return (
    <div style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: [0, 0.1, 1.5], fov: 30 }}
        gl={{ preserveDrawingBuffer }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 4, 3]} intensity={0.9} />
        <Suspense fallback={null}>
          <VrmScene
            featureJson={migrated}
            equippedCosmetics={equippedCosmetics}
            onReady={onReady}
            celebrationType={celebrationType}
          />
        </Suspense>
        {interactive && (
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            target={[0, 0, 0]}
          />
        )}
      </Canvas>
    </div>
  );
}
