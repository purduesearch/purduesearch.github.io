# Image Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `public/` image weight from 35.28 MB to ~8.0 MB with no file over 250 kB and no visible quality loss at rendered sizes.

**Architecture:** A one-off Node script (`scripts/optimize-images.mjs`) walks `public/`, resolves each file to a sizing tier via a pure, unit-tested config module, and re-encodes with `sharp` to webp. Three invariants — never grow, never upscale, idempotent via a committed hash manifest — make repeated runs safe. Sizing is by **longest edge** with `fit: 'inside'`, so aspect ratios and therefore layout are untouched.

**Tech Stack:** Node 24, `sharp` (new devDependency), `node:test` (built in — no new test dependency), existing `.mjs` script conventions from `scripts/build-fa-subset.mjs`.

**Spec:** `docs/superpowers/specs/2026-07-25-image-optimization-design.md` — read it first.

## Global Constraints

- **Branch:** `perf/optimize-images`. Never commit to `main`.
- **No content changes.** Same photographs, same crops, same aspect ratios. Never substitute or delete a photograph.
- **CSS and brand tokens untouched.** No edits to `public/search-theme.css`, `public/clubpm-theme.css`, or `src/index.css`.
- **`sharp` must be a `devDependency`**, never a `dependency`.
- **`npm run build` must pass** before the final commit.
- **Quality: webp q75** for photographic content; **near-lossless** for the `art` tier. No per-image quality tuning beyond the two documented edge overrides.
- **Never run the optimizer as part of `prebuild`.** It stays a manual `npm run optimize:images`.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Do not fix the `bg-white.jpg` 404** (`src/pages/Home.jsx:676`). Report it only. See spec, "Out-of-scope defect".

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/optimize-images.config.mjs` | **Create.** Pure tier resolution — tier table, hero list, overrides, extension whitelist. No `sharp` import, so tests run instantly. |
| `scripts/optimize-images.test.mjs` | **Create.** `node:test` unit tests for tier resolution and the never-grow rule. |
| `scripts/optimize-images.mjs` | **Create.** The runner: walk, encode, safety rails, manifest, `--report` mode. Imports `sharp` + the config module. |
| `scripts/optimize-images.manifest.json` | **Generated + committed.** Per-file hash/dimensions/bytes. Provides idempotency and the before/after report. |
| `package.json` | **Modify.** Add `sharp` devDependency, `optimize:images` and `test:scripts` scripts. |
| `src/pages/Home.jsx` | **Modify.** 2 `src` string edits (`bg-2`, `seti`). |
| `src/pages/Business.jsx` | **Modify.** 2 `src` string edits (`analogs_bg`, `seti`). |

The config/runner split exists so the decision logic — the part that can silently mis-tier a file — is testable without loading `sharp` or touching the filesystem.

---

### Task 1: Tier resolution config module

**Files:**
- Create: `scripts/optimize-images.config.mjs`
- Test: `scripts/optimize-images.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `resolveTier(relPath: string) => { mode: 'photo'|'art'|'skip', tier?: string, maxEdge?: number|null, reason?: string }`, plus exported constants `TIERS`, `HERO_FILES`, `EDGE_OVERRIDES`, `CONVERT_TO_WEBP`, `RASTER_EXT`. `relPath` is always POSIX-style and relative to `public/` (e.g. `about/About_Hero.webp`).
- Consumes: nothing.

- [ ] **Step 1: Add the `test:scripts` npm script**

In `package.json`, add to `"scripts"`:

