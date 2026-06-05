/**
 * Cloudflare Workers AI — text-to-image via FLUX.1 Schnell.
 *
 * Free tier: 10,000 neurons/day on the free plan.
 * Model: @cf/black-forest-labs/flux-1-schnell (best free quality)
 *
 * Required env vars:
 *   CLOUDFLARE_ACCOUNT_ID  — found in Cloudflare dashboard right sidebar
 *   CLOUDFLARE_API_TOKEN   — API token with "Workers AI:Read" permission
 */

const CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const CF_BASE  = "https://api.cloudflare.com/client/v4/accounts";

export function isCloudflareConfigured(): boolean {
  return !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

export async function generateImageCloudflare({
  prompt,
  steps = 8,
}: {
  prompt: string;
  steps?: number;
}): Promise<{ base64: string; mimeType: string; model: string; width: number; height: number }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken  = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_NOT_CONFIGURED");
  }

  const url = `${CF_BASE}/${accountId}/ai/run/${CF_MODEL}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body:   JSON.stringify({ prompt, steps: Math.min(8, Math.max(1, steps)) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Cloudflare Workers AI error ${response.status}: ${body.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  let base64: string;
  let mimeType: string;

  if (contentType.startsWith("image/")) {
    // Raw binary response
    const buf = await response.arrayBuffer();
    base64   = Buffer.from(buf).toString("base64");
    mimeType = contentType.split(";")[0].trim();
  } else {
    // JSON-wrapped response: { success, result: { image: "<base64>" } }
    const json = await response.json() as {
      success: boolean;
      result:  { image?: string };
      errors:  unknown[];
    };
    if (!json.success || !json.result?.image) {
      throw new Error(`Cloudflare Workers AI returned no image: ${JSON.stringify(json.errors)}`);
    }
    base64   = json.result.image;
    mimeType = "image/jpeg";
  }

  return { base64, mimeType, model: CF_MODEL, width: 1024, height: 1024 };
}
