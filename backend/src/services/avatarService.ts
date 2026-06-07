// Avatar service — wraps Gemini for feature extraction from a photo, plus
// CRUD on AvatarConfig (one row per member).

import { prisma } from "../db/prisma.js";
import { generateJsonFromImage } from "./geminiService.js";

export type BaseModelId =
  | "male-01" | "male-02"
  | "female-01" | "female-02"
  | "andro-01"  | "andro-02";

export type FeatureJson = {
  baseModelId: BaseModelId;
  faceMorphs:  Record<string, number>;
  bodyMorphs:  Record<string, number>;
  colors:      { skin: string; hair: string; eyes: string };
  toggles:     { hasGlasses: boolean; hasBeard: boolean };
};

// Returned by Gemini extraction — a partial hint, NOT a full FeatureJson.
export type FeatureHints = {
  baseModelId?:    BaseModelId;
  colors?:         Partial<{ skin: string; hair: string; eyes: string }>;
  toggles?:        Partial<{ hasGlasses: boolean; hasBeard: boolean }>;
  faceMorphHints?: Partial<Record<"faceWidth" | "eyeSize" | "noseWidth" | "mouthWidth", number>>;
  bodyHints?:      Partial<Record<"build", number>>;
};

export type EquippedCosmetics = {
  outfit:    string | null;
  hair:      string | null;
  theme:     string | null;
  frame:     string | null;
  animation: string | null;
};

const DEFAULT_FEATURES: FeatureJson = {
  baseModelId: "male-01",
  faceMorphs: {
    faceWidth: 0.5, faceJaw: 0.5, faceCheek: 0.5,
    eyeSize: 0.5, eyeSpacing: 0.5,
    noseWidth: 0.5, noseHeight: 0.5,
    mouthWidth: 0.5, browHeight: 0.5,
  },
  bodyMorphs: { height: 0.5, build: 0.5, shoulderWidth: 0.5, headSize: 0.5 },
  colors:     { skin: "#d2a074", hair: "#5d3a1f", eyes: "#5c3a1a" },
  toggles:    { hasGlasses: false, hasBeard: false },
};

const DEFAULT_EQUIPPED: EquippedCosmetics = {
  outfit: null, hair: null, theme: null, frame: null, animation: null,
};

const EXTRACT_PROMPT = `You are an avatar feature extractor for a VRoid-style 3D character creator.
Analyze the supplied portrait and return ONLY a JSON object matching this schema (no prose):
{
  "baseModelId":   "male-01|male-02|female-01|female-02|andro-01|andro-02",
  "colors": {
    "skin": "#RRGGBB",
    "hair": "#RRGGBB",
    "eyes": "#RRGGBB"
  },
  "toggles": {
    "hasGlasses": true|false,
    "hasBeard":   true|false
  },
  "faceMorphHints": {
    "faceWidth":  0.0..1.0,
    "eyeSize":    0.0..1.0,
    "noseWidth":  0.0..1.0,
    "mouthWidth": 0.0..1.0
  },
  "bodyHints": {
    "build":      0.0..1.0
  }
}
Notes:
- baseModelId: pick whichever closest matches the perceived gender/body silhouette.
- colors: rough hex codes for the skin, hair, and iris.
- morph hints are sliders where 0 = narrow/small, 0.5 = average, 1 = wide/large.
- Omit any field you cannot confidently estimate; partial output is acceptable.
- Never invent enum values outside the allowed set.`;

export async function extractFeaturesFromImage(
  base64: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp" = "image/jpeg"
): Promise<FeatureHints | null> {
  return generateJsonFromImage<FeatureHints>(base64, mimeType, EXTRACT_PROMPT);
}

export async function getAvatarConfig(memberId: string) {
  const cfg = await prisma.avatarConfig.findUnique({ where: { memberId } });
  if (cfg) return cfg;
  // Create on first read so the editor always has something to load
  return prisma.avatarConfig.create({
    data: {
      memberId,
      featureJson:       DEFAULT_FEATURES as any,
      equippedCosmetics: DEFAULT_EQUIPPED as any,
    },
  });
}

export async function saveAvatarConfig(
  memberId: string,
  featureJson: FeatureJson,
  equippedCosmetics: EquippedCosmetics
) {
  return prisma.avatarConfig.upsert({
    where: { memberId },
    update: { featureJson: featureJson as any, equippedCosmetics: equippedCosmetics as any },
    create: { memberId, featureJson: featureJson as any, equippedCosmetics: equippedCosmetics as any },
  });
}

export async function saveAvatarPortrait(memberId: string, portraitUrl: string) {
  return prisma.avatarConfig.upsert({
    where:  { memberId },
    update: { portraitUrl },
    create: {
      memberId,
      featureJson:       DEFAULT_FEATURES as any,
      equippedCosmetics: DEFAULT_EQUIPPED as any,
      portraitUrl,
    },
  });
}
