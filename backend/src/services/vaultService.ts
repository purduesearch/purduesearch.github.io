import { prisma } from "../db/prisma.js";
import { createDriveFolder, extractFileId, getServiceAccountEmail } from "./driveService.js";

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
 * Ensure the project's "Constellation Vault" Drive subfolder exists, creating it
 * (under the project's linked Drive folder) on first use. Returns the folder id,
 * or a VaultHealth describing why it couldn't be resolved.
 */
export async function ensureVaultFolder(
  projectId: string
): Promise<{ folderId: string } | { error: VaultHealth }> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project || !project.driveLink) {
    return { error: { status: "no-link" } };
  }

  const linkedFolderId = extractFileId(project.driveLink);
  const isFolderUrl = /\/folders\//.test(project.driveLink);
  if (!linkedFolderId || !isFolderUrl) {
    return { error: { status: "not-folder" } };
  }

  if (project.vaultFolderId) {
    return { folderId: project.vaultFolderId };
  }

  const created = await createDriveFolder("Constellation Vault", linkedFolderId);
  if (!created) {
    return { error: { status: "not-shared", serviceAccountEmail: getServiceAccountEmail() } };
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
