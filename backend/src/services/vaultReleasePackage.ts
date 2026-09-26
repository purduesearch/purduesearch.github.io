// Constellation Vault — deterministic assembly package writer. The package is
// a pure function of the stored manifest text: the same manifest always
// yields the same tar bytes, and every file's real bytes are checked against
// the manifest's SHA-256 and size while they stream in. A mismatch fails the
// build — it never substitutes whatever the branch holds today.

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { once } from "node:events";
import { bomCsv, packageReadme, packageRoot, sha256Hex, tarHeader, tarPadding, tarTrailer, MANIFEST_SCHEMA, type ManifestEntry, type ReleaseManifest } from "./vaultReleasePolicy.js";

export type PackageErrorCode = "MANIFEST_MISMATCH" | "MISSING_BYTES" | "HASH_MISMATCH" | "COMMIT_UNAVAILABLE" | "STORAGE_ACCESS" | "WRITE_FAILED";

export class ReleasePackageError extends Error {
  constructor(public code: PackageErrorCode, public detail: string, public entry?: Pick<ManifestEntry, "itemId" | "versionId" | "packagePath">) {
    super(`${code}: ${detail}`);
  }
}

/** Fetches one pinned entry's bytes to a local file. Must read by the pinned commit/file id, never a branch head. */
export type FetchEntry = (entry: ManifestEntry) => Promise<{ file: string; cleanup: () => Promise<void> }>;

export function parseManifest(manifestJson: string, manifestSha256: string): ReleaseManifest {
  if (sha256Hex(manifestJson) !== manifestSha256) throw new ReleasePackageError("MANIFEST_MISMATCH", "stored manifest text no longer matches its recorded SHA-256");
  const manifest = JSON.parse(manifestJson) as ReleaseManifest;
  if (manifest.schema !== MANIFEST_SCHEMA || !Array.isArray(manifest.entries)) throw new ReleasePackageError("MANIFEST_MISMATCH", "unsupported manifest schema");
  return manifest;
}

/**
 * Write the package to `outFile` (via a `.partial` sibling, renamed on
 * success). Returns the package's SHA-256 and size.
 */
export async function writeReleasePackage(manifestJson: string, manifestSha256: string, outFile: string, fetchEntry: FetchEntry): Promise<{ sha256: string; size: number }> {
  const manifest = parseManifest(manifestJson, manifestSha256);
  const root = packageRoot(manifest);
  const mtime = Math.floor(new Date(manifest.release.approvedAt).getTime() / 1000);
  const partial = `${outFile}.partial`;
  const out = createWriteStream(partial);
  const hash = createHash("sha256");
  let size = 0;
  let failed: unknown = null;
  out.on("error", (err) => { failed = err; });
  const write = async (chunk: Buffer) => {
    if (failed) throw new ReleasePackageError("WRITE_FAILED", "could not write the package file");
    hash.update(chunk);
    size += chunk.length;
    if (!out.write(chunk)) await once(out, "drain");
  };
  const writeText = async (name: string, text: string) => {
    const body = Buffer.from(text, "utf8");
    await write(tarHeader(`${root}/${name}`, body.length, mtime));
    await write(body);
    await write(tarPadding(body.length));
  };

  try {
    const sums = manifest.entries.map((e) => `${e.sha256}  ${e.packagePath}`);
    sums.push(`${manifestSha256}  manifest.json`);
    // Fixed order: text files first (sorted), then pinned files in manifest order.
    await writeText("BOM.csv", bomCsv(manifest));
    await writeText("README.txt", packageReadme(manifest, manifestSha256));
    await writeText("SHA256SUMS", sums.sort((a, b) => a.slice(66).localeCompare(b.slice(66))).join("\n") + "\n");
    await writeText("manifest.json", manifestJson);

    for (const entry of manifest.entries) {
      let fetched: { file: string; cleanup: () => Promise<void> };
      try { fetched = await fetchEntry(entry); }
      catch (error) {
        if (error instanceof ReleasePackageError) throw error;
        throw new ReleasePackageError("MISSING_BYTES", `${entry.packagePath} could not be read from storage`, entry);
      }
      try {
        await write(tarHeader(`${root}/${entry.packagePath}`, entry.sizeBytes, mtime));
        const fileHash = createHash("sha256");
        let fileSize = 0;
        for await (const chunk of createReadStream(fetched.file) as AsyncIterable<Buffer>) {
          fileSize += chunk.length;
          if (fileSize > entry.sizeBytes) break;
          fileHash.update(chunk);
          await write(chunk);
        }
        if (fileSize !== entry.sizeBytes || fileHash.digest("hex") !== entry.sha256) {
          throw new ReleasePackageError("HASH_MISMATCH", `${entry.packagePath} bytes do not match the manifest SHA-256/size`, entry);
        }
        await write(tarPadding(entry.sizeBytes));
      } finally {
        await fetched.cleanup().catch(() => undefined);
      }
    }
    await write(tarTrailer());
    out.end();
    await once(out, "finish");
    if (failed) throw new ReleasePackageError("WRITE_FAILED", "could not write the package file");
    await rename(partial, outFile);
    return { sha256: hash.digest("hex"), size };
  } catch (error) {
    out.destroy();
    await rm(partial, { force: true }).catch(() => undefined);
    throw error;
  }
}
