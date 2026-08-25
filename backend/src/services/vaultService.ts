import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { getSessionSecret } from "../config/env.js";
import {
  createDriveFolder,
  ensureClubPmRootFolder,
  getBotAccountEmail,
  probeDriveFolder,
  type DriveFailureReason,
  type DriveFolderMeta,
  type DriveResult,
} from "./driveService.js";

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
  status: "ok" | "no-link" | "not-folder" | "not-shared" | "unauthorized" | "drive-error";
  serviceAccountEmail?: string | null;
  /** Human-readable specifics for the statuses that have them (never a token). */
  detail?: string;
};

/**
 * Map a Drive failure onto the health status the UI renders. "not-found" is
 * deliberately absent: a missing folder is never surfaced as an error, it is
 * re-provisioned (see ensureVaultFolder).
 */
export function driveFailureHealth(
  reason: DriveFailureReason,
  detail?: string
): Promise<VaultHealth> {
  return healthFromDriveFailure(reason, detail, getBotAccountEmail);
}

async function healthFromDriveFailure(
  reason: DriveFailureReason,
  detail: string | undefined,
  getBotEmail: () => Promise<string | null>
): Promise<VaultHealth> {
  if (reason === "not-connected") return { status: "no-link", detail };
  if (reason === "unauthorized") {
    return { status: "unauthorized", serviceAccountEmail: await getBotEmail(), detail };
  }
  return { status: "drive-error", detail };
}

/**
 * Health for read endpoints. Unlike the original probe-only version, this does
 * reach Drive when the project already has a folder: reporting "ok" purely
 * because a credential ROW existed is exactly how the vault kept claiming to be
 * healthy while every single check-in failed.
 */
export async function getVaultHealth(
  projectId: string,
  deps: VaultFolderDeps = realVaultFolderDeps
): Promise<VaultHealth> {
  const project = await deps.loadProject(projectId);
  if (!project) return { status: "no-link" };

  const email = await deps.getBotEmail();
  if (!email) return { status: "no-link" };

  // Nothing provisioned yet is a normal pre-first-check-in state, not an error.
  if (!project.vaultFolderId) return { status: "ok" };

  const probe = await deps.probeFolder(project.vaultFolderId);
  if (probe.ok) {
    return probe.value.trashed || !probe.value.canAddChildren
      ? { status: "ok", detail: "the vault folder will be re-created on the next check-in" }
      : { status: "ok" };
  }
  // A folder Drive can't see gets re-provisioned on the next write, so it is not
  // worth alarming anyone about here.
  if (probe.reason === "not-found") {
    return { status: "ok", detail: "the vault folder will be re-created on the next check-in" };
  }
  return healthFromDriveFailure(probe.reason, probe.detail, deps.getBotEmail);
}

/**
 * Every Drive/DB boundary ensureVaultFolder touches, injected so the decision
 * table can be tested without a database or a network (see vaultService.test.ts).
 */
export type VaultFolderDeps = {
  loadProject: (projectId: string) => Promise<{ name: string | null; vaultFolderId: string | null } | null>;
  saveFolderId: (projectId: string, folderId: string | null) => Promise<void>;
  probeFolder: (folderId: string) => Promise<DriveResult<DriveFolderMeta>>;
  createFolder: (name: string, parentId?: string) => Promise<DriveResult<{ id: string }>>;
  ensureRoot: () => Promise<string | null>;
  getBotEmail: () => Promise<string | null>;
};

export const realVaultFolderDeps: VaultFolderDeps = {
  loadProject: (projectId) =>
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, vaultFolderId: true },
    }),
  saveFolderId: async (projectId, folderId) => {
    await prisma.project.update({ where: { id: projectId }, data: { vaultFolderId: folderId } });
  },
  probeFolder: probeDriveFolder,
  createFolder: createDriveFolder,
  ensureRoot: ensureClubPmRootFolder,
  getBotEmail: getBotAccountEmail,
};

/**
 * Ensure the project has a bot-owned "CAD" Drive folder for vault files, creating
 * it on first use. The folder is created and owned by the Drive bot (as
 * "ClubPM Projects / <project> / CAD") — deliberately NOT inside the project's
 * linked Drive folder, because the drive.file scope only lets the bot touch
 * folders it created itself. The project's `driveLink` (the human-managed folder
 * shown view-only in the Files tab) is never read or mutated here. Returns the
 * folder id, or a VaultHealth describing why it couldn't be resolved.
 *
 * The cached `vaultFolderId` is VERIFIED, not trusted. drive.file grants belong
 * to an (app, account) pair, so reconnecting the Drive bot to a different Google
 * account — or rotating the OAuth client — makes every previously created folder
 * answer 404, and the cached id becomes a permanent 400 on every check-in. A
 * folder Drive says is gone is therefore re-provisioned; a folder we merely
 * couldn't reach (revoked token, Drive 5xx) is left strictly alone, because
 * re-provisioning on a transient failure would strand the real folder and start
 * a second tree.
 */
export async function ensureVaultFolder(
  projectId: string,
  deps: VaultFolderDeps = realVaultFolderDeps
): Promise<{ folderId: string } | { error: VaultHealth }> {
  const project = await deps.loadProject(projectId);
  if (!project) {
    return { error: { status: "no-link" } };
  }

  if (project.vaultFolderId) {
    const probe = await deps.probeFolder(project.vaultFolderId);
    if (probe.ok && !probe.value.trashed && probe.value.canAddChildren) {
      return { folderId: project.vaultFolderId };
    }
    if (!probe.ok && probe.reason !== "not-found") {
      // Says nothing about the folder — only about the token or the network.
      return { error: await healthFromDriveFailure(probe.reason, probe.detail, deps.getBotEmail) };
    }
    // Definitively unusable. Clear it before re-provisioning so that a failure
    // partway through doesn't leave a known-dead id to be probed forever.
    console.warn(
      `[vault] project ${projectId}: cached vaultFolderId ${project.vaultFolderId} is unusable ` +
        `(${probe.ok ? (probe.value.trashed ? "trashed" : "read-only") : "not found"}) — re-provisioning`
    );
    await deps.saveFolderId(projectId, null);
  }

  // The bot must be connected before it can create/own the folder. Null means
  // no Drive bot account is connected yet.
  const rootId = await deps.ensureRoot();
  if (!rootId) {
    return { error: { status: "no-link" } };
  }

  // A per-project container keeps the bot's Drive tidy; the leaf is the "CAD"
  // folder that actually holds vault (part) files.
  const projectFolder = await deps.createFolder(project.name || "Project", rootId);
  if (!projectFolder.ok) {
    return { error: await healthFromDriveFailure(projectFolder.reason, projectFolder.detail, deps.getBotEmail) };
  }
  const created = await deps.createFolder("CAD", projectFolder.value.id);
  if (!created.ok) {
    return { error: await healthFromDriveFailure(created.reason, created.detail, deps.getBotEmail) };
  }

  await deps.saveFolderId(projectId, created.value.id);

  return { folderId: created.value.id };
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
