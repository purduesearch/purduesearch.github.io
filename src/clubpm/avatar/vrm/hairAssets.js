// Hair cosmetic registry. Each entry is keyed by Cosmetic.id (filled in by the
// seed script) and points to a VRM/GLB the runtime loads and attaches under
// the base avatar's `head` bone.
//
// Until real assets exist, this registry can be empty — the editor just shows
// "no hair cosmetics owned" and the base VRM's built-in hair mesh shows
// through. `attachBone` lets us swap to a different bone (e.g. `neck`) later.

const HAIR_ASSETS = {
  // Example shape (filled in by seedVrmCosmetics):
  // "ckxyz...": {
  //   url:        "/avatar/cosmetics/hair/long-wavy.vrm",
  //   attachBone: "head",
  //   label:      "Long wavy",
  // },
};

export function getHairAsset(cosmeticId) {
  if (!cosmeticId) return null;
  return HAIR_ASSETS[cosmeticId] ?? null;
}

export default HAIR_ASSETS;
