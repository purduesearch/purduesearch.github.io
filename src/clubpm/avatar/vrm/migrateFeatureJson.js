// Coerces legacy AvatarConfig.featureJson (primitive-era enum strings) into
// the new VRM shape. Used both by the Editor on first load and by AvatarModel
// when rendering a member who hasn't re-saved since the migration.

import { DEFAULT_BASE_MODEL_ID, getBaseModel } from "./baseModels.js";

const SKIN_TONE_HEX = {
  light:  "#f4d4b0",
  medium: "#d2a074",
  tan:    "#a87349",
  dark:   "#5d3920",
};
const HAIR_COLOR_HEX = {
  black:  "#1b1b1b",
  brown:  "#5d3a1f",
  blonde: "#e2c275",
  red:    "#a33a1b",
  grey:   "#9c9c9c",
  white:  "#f2f0eb",
  other:  "#7a6f68",
};
const EYE_COLOR_HEX = {
  brown: "#5c3a1a",
  blue:  "#3a6fb0",
  green: "#3f7a4b",
  hazel: "#8a6a2d",
  grey:  "#8c8c8c",
  other: "#2c2c2c",
};

const DEFAULT_FACE = {
  faceWidth: 0.5, faceJaw: 0.5, faceCheek: 0.5,
  eyeSize: 0.5, eyeSpacing: 0.5,
  noseWidth: 0.5, noseHeight: 0.5,
  mouthWidth: 0.5, browHeight: 0.5,
};
const DEFAULT_BODY = { height: 0.5, build: 0.5, shoulderWidth: 0.5, headSize: 0.5 };

function isNewShape(json) {
  return !!(json && json.baseModelId && json.colors && json.faceMorphs);
}

export function migrateFeatureJson(legacy) {
  if (!legacy) {
    const base = getBaseModel(DEFAULT_BASE_MODEL_ID);
    return {
      baseModelId: DEFAULT_BASE_MODEL_ID,
      faceMorphs:  { ...DEFAULT_FACE },
      bodyMorphs:  { ...DEFAULT_BODY },
      colors:      { ...base.defaultColors },
      toggles:     { hasGlasses: false, hasBeard: false },
    };
  }
  if (isNewShape(legacy)) return legacy;

  const base = getBaseModel(DEFAULT_BASE_MODEL_ID);
  return {
    baseModelId: DEFAULT_BASE_MODEL_ID,
    faceMorphs:  { ...DEFAULT_FACE },
    bodyMorphs:  { ...DEFAULT_BODY },
    colors: {
      skin: SKIN_TONE_HEX[legacy.skinTone]   ?? base.defaultColors.skin,
      hair: HAIR_COLOR_HEX[legacy.hairColor] ?? base.defaultColors.hair,
      eyes: EYE_COLOR_HEX[legacy.eyeColor]   ?? base.defaultColors.eyes,
    },
    toggles: {
      hasGlasses: !!legacy.hasGlasses,
      hasBeard:   !!legacy.hasBeard,
    },
  };
}
