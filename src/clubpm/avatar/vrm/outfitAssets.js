// Outfit cosmetic registry. Each entry is keyed by Cosmetic.id (filled in by
// the seed script) and points to a VRM/GLB whose body meshes replace the
// corresponding submeshes on the base avatar.
//
// `replaceMeshes` is the list of mesh names on the base VRM whose `visible`
// flag is set to false before the outfit's meshes are added; the outfit's
// meshes are added under the closest equivalent bone on the base rig (or the
// root if no match).

const OUTFIT_ASSETS = {
  // Example shape:
  // "ckxyz...": {
  //   url:           "/avatar/cosmetics/outfit/flight-jacket.vrm",
  //   replaceMeshes: ["Body", "Tops", "Bottoms"],
  //   label:         "Flight jacket",
  // },
};

export function getOutfitAsset(cosmeticId) {
  if (!cosmeticId) return null;
  return OUTFIT_ASSETS[cosmeticId] ?? null;
}

export default OUTFIT_ASSETS;