```json
"test:scripts": "node --test scripts/optimize-images.test.mjs"
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/optimize-images.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTier, TIERS, CONVERT_TO_WEBP } from './optimize-images.config.mjs';

test('hero files get the 1920px tier', () => {
  const r = resolveTier('business/buisness.webp');
  assert.equal(r.mode, 'photo');
  assert.equal(r.tier, 'hero');
  assert.equal(r.maxEdge, 1920);
});

test('unlisted photos fall back to the content tier', () => {
  const r = resolveTier('research/group_work.webp');
  assert.equal(r.tier, 'content');
  assert.equal(r.maxEdge, 1100);
});

test('officer headshots get the 500px tier', () => {
  assert.equal(resolveTier('officers/henry.webp').maxEdge, 500);
  assert.equal(resolveTier('officers/advisors/bera.webp').maxEdge, 500);
});

test('instagram images get the 800px social tier', () => {
  assert.equal(resolveTier('ig/Voss_ig.webp').maxEdge, 800);
});

test('per-file edge overrides beat the tier default', () => {
  assert.equal(resolveTier('about/About_Hero.webp').maxEdge, 1800);
  assert.equal(resolveTier('Purdue_Sky.webp').maxEdge, 1280);
});

test('alpha artwork is routed to the art tier at native size', () => {
  for (const p of [
    'clubpm/badges/rank/cadet.webp',
    'outreach/companies/nasa.webp',
  ]) {
    const r = resolveTier(p);
    assert.equal(r.mode, 'art', `${p} should be art`);
    assert.equal(r.maxEdge, null);
  }
});

test('svg and gif are skipped before any decode', () => {
  for (const p of ['icons/atom-solid.svg', 'icons/animat-checkmark.gif']) {
    assert.equal(resolveTier(p).mode, 'skip', `${p} must be skipped`);
  }
});

test('unknown formats are skipped rather than mangled', () => {
  assert.equal(resolveTier('foo/bar.avif').mode, 'skip');
  assert.equal(resolveTier('foo/README').mode, 'skip');
});

test('art tier wins over the extension whitelist for badges', () => {
  assert.equal(resolveTier('clubpm/badges/mythic/ethereal_chair.webp').mode, 'art');
});

test('backslash paths are normalised', () => {
  assert.equal(resolveTier('officers\\henry.webp').maxEdge, 500);
});

test('the four conversion targets are registered', () => {
  for (const p of ['bg-2.jpg', 'analogs_bg.jpg', 'news/seti.jpg', 'news/fundraising.png']) {
    assert.ok(CONVERT_TO_WEBP.has(p), `${p} should convert`);
  }
});

test('tier table matches the approved spec', () => {
  assert.deepEqual(TIERS, { hero: 1920, content: 1100, social: 800, headshot: 500 });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:scripts`
Expected: FAIL — `Cannot find module './optimize-images.config.mjs'`

- [ ] **Step 4: Write the config module**

Create `scripts/optimize-images.config.mjs`:

