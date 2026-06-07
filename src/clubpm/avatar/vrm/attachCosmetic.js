// attachCosmetic loads a cosmetic VRM/GLB and either parents its meshes under
// a named bone on the base (hair) or substitutes named submeshes (outfit).
// Returns a detach() that reverses the attachment so the editor can swap
// cosmetics cleanly without reloading the base.

import { loadVrm } from "./loadVrm.js";

export async function attachHair(baseVrm, hairDef) {
  if (!hairDef?.url) return () => {};
  const { vrm: hairVrm, dispose } = await loadVrm(hairDef.url);
  const headBone = baseVrm.humanoid?.getNormalizedBoneNode?.(hairDef.attachBone ?? "head");
  const parent = headBone ?? baseVrm.scene;
  parent.add(hairVrm.scene);

  return () => {
    parent.remove(hairVrm.scene);
    dispose();
  };
}

export async function attachOutfit(baseVrm, outfitDef) {
  if (!outfitDef?.url) return () => {};
  const replaceMeshes = outfitDef.replaceMeshes ?? [];

  // Hide the base submeshes we're replacing.
  const previousVisibility = new Map();
  baseVrm.scene.traverse((obj) => {
    if (obj.isMesh && replaceMeshes.includes(obj.name)) {
      previousVisibility.set(obj, obj.visible);
      obj.visible = false;
    }
  });

  const { vrm: outfitVrm, dispose } = await loadVrm(outfitDef.url);
  baseVrm.scene.add(outfitVrm.scene);

  return () => {
    baseVrm.scene.remove(outfitVrm.scene);
    for (const [mesh, vis] of previousVisibility) mesh.visible = vis;
    dispose();
  };
}
