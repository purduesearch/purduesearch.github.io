// Thin wrapper around GLTFLoader + VRMLoaderPlugin. Returns the loaded VRM
// plus a dispose() that fully releases GPU resources — important because the
// Editor swaps base models on click and we don't want to leak textures.

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

export async function loadVrm(url) {
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm;
  if (!vrm) {
    throw new Error(`loadVrm: ${url} has no VRM payload`);
  }

  // VRoid exports include unused vertices/morphs; trimming saves draw calls.
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.combineMorphs(vrm);

  // Disable frustum culling on every mesh — skinned meshes report a
  // bounding box from rest pose that's often wrong after bone scaling,
  // and a culled head looks like a bug.
  vrm.scene.traverse((obj) => {
    if (obj.isMesh) obj.frustumCulled = false;
  });

  const dispose = () => {
    VRMUtils.deepDispose(vrm.scene);
  };

  return { vrm, dispose };
}