```js
/**
 * Sizing policy for scripts/optimize-images.mjs.
 *
 * Kept free of `sharp` and filesystem access so the decision logic — the part
 * that can silently mis-tier a file — is unit-testable on its own.
 *
 * See docs/superpowers/specs/2026-07-25-image-optimization-design.md
 */

/** Longest-edge cap in px, by tier. */
export const TIERS = { hero: 1920, content: 1100, social: 800, headshot: 500 };

/**
 * Full-bleed heroes and backgrounds, enumerated from the actual
 * `backgroundImage` / preload references in src/ and public/search-theme.css.
 * An explicit list rather than a /bg|hero/i pattern: a pattern silently
 * mis-tiers any full-bleed image whose filename lacks those substrings.
 */
export const HERO_FILES = new Set([
  'Purdue_Sky.webp',
  'about/About_Hero.webp',
  'analogs_bg.jpg',
  'astrousa/Group_Photo_ASTRO.webp',
  'bg.jpg',
  'bg-2.jpg',
  'business/buisness.webp',
  'research/2022_23/mars_mission.webp',
  'research/Research_Hero.webp',
  'software/2023_24/SUITS/bg.webp',
  'software/Meeting_SUITS.webp',
  'analogs/2022/mdrs_bg.webp',
]);

/** Measured exceptions that need a tighter cap to clear the 250 kB budget. */
export const EDGE_OVERRIDES = {
  'about/About_Hero.webp': 1800, // 1920 lands at 255 kB; 1800 -> 231 kB
  'Purdue_Sky.webp': 1280,       // native 1579px re-encodes to 443 kB; 1280 -> 216 kB
};

/**
 * Flat-colour artwork with alpha. Lossy webp rings around hard edges and
 * degrades alpha mattes here, and on flat colour can exceed the source size.
 * Encoded near-lossless at native dimensions instead.
 */
export const ART_DIRS = ['clubpm/badges/', 'outreach/companies/', 'icons/'];
export const HEADSHOT_DIRS = ['officers/'];
export const SOCIAL_DIRS = ['ig/'];

/** Whitelist, not a blocklist: an unrecognised format is skipped, never mangled. */
export const RASTER_EXT = new Set(['.webp', '.jpg', '.jpeg', '.png']);

/** Re-encoded to .webp under a new extension; references updated in src/. */
export const CONVERT_TO_WEBP = new Set([
  'bg-2.jpg',
  'analogs_bg.jpg',
  'news/seti.jpg',
  'news/fundraising.png',
]);

/** Encoder settings. */
export const PHOTO_WEBP = { quality: 75, effort: 6 };
export const ART_WEBP = { nearLossless: true, quality: 80, effort: 6 };

/**
 * @param {string} relPath path relative to public/, any separator style
 * @returns {{mode:'photo'|'art'|'skip', tier?:string, maxEdge?:number|null, reason?:string}}
 */
export function resolveTier(relPath) {
  const p = relPath.replace(/\\/g, '/');
  const dot = p.lastIndexOf('.');
  const ext = dot === -1 ? '' : p.slice(dot).toLowerCase();

  // Extension gate runs first: sharp flattens animated GIFs to a single frame
  // and rasterises SVGs, both irreversible on committed assets.
  if (!RASTER_EXT.has(ext)) {
    return { mode: 'skip', reason: `non-raster extension "${ext || '(none)'}"` };
  }

  if (ART_DIRS.some((d) => p.startsWith(d))) {
    return { mode: 'art', tier: 'art', maxEdge: null };
  }

  let tier;
  if (HEADSHOT_DIRS.some((d) => p.startsWith(d))) tier = 'headshot';
  else if (SOCIAL_DIRS.some((d) => p.startsWith(d))) tier = 'social';
  else if (HERO_FILES.has(p)) tier = 'hero';
  else tier = 'content';

  return { mode: 'photo', tier, maxEdge: EDGE_OVERRIDES[p] ?? TIERS[tier] };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:scripts`
Expected: PASS — 12 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add scripts/optimize-images.config.mjs scripts/optimize-images.test.mjs package.json
git commit -m "$(cat <<'EOF'
perf(images): add tier resolution policy for the image optimizer

Pure, dependency-free module so the sizing decisions are unit-testable
without loading sharp. Hero set is an explicit list rather than a filename
pattern, and the extension check is a whitelist so an unrecognised format is
skipped rather than mangled.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The optimizer runner

**Files:**
- Create: `scripts/optimize-images.mjs`
- Modify: `scripts/optimize-images.test.mjs` (append safety-rail tests)
- Modify: `package.json`

**Interfaces:**
- Consumes: `resolveTier`, `PHOTO_WEBP`, `ART_WEBP`, `CONVERT_TO_WEBP` from Task 1.
- Produces: `chooseOutput(originalBuf, encodedBuf) => { buf: Buffer, kept: 'original'|'encoded' }` (exported from `optimize-images.mjs` for testing), and the CLI `node scripts/optimize-images.mjs [--report]`.

- [ ] **Step 1: Install sharp as a devDependency**

Run: `npm install --save-dev sharp`

Then confirm placement — it must be under `devDependencies`, not `dependencies`:

