import { prisma } from "../db/prisma.js";
import { randomBytes } from "crypto";

const CODE_LENGTH = 7;
const BASE_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

function generateCode(): string {
  return randomBytes(Math.ceil((CODE_LENGTH * 3) / 4))
    .toString("base64url")
    .slice(0, CODE_LENGTH);
}

export async function createUtmLink(
  targetUrl: string,
  submissionId?: string,
  platform?: string
): Promise<{ code: string; shortUrl: string; targetUrl: string }> {
  let code: string;
  let attempts = 0;

  // Retry on rare collision (extremely unlikely with 7-char base64url)
  while (true) {
    code = generateCode();
    const existing = await prisma.utmLink.findUnique({ where: { code } });
    if (!existing) break;
    if (++attempts > 5) throw new Error("Could not generate unique UTM code");
  }

  await prisma.utmLink.create({
    data: {
      code,
      targetUrl,
      submissionId: submissionId ?? null,
      platform: platform ?? null,
    },
  });

  return { code, shortUrl: `${BASE_URL}/r/${code}`, targetUrl };
}

export async function recordClick(code: string): Promise<string | null> {
  const link = await prisma.utmLink.findUnique({ where: { code } });
  if (!link) return null;

  await prisma.utmLink.update({
    where: { code },
    data: { clicks: { increment: 1 } },
  });

  return link.targetUrl;
}

export async function getLinksForSubmission(submissionId: string) {
  return prisma.utmLink.findMany({
    where: { submissionId },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteLink(code: string): Promise<void> {
  await prisma.utmLink.delete({ where: { code } });
}
