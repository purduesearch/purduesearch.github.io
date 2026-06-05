import { GoogleGenAI, PersonGeneration } from "@google/genai";

const IMAGEN_MODEL = "imagen-4.0-generate-001";
const IMAGEN_DAILY_LIMIT = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const imagenLog: number[] = [];

function consumeImagenQuota(): boolean {
  const now = Date.now();
  while (imagenLog.length && imagenLog[0] < now - DAY_MS) imagenLog.shift();
  if (imagenLog.length >= IMAGEN_DAILY_LIMIT) return false;
  imagenLog.push(now);
  return true;
}

export function imagenQuotaStatus(): { used: number; remaining: number } {
  const now = Date.now();
  while (imagenLog.length && imagenLog[0] < now - DAY_MS) imagenLog.shift();
  return { used: imagenLog.length, remaining: IMAGEN_DAILY_LIMIT - imagenLog.length };
}

type ImagenAspect = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export async function generateImageImagen4({
  prompt,
  aspectRatio = "1:1",
  numberOfImages = 1,
}: {
  prompt: string;
  aspectRatio?: ImagenAspect;
  numberOfImages?: number;
}): Promise<{ base64: string; mimeType: string; model: string; width: number; height: number }> {
  if (!consumeImagenQuota()) {
    throw new Error("IMAGEN_QUOTA_EXHAUSTED");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const result = await ai.models.generateImages({
    model: IMAGEN_MODEL,
    prompt,
    config: {
      numberOfImages,
      aspectRatio,
      personGeneration: PersonGeneration.ALLOW_ALL,
    },
  });

  const img = result.generatedImages?.[0]?.image;
  if (!img?.imageBytes) throw new Error("IMAGEN_NO_OUTPUT");

  const dimensionMap: Record<ImagenAspect, { width: number; height: number }> = {
    "1:1":  { width: 1024, height: 1024 },
    "3:4":  { width: 768,  height: 1024 },
    "4:3":  { width: 1024, height: 768  },
    "9:16": { width: 576,  height: 1024 },
    "16:9": { width: 1024, height: 576  },
  };
  const { width, height } = dimensionMap[aspectRatio];

  return {
    base64: img.imageBytes,
    mimeType: "image/png",
    model: IMAGEN_MODEL,
    width,
    height,
  };
}