Run: `node -e "const p=require('./package.json'); console.log('dev:', !!p.devDependencies.sharp, '| prod:', !!(p.dependencies||{}).sharp)"`
Expected: `dev: true | prod: false`

- [ ] **Step 2: Add the `optimize:images` npm script**

In `package.json`, add to `"scripts"`:

```json
"optimize:images": "node scripts/optimize-images.mjs"
```

Do **not** add it to `prebuild`.

- [ ] **Step 3: Write the failing safety-rail tests**

Append to `scripts/optimize-images.test.mjs`:

```js
import { chooseOutput } from './optimize-images.mjs';

test('never-grow: a larger re-encode is discarded', () => {
  const original = Buffer.alloc(100);
  const encoded = Buffer.alloc(140);
  const r = chooseOutput(original, encoded);
  assert.equal(r.kept, 'original');
  assert.equal(r.buf.length, 100);
});

test('never-grow: a smaller re-encode is kept', () => {
  const r = chooseOutput(Buffer.alloc(100), Buffer.alloc(40));
  assert.equal(r.kept, 'encoded');
  assert.equal(r.buf.length, 40);
});

test('never-grow: an equal-size re-encode keeps the original', () => {
  const r = chooseOutput(Buffer.alloc(100), Buffer.alloc(100));
  assert.equal(r.kept, 'original');
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:scripts`
Expected: FAIL — `Cannot find module './optimize-images.mjs'`

- [ ] **Step 5: Write the runner**

Create `scripts/optimize-images.mjs`:

```js
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
  resolveTier, CONVERT_TO_WEBP, PHOTO_WEBP, ART_WEBP,
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

    let pipeline = sharp(abs, { animated: false });
    if (decision.maxEdge) {
      pipeline = pipeline.resize({
        width: decision.maxEdge,
        height: decision.maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const encoded = await pipeline
      .webp(decision.mode === 'art' ? ART_WEBP : PHOTO_WEBP)
      .toBuffer();

    const { buf, kept } = chooseOutput(original, encoded);
    const converts = CONVERT_TO_WEBP.has(rel) && kept === 'encoded';
    const outRel = converts ? rel.replace(/\.(jpe?g|png)$/i, '.webp') : rel;
    const outAbs = path.join(PUBLIC, outRel);
    const meta = await sharp(buf).metadata();

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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:scripts`
Expected: PASS — 15 tests, 0 failures. The import of `optimize-images.mjs` must not trigger a full run; if the whole optimizer executes during the test, the direct-invocation guard at the bottom is wrong.

- [ ] **Step 7: Commit**

```bash
git add scripts/optimize-images.mjs scripts/optimize-images.test.mjs package.json package-lock.json
git commit -m "$(cat <<'EOF'
perf(images): add the image optimizer runner

Walks public/, re-encodes to webp against the tier policy, and records a hash
manifest. Never grows a file, never upscales, and skips anything whose hash
matches the manifest so a second run cannot re-compress lossy output.

Not wired into prebuild: images are committed artifacts, so running sharp over
196 files per build would burn CI time to produce identical bytes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Dry run and policy review

**Files:** none modified — this task is a gate.

**Interfaces:**
- Consumes: the CLI from Task 2.

- [ ] **Step 1: Capture the before state**

```bash
git ls-tree -r HEAD -- public | awk '{print $3, $4}' \
  | grep -Ei '\.(webp|jpg|jpeg|png)$' \
  | while read sha path; do echo "$(( $(git cat-file -s $sha) / 1024 )) kB $path"; done \
  | sort -rn > /tmp/images-before.txt
