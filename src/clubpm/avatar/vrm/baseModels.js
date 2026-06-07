// Registry of bundled base VRMs. The id is what gets persisted on
// AvatarConfig.featureJson.baseModelId; the url is fetched at runtime.
//
// defaultColors are the hex tints applied to the MToon Skin/Hair/Eyes
// materials when a member first picks a base and hasn't touched the color
// pickers yet.

const BASE_MODELS = {
  "male-01": {
    label:         "Male — slim",
    gender:        "male",
    url:           "/avatar/base/male-01.vrm",
    defaultColors: { skin: "#f4d4b0", hair: "#1b1b1b", eyes: "#5c3a1a" },
  },
  "male-02": {
    label:         "Male — broad",
    gender:        "male",
    url:           "/avatar/base/male-02.vrm",
    defaultColors: { skin: "#d2a074", hair: "#5d3a1f", eyes: "#3a6fb0" },
  },
  "female-01": {
    label:         "Female — slim",
    gender:        "female",
    url:           "/avatar/base/female-01.vrm",
    defaultColors: { skin: "#f4d4b0", hair: "#5d3a1f", eyes: "#5c3a1a" },
  },
  "female-02": {
    label:         "Female — broad",
    gender:        "female",
    url:           "/avatar/base/female-02.vrm",
    defaultColors: { skin: "#d2a074", hair: "#1b1b1b", eyes: "#3a6fb0" },
  },
  "andro-01": {
    label:         "Androgynous A",
    gender:        "androgynous",
    url:           "/avatar/base/andro-01.vrm",
    defaultColors: { skin: "#a87349", hair: "#e2c275", eyes: "#3f7a4b" },
  },
  "andro-02": {
    label:         "Androgynous B",
    gender:        "androgynous",
    url:           "/avatar/base/andro-02.vrm",
    defaultColors: { skin: "#5d3920", hair: "#9c9c9c", eyes: "#8a6a2d" },
  },
};

export const DEFAULT_BASE_MODEL_ID = "male-01";

export function getBaseModel(id) {
  return BASE_MODELS[id] ?? BASE_MODELS[DEFAULT_BASE_MODEL_ID];
}

export function listBaseModels() {
  return Object.entries(BASE_MODELS).map(([id, def]) => ({ id, ...def }));
}

export default BASE_MODELS;
