// applyConfig(vrm, featureJson) mutates a loaded VRM to match a featureJson.
// Runs once on load and on every Editor change (NOT per-frame; only vrm.update
// runs per-frame, from AvatarModel).
//
// Order: face morphs → body bones → material tints → toggle sub-meshes.
//
// Tolerates missing morph names / missing bones / missing materials — the
// placeholder VRMs don't carry the full vocabulary yet, so each step is a
// no-op when its target isn't present.

const lerp = (a, b, t) => a + (b - a) * t;

const FACE_MORPH_NAMES = [
  "faceWidth", "faceJaw", "faceCheek",
  "eyeSize", "eyeSpacing",
  "noseWidth", "noseHeight",
  "mouthWidth", "browHeight",
];

const DEFAULT_FACE = {
  faceWidth: 0.5, faceJaw: 0.5, faceCheek: 0.5,
  eyeSize: 0.5, eyeSpacing: 0.5,
  noseWidth: 0.5, noseHeight: 0.5,
  mouthWidth: 0.5, browHeight: 0.5,
};

const DEFAULT_BODY = { height: 0.5, build: 0.5, shoulderWidth: 0.5, headSize: 0.5 };

// Bone-scale ranges. 0.5 = identity. The ranges are intentionally narrow so
// proportions don't go grotesque even at slider extremes.
const BONE_RANGES = {
  height:        { bone: "spine",     axis: "y", min: 0.95, max: 1.05 },
  build:         { bone: "spine",     axis: "x", min: 0.92, max: 1.10 },
  shoulderWidth: { bone: "leftShoulder",  axis: "x", min: 0.90, max: 1.12, mirror: "rightShoulder" },
  headSize:      { bone: "head",      axis: "uniform", min: 0.92, max: 1.08 },
};

function applyFaceMorphs(vrm, face) {
  // VRM 1.x: expressionManager. VRM 0.x or non-expression morphs: walk meshes.
  const expr = vrm.expressionManager;
  for (const name of FACE_MORPH_NAMES) {
    const value = face[name] ?? 0.5;
    let handled = false;
    if (expr?.getExpression?.(name)) {
      expr.setValue(name, value);
      handled = true;
    }
    if (!handled) {
      vrm.scene.traverse((obj) => {
        if (!obj.isMesh || !obj.morphTargetDictionary) return;
        const idx = obj.morphTargetDictionary[name];
        if (idx !== undefined && obj.morphTargetInfluences) {
          obj.morphTargetInfluences[idx] = value;
        }
      });
    }
  }
  expr?.update?.();
}

function applyBodyBones(vrm, body) {
  const h = vrm.humanoid;
  if (!h?.getNormalizedBoneNode) return;
  for (const [key, range] of Object.entries(BONE_RANGES)) {
    const value = body[key] ?? 0.5;
    const scale = lerp(range.min, range.max, value);
    const node = h.getNormalizedBoneNode(range.bone);
    if (node) {
      if (range.axis === "uniform") node.scale.setScalar(scale);
      else node.scale[range.axis] = scale;
      node.matrixAutoUpdate = true;
    }
    if (range.mirror) {
      const mNode = h.getNormalizedBoneNode(range.mirror);
      if (mNode) {
        if (range.axis === "uniform") mNode.scale.setScalar(scale);
        else mNode.scale[range.axis] = scale;
        mNode.matrixAutoUpdate = true;
      }
    }
  }
}

function applyMaterialTints(vrm, colors) {
  if (!colors) return;
  const tintPrefixes = [
    { prefix: "Skin", hex: colors.skin },
    { prefix: "Hair", hex: colors.hair },
    { prefix: "Eyes", hex: colors.eyes },
  ];
  vrm.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat?.name) continue;
      const slot = tintPrefixes.find((t) => mat.name.startsWith(t.prefix));
      if (!slot || !slot.hex) continue;
      if (mat.color?.setStyle) mat.color.setStyle(slot.hex);
      // MToon also exposes a `_Color` on uniforms; harmless if absent.
      if (mat.uniforms?._Color?.value?.setStyle) {
        mat.uniforms._Color.value.setStyle(slot.hex);
      }
    }
  });
}

function applyToggles(vrm, toggles) {
  if (!toggles) return;
  const wantGlasses = !!toggles.hasGlasses;
  const wantBeard   = !!toggles.hasBeard;
  vrm.scene.traverse((obj) => {
    if (!obj.name) return;
    const lower = obj.name.toLowerCase();
    if (lower.includes("glass")) obj.visible = wantGlasses;
    if (lower.includes("beard")) obj.visible = wantBeard;
  });
}

export function applyConfig(vrm, featureJson) {
  const face    = { ...DEFAULT_FACE, ...(featureJson?.faceMorphs ?? {}) };
  const body    = { ...DEFAULT_BODY, ...(featureJson?.bodyMorphs ?? {}) };
  const colors  = featureJson?.colors;
  const toggles = featureJson?.toggles;

  applyFaceMorphs(vrm, face);
  applyBodyBones(vrm, body);
  applyMaterialTints(vrm, colors);
  applyToggles(vrm, toggles);
}