awk '{s+=$1} END {print s" kB across "NR" files"}' /tmp/images-before.txt
```

Expected: `35284 kB across 196 files` (or close, if `main` has moved).

- [ ] **Step 2: Run the dry run**

Run: `npm run optimize:images -- --report`

- [ ] **Step 3: Verify the dry run against the spec's predictions**

Check each of these against the printed summary. **Stop and report if any fails** — do not proceed to a real run:

- Total lands at **~8.0 MB** (accept 7.5–8.5 MB).
- **`files over 250 kB: 0`.**
- `about/About_Hero.webp` → ~231 kB, `Purdue_Sky.webp` → ~216 kB, `bg-2.jpg` → ~132 kB, `analogs_bg.jpg` → ~82 kB.
- `skipped (non-raster)` is **≥ 4** — the `.svg` and `.gif` files in `public/icons/`.
- Every `clubpm/badges/**` row shows tier `art`.
- No row's `dims` implies a changed aspect ratio versus its source.
- Small already-optimized files (e.g. `clubpm/badges/rank/*.webp` at ~17 kB) show `(kept)` rather than growing.

- [ ] **Step 4: Confirm nothing was written**

Run: `git status --short`
Expected: **empty output.** `--report` must not touch the working tree. If files changed, the dry-run guard is broken — revert with `git checkout -- public/` and fix Task 2 before continuing.

---

### Task 4: Optimize in place (no format changes)

**Files:**
- Modify: `public/**` (in-place re-encodes)
- Create: `scripts/optimize-images.manifest.json`

This task deliberately leaves the four conversion files for Task 5, so the working tree is never in a state where a referenced image is missing.

- [ ] **Step 1: Run the optimizer**

Run: `npm run optimize:images`

- [ ] **Step 2: Verify the aspect ratio of every touched image is unchanged**

```bash
node -e "
const m=require('./scripts/optimize-images.manifest.json');
const bad=Object.entries(m).filter(([k,v])=>!v.width||!v.height);
console.log('entries:',Object.keys(m).length,'| missing dims:',bad.length);
console.log('over 250kB:',Object.entries(m).filter(([k,v])=>v.bytes>256000).map(([k])=>k));
"
```

Expected: `missing dims: 0` and `over 250kB: []`.

- [ ] **Step 3: Confirm no SVG or GIF was modified**

Run: `git status --porcelain public | grep -Ei '\.(svg|gif)$' || echo "clean — no svg/gif touched"`
Expected: `clean — no svg/gif touched`

- [ ] **Step 4: Confirm the conversion files are still untouched**

Run: `git status --porcelain public | grep -E 'bg-2\.jpg|analogs_bg\.jpg|seti\.jpg|fundraising\.png' || echo "conversions deferred to Task 5"`

If these show as modified/deleted, Task 5's edits must land in the **same** commit as this one to avoid a broken tree. Otherwise proceed.

- [ ] **Step 5: Verify idempotency — the whole point of the manifest**

Run: `npm run optimize:images`
Expected: the summary reports `processed 0` (or only the conversion files) and `unchanged` equal to the previously processed count. Then:

Run: `git status --porcelain public | wc -l`
Expected: the **same** count as before this second run. A second run must not produce new changes. If it does, the manifest gate is broken — stop and fix.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add public scripts/optimize-images.manifest.json
git commit -m "$(cat <<'EOF'
perf(images): re-encode public/ images to the tier size budget

Filenames, formats, crops, and aspect ratios are unchanged, so no markup or
CSS changes are needed. Alpha artwork (badges, sponsor logos) is encoded
near-lossless at native size rather than compressed as photographs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Format conversions and reference updates

**Files:**
- Modify: `public/bg-2.jpg` → `public/bg-2.webp`, `public/analogs_bg.jpg` → `public/analogs_bg.webp`, `public/news/seti.jpg` → `public/news/seti.webp`, `public/news/fundraising.png` → `public/news/fundraising.webp`
- Modify: `src/pages/Home.jsx`
- Modify: `src/pages/Business.jsx`

Assets and references change in **one commit** so the tree is never broken.

- [ ] **Step 1: Confirm the conversions happened on disk**

Run: `ls public/bg-2.* public/analogs_bg.* public/news/seti.* public/news/fundraising.*`
Expected: only `.webp` variants. If `.jpg`/`.png` remain, Task 4's run did not reach them — re-run `npm run optimize:images`.

- [ ] **Step 2: Find every reference that needs updating**

```bash
grep -rn "bg-2\.jpg\|analogs_bg\.jpg\|seti\.jpg\|fundraising\.png" src public/*.css public/index.html
```

Expected matches (verified during design):
- `src/pages/Home.jsx:669` — `src="/bg-2.jpg"`
- `src/pages/Business.jsx:86` — `url(/analogs_bg.jpg)`
- `seti.jpg` in both `src/pages/Home.jsx` and `src/pages/Business.jsx`
- `fundraising.png` — no matches (unreferenced)

**If the grep returns any file not in this list, update it too** and note it in the commit body.

- [ ] **Step 3: Update the references**

Change each matched string's extension to `.webp`. For example, in `src/pages/Home.jsx:669`:

```jsx
<img loading="lazy" src="/bg-2.webp" alt="SEARCH members at the station" />
```

and in `src/pages/Business.jsx:86`:

```jsx
style={{ backgroundImage: 'url(/business/buisness.webp), url(/analogs_bg.webp)' }}
```

Change **only** the extension. Do not alter `alt` text, styles, `loading` attributes, or surrounding markup.

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -rn "bg-2\.jpg\|analogs_bg\.jpg\|seti\.jpg\|fundraising\.png" src public/*.css public/index.html || echo "no stale references"`
Expected: `no stale references`

- [ ] **Step 5: Verify every referenced image actually exists**

This catches both stale references and the pre-existing `bg-white.jpg` defect:

```bash
grep -rhoE "(src=\"|url\()/[A-Za-z0-9_./-]+\.(webp|jpg|jpeg|png)" src public/search-theme.css \
  | sed -E 's/^(src="|url\()//' | sort -u \
  | while read p; do [ -f "public$p" ] || echo "MISSING: $p"; done
```

Expected: exactly one line — `MISSING: /bg-white.jpg`. That is the known pre-existing defect; **do not fix it**. Any other `MISSING` line is a regression from Step 3 and must be corrected.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add public src/pages/Home.jsx src/pages/Business.jsx scripts/optimize-images.manifest.json
git commit -m "$(cat <<'EOF'
perf(images): convert four remaining jpg/png assets to webp

bg-2, analogs_bg, and seti move to webp with their src references updated in
Home.jsx and Business.jsx; fundraising.png is unreferenced so it converts with
no markup change. Assets and references land together so the tree is never
left pointing at a missing file.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Verification and reporting

**Files:**
- Create: `<scratchpad>/contact-sheet.html` (throwaway — **not** committed)

- [ ] **Step 1: Produce the after listing and the totals**

```bash
git ls-tree -r HEAD -- public | awk '{print $3, $4}' \
  | grep -Ei '\.(webp|jpg|jpeg|png)$' \
  | while read sha path; do echo "$(( $(git cat-file -s $sha) / 1024 )) kB $path"; done \
  | sort -rn > /tmp/images-after.txt
echo "BEFORE:"; awk '{s+=$1} END {print "  "s" kB across "NR" files"}' /tmp/images-before.txt
echo "AFTER:";  awk '{s+=$1} END {print "  "s" kB across "NR" files"}' /tmp/images-after.txt
echo "STILL OVER 250kB:"; awk '$1>250' /tmp/images-after.txt
```

Expected: after ≈ 8,200 kB across 196 files; `STILL OVER 250kB` prints nothing.

- [ ] **Step 2: Build a before/after contact sheet for the visual pass**

Write to the scratchpad (not the repo). It pulls the originals from git so both versions can be seen side by side at rendered size:

```bash
mkdir -p /tmp/img-before
node -e "
const {execSync}=require('child_process');const fs=require('fs');
const m=require('./scripts/optimize-images.manifest.json');
const rows=Object.entries(m).filter(([k,v])=>v.sourceBytes>150*1024)
  .sort((a,b)=>b[1].sourceBytes-a[1].sourceBytes);
let h='<style>body{font:14px system-ui;background:#111;color:#eee}div{margin:24px 0;border-bottom:1px solid #333}img{max-width:520px;vertical-align:top}</style>';
for(const [p,v] of rows){
  const src=p.replace(/\.webp$/,'');
  let orig=p;
  try{execSync('git show HEAD~3:public/'+p+' > /tmp/img-before/'+p.replace(/\//g,'_'),{stdio:'ignore'});}catch(e){}
  h+='<div><h3>'+p+' — '+Math.round(v.sourceBytes/1024)+'kB → '+Math.round(v.bytes/1024)+'kB ('+v.width+'x'+v.height+')</h3>'
   +'<img src=\"/tmp/img-before/'+p.replace(/\//g,'_')+'\"><img src=\"public/'+p+'\"></div>';
}
fs.writeFileSync('/tmp/contact-sheet.html',h);
console.log('wrote /tmp/contact-sheet.html with '+rows.length+' pairs');
"
```

Adjust `HEAD~3` to whichever commit precedes Task 4 if the commit count differs.

- [ ] **Step 3: Report honestly, and do not self-certify what you cannot check**

Post a summary containing:
- Before/after totals and the count of files over 250 kB.
- A per-file table for everything touched (from the manifest).
- Confirmation that `npm run build` and `npm run test:scripts` pass, with the actual output.
- The `bg-white.jpg` 404 at `src/pages/Home.jsx:676`, flagged as pre-existing and unfixed.
- The four unreferenced images (`news/fundraising.webp`, `sa2tp/2023/IMG_20230812_164838.webp`, `sa2tp/2023/IMG_20230804_145608.webp`, `analogs/2022/mdrs_bg.webp`), flagged for the maintainer's decision.

Then state plainly that **two verification steps remain open and are the maintainer's to confirm**, per the spec's "Verification honesty" section:

1. **Visual no-degradation check** — point them at the contact sheet. Do not claim images "look fine"; you cannot see them.
2. **Lighthouse mobile on `/` and `/about`** — Performance and LCP, before and after. Do not report Lighthouse numbers unless a real run produced them. If no headless browser is available, say so and leave the row blank rather than estimating.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin perf/optimize-images
```

Do not merge to `main` without the maintainer's approval.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Tier table | 1 |
| Explicit hero list | 1 |
| `art` tier for alpha artwork | 1 (policy), 3 (verified) |
| `skip` guard for svg/gif | 1 (policy), 4 step 3 (verified) |
| Per-file overrides (About_Hero, Purdue_Sky) | 1 (policy), 3 step 3 (verified) |
| Format conversions + reference updates | 5 |
| Never grow / never upscale / idempotent | 2 (implemented + tested), 4 step 5 (idempotency proven) |
| Script conventions mirroring build-fa-subset.mjs | 2 |
| `sharp` as devDependency | 2 step 1 (asserted) |
| Not wired into prebuild | Global constraints, 2 step 2 |
| Unreferenced assets reported not deleted | 6 step 3 |
| `bg-white.jpg` reported not fixed | Global constraints, 5 step 5, 6 step 3 |
| Verification honesty | 6 step 3 |
| Rollback | branch-only; no task needed |

No gaps.

**Placeholder scan:** No TBD/TODO. Every code step carries runnable code; every verification step carries a command and its expected output.

**Type consistency:** `resolveTier` returns `{mode, tier, maxEdge, reason}` in Task 1 and is destructured as `decision.mode` / `decision.maxEdge` / `decision.tier` in Task 2 — consistent. `chooseOutput` returns `{buf, kept}` in both its test (Task 2 step 3) and its implementation and call site (Task 2 step 5). `CONVERT_TO_WEBP`, `PHOTO_WEBP`, `ART_WEBP` are exported in Task 1 and imported by exactly those names in Task 2.
