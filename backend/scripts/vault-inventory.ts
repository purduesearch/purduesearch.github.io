// Read-only Phase 0 inventory. Run from backend: npx tsx scripts/vault-inventory.ts > vault-inventory.json
import "dotenv/config";
import { google } from "googleapis";
import { prisma } from "../src/db/prisma.js";
import { decryptSecret } from "../src/utils/crypto.js";

type FileMeta = { sizeBytes: number | null; md5: string | null; error?: string };
const metadata = new Map<string, Promise<FileMeta>>();
const gib = 1024 ** 3;

async function main() {
  const monthlyDownloads = Number(process.env.VAULT_EST_MONTHLY_DOWNLOADS ?? "2");
  const monthlyNewGib = Number(process.env.VAULT_EST_MONTHLY_NEW_GIB ?? "0");
  if (![monthlyDownloads, monthlyNewGib].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new Error("VAULT_EST_MONTHLY_DOWNLOADS and VAULT_EST_MONTHLY_NEW_GIB must be nonnegative numbers");
  }
  const credential = await prisma.googleDriveCredential.findUnique({ where: { id: "singleton" }, select: { refreshToken: true } });
  const refreshToken = decryptSecret(credential?.refreshToken);
  const drive = refreshToken && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET
    ? (() => {
        const oauth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI);
        oauth.setCredentials({ refresh_token: refreshToken });
        return google.drive({ version: "v3", auth: oauth });
      })()
    : null;
  const getMeta = (id: string): Promise<FileMeta> => {
    let pending = metadata.get(id);
    if (!pending) {
      pending = drive
        ? drive.files.get({ fileId: id, fields: "id,size,md5Checksum" }).then(({ data }) => ({
            sizeBytes: data.size == null ? null : Number(data.size), md5: data.md5Checksum ?? null,
          })).catch((error: unknown) => ({ sizeBytes: null, md5: null, error: String((error as { message?: string }).message ?? error) }))
        : Promise.resolve({ sizeBytes: null, md5: null, error: "Drive bot credential or OAuth client configuration unavailable" });
      metadata.set(id, pending);
    }
    return pending;
  };
  const projects = [];
  let cursor: string | undefined;
  let itemCount = 0, versionCount = 0, thumbnailCount = 0, missingSize = 0, mismatched = 0;
  const lfsObjects = new Map<string, number>();
  do {
    const batch = await prisma.vaultItem.findMany({
      take: 100, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" },
      select: { id: true, projectId: true, name: true, partNumber: true, driveFolderId: true, deletedAt: true,
        versions: { orderBy: { versionNumber: "asc" }, select: {
          id: true, versionNumber: true, driveFileId: true, thumbnailFileId: true, fileName: true,
          sizeBytes: true, checksumMd5: true, createdAt: true, revision: true, releasedAt: true,
        } },
      },
    });
    if (!batch.length) break;
    for (const item of batch) {
      itemCount++;
      const versions = [];
      for (const version of item.versions) {
        versionCount++;
        const source = await getMeta(version.driveFileId);
        const thumbnail = version.thumbnailFileId ? await getMeta(version.thumbnailFileId) : null;
        if (thumbnail) thumbnailCount++;
        if (source.sizeBytes == null) missingSize++;
        if (thumbnail && thumbnail.sizeBytes == null) missingSize++;
        const sourceMismatch = source.sizeBytes != null && version.sizeBytes != null && source.sizeBytes !== version.sizeBytes ||
          source.md5 != null && version.checksumMd5 != null && source.md5 !== version.checksumMd5;
        if (sourceMismatch) mismatched++;
        if (source.sizeBytes != null) lfsObjects.set(version.driveFileId, source.sizeBytes);
        if (thumbnail?.sizeBytes != null && version.thumbnailFileId) lfsObjects.set(version.thumbnailFileId, thumbnail.sizeBytes);
        versions.push({ ...version, sourceDrive: source, thumbnailDrive: thumbnail,
          sizeOrMd5Mismatch: Boolean(sourceMismatch) });
      }
      projects.push({ ...item, versions });
    }
    cursor = batch.at(-1)!.id;
    if (batch.length < 100) break;
  } while (true);
  const bytes = [...lfsObjects.values()].reduce((a, b) => a + b, 0);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(), readOnly: true,
    summary: { itemCount, versionCount, thumbnailCount, distinctDriveObjects: metadata.size,
      knownLfsObjectBytes: bytes, knownLfsObjectGiB: bytes / gib, missingSizeCount: missingSize,
      sourceSizeOrMd5MismatchCount: mismatched,
      estimate: { assumptions: { monthlyDownloadsPerStoredObject: monthlyDownloads, monthlyNewGiB },
        initialStorageGiB: bytes / gib, storageAfter12MonthsGiB: bytes / gib + 12 * monthlyNewGib,
        monthlyBandwidthGiB: bytes / gib * monthlyDownloads,
        firstMonthUploadPlusDownloadGiB: bytes / gib * (1 + monthlyDownloads),
        note: "Lower bound if any size is missing; excludes Git metadata, migration verification downloads, previews and additional clients. GitHub billing must be checked against the owner's current plan." },
    }, items: projects,
  }, null, 2));
  if (missingSize || mismatched) process.exitCode = 2;
}

main().catch((error) => { console.error("Vault inventory failed:", error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
