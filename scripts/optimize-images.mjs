/**
 * Re-encodes the raster images in public/ to a size budget.
 *
 *   node scripts/optimize-images.mjs [--report]
 *
 * --report performs a full dry run: every file is decoded and encoded and the
 * resulting table is printed, but nothing is written. Always run it first.
 *
 * Outputs:
 *   public/**                            re-encoded in place
 *   scripts/optimize-images.manifest.json hash/dimension record
 *
 * Three invariants make repeat runs safe:
 *   never grow    — a re-encode larger than the source is discarded
 *   never upscale — withoutEnlargement, so small sources are only re-encoded
 *   idempotent    — a file whose hash matches the manifest is skipped, so a
 *                   second run cannot re-encode already-lossy output
 *
 * Sizing is by longest edge with fit:'inside', so aspect ratios — and
 * therefore page layout — are unchanged.
 *
 * See docs/superpowers/specs/2026-07-25-image-optimization-design.md
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  resolveTier, CONVERT_TO_WEBP, PHOTO_WEBP, ART_WEBP, ANIMATED_WEBP, ANIMATED_MAX_WIDTH,
} from './optimize-images.config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const PUBLIC = path.join(REPO, 'public');
const MANIFEST = path.join(HERE, 'optimize-images.manifest.json');
const REPORT_ONLY = process.argv.includes('--report');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const kb = (n) => Math.round(n / 1024);

/** Discard a re-encode that is not smaller than its source. */
export function chooseOutput(originalBuf, encodedBuf) {
  return encodedBuf.length < originalBuf.length
    ? { buf: encodedBuf, kept: 'encoded' }
    : { buf: originalBuf, kept: 'original' };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

async function main() {
  const manifest = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    : {};
  const next = {};
  const rows = [];
  let before = 0, after = 0, skipped = 0, unchanged = 0;

  for (const abs of walk(PUBLIC)) {
    const rel = path.relative(PUBLIC, abs).split(path.sep).join('/');
    const original = fs.readFileSync(abs);
    const decision = resolveTier(rel);

    if (decision.mode === 'skip') { skipped++; continue; }

    before += original.length;

    // Idempotency gate: this exact output was produced by a previous run.
    if (manifest[rel] && manifest[rel].sha256 === sha(original)) {
      after += original.length;
      unchanged++;
      next[rel] = manifest[rel];
      continue;
    }

    // Decode from the buffer, not the path: libvips keeps a handle on a file
    // input, and on Windows the in-place writeFileSync below then fails with
    // UNKNOWN/EBUSY because the source is still open.
    const isAnimated = decision.mode === 'animated';
    let pipeline = sharp(original, { animated: isAnimated });
    if (isAnimated) {
      // Width only — see ANIMATED_MAX_WIDTH: an animated buffer is a vertical
      // filmstrip, so a height cap would squash every frame.
      pipeline = pipeline.resize({ width: ANIMATED_MAX_WIDTH, withoutEnlargement: true });
    } else if (decision.maxEdge) {
      pipeline = pipeline.resize({
        width: decision.maxEdge,
        height: decision.maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    let encoderOpts = PHOTO_WEBP;
    if (decision.mode === 'art') encoderOpts = ART_WEBP;
    else if (isAnimated) encoderOpts = ANIMATED_WEBP;
    const encoded = await pipeline.webp(encoderOpts).toBuffer();

    const { buf, kept } = chooseOutput(original, encoded);
    // ANIMATED entries convert too — a .gif has to become a .webp to be worth
    // encoding at all — so they take the same rename path as CONVERT_TO_WEBP.
    const converts =
      (CONVERT_TO_WEBP.has(rel) || (isAnimated && rel.endsWith('.gif'))) && kept === 'encoded';
    const outRel = converts ? rel.replace(/\.(jpe?g|png|gif)$/i, '.webp') : rel;
    const outAbs = path.join(PUBLIC, outRel);
    const meta = await sharp(buf, { animated: isAnimated }).metadata();

    after += buf.length;
    rows.push({
      rel, outRel, tier: decision.tier, kept, converts,
      beforeKb: kb(original.length), afterKb: kb(buf.length),
      dims: `${meta.width}x${meta.height}`,
    });

    if (!REPORT_ONLY) {
      fs.writeFileSync(outAbs, buf);
      if (converts) fs.unlinkSync(abs);
    }
    next[outRel] = {
      sha256: sha(buf), bytes: buf.length,
      width: meta.width, height: meta.height,
      tier: decision.tier, sourceBytes: original.length,
    };
  }

  rows.sort((a, b) => b.beforeKb - a.beforeKb);
  const w = Math.max(...rows.map((r) => r.rel.length), 10);
  console.log(`\n${'file'.padEnd(w)}  tier      dims          before    after`);
  for (const r of rows) {
    const flag = r.converts ? ' →webp' : r.kept === 'original' ? ' (kept)' : '';
    console.log(
      `${r.rel.padEnd(w)}  ${r.tier.padEnd(8)}  ${r.dims.padEnd(12)}  ` +
      `${String(r.beforeKb).padStart(5)}kB ${String(r.afterKb).padStart(6)}kB${flag}`
    );
  }

  const over = rows.filter((r) => r.afterKb > 250);
  console.log(`\n${REPORT_ONLY ? 'DRY RUN — nothing written' : 'written'}`);
  console.log(`  processed ${rows.length}, unchanged ${unchanged}, skipped (non-raster) ${skipped}`);
  console.log(`  ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB`);
  console.log(`  files over 250 kB: ${over.length}${over.length ? ' -> ' + over.map((r) => `${r.outRel} (${r.afterKb}kB)`).join(', ') : ''}`);

  if (!REPORT_ONLY) {
    fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n');
  }
}

// Only run when invoked directly, so the test file can import chooseOutput.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
