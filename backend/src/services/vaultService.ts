import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { getSessionSecret } from "../config/env.js";
import { createDriveFolder, ensureProjectDriveFolder, getBotAccountEmail } from "./driveService.js";

/**
 * Excel-style revision letters: A, B, ..., Z, AA, AB, ..., AZ, BA, ...
 * null -> "A", "A" -> "B", "Z" -> "AA", "AZ" -> "BA". Pure function.
 */
export function nextRevisionLetter(current: string | null): string {
  let num = 0;
  if (current) {
    for (const ch of current) {
      num = num * 26 + (ch.charCodeAt(0) - 64);
    }
  }
  num += 1;

  let result = "";
  while (num > 0) {
    const rem = (num - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}

/** Strip characters Drive filenames can't safely carry: slashes and control chars. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/]/g, "").replace(/[\x00-\x1f\x7f]/g, "").trim();
}

export type VaultHealth = {
  status: "ok" | "no-link" | "not-folder" | "not-shared";
  serviceAccountEmail?: string | null;
};

/**
 * Probe-only health check for read endpoints: never calls Drive, never creates
 * the vault folder. Reports "ok" as soon as the project has a parseable Drive
 * folder link — actual `not-shared` failures surface only from a real write
 * attempt (see `ensureVaultFolder`), never from this probe.
 */
export async function getVaultHealth(_projectId: string): Promise<VaultHealth> {
  // The vault is backed by a bot-owned Drive folder that is provisioned lazily
  // (see ensureProjectDriveFolder), so health just reflects whether the Drive
  // bot account is connected at all.
  const email = await getBotAccountEmail();
  return email ? { status: "ok" } : { status: "no-link" };
}

/**
 * Ensure the project's "Constellation Vault" Drive subfolder exists, creating it
 * (under the project's linked Drive folder) on first use. Returns the folder id,
 * or a VaultHealth describing why it couldn't be resolved.
 */
export async function ensureVaultFolder(
  projectId: string
): Promise<{ folderId: string } | { error: VaultHealth }> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return { error: { status: "no-link" } };
  }

  if (project.vaultFolderId) {
    return { folderId: project.vaultFolderId };
  }

  // Anchor the vault under the project's bot-owned Drive folder (created on
  // demand). Null means the Drive bot isn't connected yet.
  const parentId = await ensureProjectDriveFolder(projectId);
  if (!parentId) {
    return { error: { status: "no-link" } };
  }

  const created = await createDriveFolder("Constellation Vault", parentId);
  if (!created) {
    return { error: { status: "not-shared", serviceAccountEmail: await getBotAccountEmail() } };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { vaultFolderId: created.id },
  });

  return { folderId: created.id };
}

/** Allocate the next part number for a project (`<prefix>-0042`), atomically. */
export async function allocatePartNumber(projectId: string): Promise<string> {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { vaultPartCounter: { increment: 1 } },
  });
  return `${project.vaultPartPrefix}-${String(project.vaultPartCounter).padStart(4, "0")}`;
}

/** Allocate the next change-request number for a project, atomically. */
export async function allocateCrNumber(projectId: string): Promise<number> {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { vaultCrCounter: { increment: 1 } },
  });
  return project.vaultCrCounter;
}

/** Member summary select shared by vault + change-request serializers. */
export const MEMBER_SUMMARY = { select: { id: true, displayName: true, avatarUrl: true } } as const;

/** Shared admin check for vault permission guards (creator/holder/author-or-admin). */
export async function isAdminMember(memberId: string): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { isAdmin: true, role: true },
  });
  return !!member?.isAdmin || member?.role === "ADMIN";
}

// ── Signed URLs for binary endpoints ─────────────────────────
// <img>/<a href> requests can't carry the Authorization Bearer header that
// cross-origin users rely on (third-party cookies blocked), so downloads use
// short-lived HMAC-signed URLs minted by an authenticated JSON endpoint.

const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

function vaultUrlHmac(path: string, exp: number): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(`${path}:${exp}`).digest("hex");
}

/** Sign a router-relative path (e.g. /vault/versions/<id>/download) → query suffix. */
export function signVaultPath(path: string): { exp: number; sig: string } {
  const exp = Date.now() + SIGNED_URL_TTL_MS;
  return { exp, sig: vaultUrlHmac(path, exp) };
}

export function verifyVaultSignature(path: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = vaultUrlHmac(path, exp);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/**
 * Would adding the BOM edge parent→child create a cycle? True iff `parentId`
 * is already reachable from `childId` by walking the child's descendants
 * (childLinks). BFS with a visited set, so shared subassemblies terminate.
 */
export async function wouldCreateBomCycle(parentId: string, childId: string): Promise<boolean> {
  if (parentId === childId) return true;
  const visited = new Set<string>([childId]);
  let frontier = [childId];

  while (frontier.length > 0) {
    const edges = await prisma.vaultBomEdge.findMany({
      where: { parentId: { in: frontier } },
      select: { childId: true },
    });
    const next: string[] = [];
    for (const edge of edges) {
      if (edge.childId === parentId) return true;
      if (!visited.has(edge.childId)) {
        visited.add(edge.childId);
        next.push(edge.childId);
      }
    }
    frontier = next;
  }
  return false;
}
