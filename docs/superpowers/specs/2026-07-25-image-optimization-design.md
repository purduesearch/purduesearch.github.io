# Image Optimization — Design

**Date:** 2026-07-25
**Status:** Approved
**Scope:** `public/**` raster images + `scripts/optimize-images.mjs` + 3 one-line `src` edits

---

## Problem

`public/` ships **196 images totalling 35.28 MB**, of which 39 exceed 250 kB. Most
are display-limited: they render into containers far narrower than their intrinsic
width. `public/about/About_Hero.webp` alone is 3,215 kB and is almost certainly the
LCP element on `/about`.

Two distinct causes, measured rather than assumed:

1. **Excess bitrate.** `About_Hero.webp` is only 2493×1164 (2.9 Mpx) yet weighs
   3,215 kB — roughly 1.1 bytes/pixel, i.e. near-lossless. Re-encoding at q75
   *with no resize at all* takes it to ~255 kB.
2. **Excess resolution.** Many files sit at full camera resolution (4032×3024)
   while rendering into `maxWidth: 720` or `maxWidth: 480` containers.

## Goals

- No single image over **250 kB**.
- Total `public/` image weight under **~8 MB**.
- No visible quality loss at the sizes images actually render.
- No content changes: same photographs, same crops, same aspect ratios.

## Non-Goals

- `srcset` / responsive variants. Once a 1920px hero costs ~200 kB, multiple
  variants add build and markup complexity for negligible gain. Explicitly dropped.
- Removing unused images. Four large files are unreferenced (see *Unreferenced
  assets*); they are optimized in place, never deleted.
- Wiring optimization into `prebuild`. Images are committed artifacts.

---

## Measurements

All figures produced with `sharp` against the real files on `main`.

### Quality knob

Encoding the same set at three qualities:

| q70 → q75 | q75 → q80 |
|---|---|
| +7% bytes | +25% bytes |

q80 costs a quarter more bytes for little visible gain; q70 saves almost nothing
over q75. **q75 for all photographic content**, no per-image tuning.

### Policy comparison

All 196 files, longest-edge cap, q75, never writing a file larger than its original:

| Policy | Total | Files > 250 kB |
|---|---|---|
| flat 1920px | 12.81 MB | 6 |
| flat 1440px | 10.13 MB | 4 |
| flat 1200px | 8.20 MB | 0 |
| **role tiers (hero 1920 / content 1100 / headshot 500)** | **7.56 MB** | 1 |
| **role tiers + art assets excluded (final)** | **8.02 MB** | 1 |

Two findings drove the choice:

- **A flat width cap cannot reach the target, and heroes are not the reason.**
  Flat 1440px still lands at 10.13 MB. The budget is consumed by the ~150-file
  tail, not by the handful of heroes.
- **Portrait images escape a width cap.** `babyPlants.webp` (3024×4032) is barely
  touched by a 1440px *width* cap. Capping the **longest edge** fixes this.

Role tiers therefore beat the 8 MB target *while keeping heroes at full 1920px*.
Flat 1200px also hits the target but would visibly soften the About hero on a
desktop display for no reason.

---

## Design

### Tier table

Sizing is by **longest edge**, preserving aspect ratio (`fit: 'inside'`), so no
layout shifts anywhere.

| Tier | Longest edge | Encoding | Applies to |
|---|---|---|---|
| `hero` | 1920 | webp q75 | full-bleed heroes and backgrounds |
| `content` | 1100 | webp q75 | in-article photos (containers are 480–720 CSS px) |
| `social` | 800 | webp q75 | `ig/` |
| `headshot` | 500 | webp q75 | `officers/`, `officers/advisors/` |
| `art` | native | webp near-lossless | `clubpm/badges/`, `outreach/companies/`, raster files in `icons/` |
| `skip` | — | untouched | `.svg`, `.gif`, animated inputs |

`content` is the default for any path not otherwise mapped.

### The `hero` tier is an explicit list, not a filename pattern

Matching `/bg|hero/i` against paths is convenient but wrong to ship — it
mis-tiers any full-bleed image whose name doesn't happen to contain those
substrings, and silently. The hero set is enumerated from the actual
`backgroundImage` / preload references in `src/` and `public/search-theme.css`:

```
Purdue_Sky.webp                        (preloaded; Blog, Contact, NotFound, BlogPost)
about/About_Hero.webp                  (preloaded; About)
analogs_bg.jpg                         (Business, second layer)
astrousa/Group_Photo_ASTRO.webp        (preloaded; AstroUSA)
bg.jpg                                 (already optimized — never-grow protects it)
bg-2.jpg                               (Home, full-width <img>)
business/buisness.webp                 (preloaded; Business)
research/2022_23/mars_mission.webp     (Research)
research/Research_Hero.webp            (preloaded; Research)
software/2023_24/SUITS/bg.webp         (Suits)
software/Meeting_SUITS.webp            (preloaded; Software)
analogs/2022/mdrs_bg.webp              (unreferenced; named as a background)
```

Any file not in this list and not in a mapped directory falls to `content`.

### The `art` tier exists for a reason

`clubpm/badges/**` (15 files, 800×800) and `outreach/companies/**` (7 sponsor
logos) are **flat-colour artwork with alpha channels**, not photographs. Lossy
webp at q75 produces visible ringing around hard edges and degrades alpha mattes;
on flat colour it can also produce a *larger* file than the source. These are
encoded near-lossless at native dimensions instead.

### `skip` is a correctness guard, not an optimization

`public/icons/` contains animated `.gif` and `.svg` files. Passing an animated GIF
through `sharp` silently flattens it to a single frame; passing an SVG rasterizes
it. Both are irreversible corruption of committed assets. The script must filter
by extension **before** any decode, not rely on the tier table.

### Format conversions

Per decision, four non-webp files convert to `.webp`:

| File | Now | Referenced from |
|---|---|---|
| `bg-2.jpg` | 2,049 kB | `src/pages/Home.jsx:669` |
| `analogs_bg.jpg` | 1,778 kB | `src/pages/Business.jsx:86` |
| `seti.jpg` | 265 kB | `src/pages/Business.jsx`, `src/pages/Home.jsx` |
| `fundraising.png` | 637 kB | *unreferenced* |

Three one-line `src` edits total. `fundraising.png` needs none. Old files are
deleted only after the `.webp` replacement is written and the reference updated.

### Per-file overrides

Two files need a size override to clear the 250 kB cap. Both are measured, not
estimated:

| File | Tier default | Override | Result | Why |
|---|---|---|---|---|
| `about/About_Hero.webp` | 1920 → 255 kB | **1800** | **231 kB** | marginally over the cap at 1920 |
| `Purdue_Sky.webp` | 1920 → 443 kB | **1280** | **216 kB** | see below |

`Purdue_Sky.webp` is the one genuine outlier in the set. It is only 1579×1200, so
the 1920 cap does not resize it at all, and it re-encodes to 443 kB — well over
the cap. It carries fine sky grain that survives at native resolution but averages
out on downscale, producing a sharp non-linear cliff:

| width | q75 |
|---|---|
| 1579 (native) | 443 kB |
| 1280 | **216 kB** |
| 1100 | 149 kB (q70) |

A 19% width reduction buys a 51% size reduction. 1280px is the knee of that curve
and is the chosen override.

### Safety rails

Three invariants, all enforced in the script:

1. **Never grow.** If the re-encode is larger than the original, keep the
   original. This is what protects the already-small tail (e.g. rank badges at
   17 kB) from regressing.
2. **Never upscale.** `withoutEnlargement: true`. `rascal.webp` (768×432) gets
   re-encoded, never stretched.
3. **Idempotent.** `scripts/optimize-images.manifest.json` records each output's
   SHA-256 and dimensions; files whose current hash matches are skipped. Without
   this a second run re-encodes already-lossy output and quietly bleeds quality
   on every invocation.

The manifest doubles as the before/after report required for verification.

---

## Implementation surface

| File | Change |
|---|---|
| `scripts/optimize-images.mjs` | new — mirrors `build-fa-subset.mjs` conventions (`.mjs`, `node:` imports, doc-header block, `--report` dry-run flag) |
| `scripts/optimize-images.manifest.json` | new — hash/dimension record, committed |
| `package.json` | `sharp` as a **devDependency**; `optimize:images` script |
| `src/pages/Home.jsx` | 2 `src` string edits (`bg-2`, `seti`) |
| `src/pages/Business.jsx` | 2 `src` string edits (`analogs_bg`, `seti`) |
| `public/**` | re-encoded assets |

Not touched: CSS, brand tokens, component logic, routing, any ClubPM behaviour.

`optimize:images` is a deliberate manual run, never part of `prebuild` — running
`sharp` over 196 files on every CI build would burn minutes to produce
byte-identical output.

---

## Unreferenced assets

Four sizable files have no reference anywhere in `src/`:

- `public/news/fundraising.png` (637 kB)
- `public/sa2tp/2023/IMG_20230812_164838.webp` (778 kB)
- `public/sa2tp/2023/IMG_20230804_145608.webp` (214 kB)
- `public/analogs/2022/mdrs_bg.webp` (214 kB)

Constraints forbid removing photographs, so these are optimized in place and
reported. Deleting them is a separate decision for the maintainer.

---

## Expected results

Measured, not estimated — each figure below came from a real `sharp` encode of the
actual file:

| Metric | Before | After |
|---|---|---|
| Total image weight | 35.28 MB | **~8.0 MB (−77%)** |
| Files > 250 kB | 39 | 0 |
| `about/About_Hero.webp` | 3,215 kB | **231 kB** (1800px override) |
| `bg-2.jpg` → `.webp` | 2,049 kB | **132 kB** |
| `analogs_bg.jpg` → `.webp` | 1,779 kB | **82 kB** |
| `babyPlants.webp` | 1,318 kB | **195 kB** |
| `business/buisness.webp` | 632 kB | **77 kB** |
| `software/Meeting_SUITS.webp` | 627 kB | **219 kB** |
| `Purdue_Sky.webp` | 521 kB | **216 kB** (1280px override) |
| `research/2022_23/mars_mission.webp` | 507 kB | **100 kB** |
| `astrousa/Group_Photo_ASTRO.webp` | 438 kB | **123 kB** |
| `news/fundraising.png` → `.webp` | 637 kB | **43 kB** |
| `officers/henry.webp` | 531 kB | **~40 kB** |

The 8.0 MB total is the corrected projection: an earlier 7.56 MB figure assumed
badges and sponsor logos could be compressed as photographs. Excluding them into
the `art` tier gives back ~0.45 MB. The target is still met.

---

## Out-of-scope defect found during design

`src/pages/Home.jsx:676` sets a parallax layer to
`backgroundImage: 'url(/bg-white.jpg)'`, but **`public/bg-white.jpg` does not
exist** — it is not in the repo at any path. This is a live 404 on the Home page
today, unrelated to image weight.

It is deliberately **not fixed here**: this spec is an asset-optimization change,
and choosing a replacement background is a content decision for the maintainer.
The implementer must report it, not silently substitute an image. (Note the
`.bg-white` *CSS class* used elsewhere in `Home.jsx`/`About.jsx` is unrelated and
perfectly fine; only line 676's URL is broken.)

---

## Verification

1. `npm run optimize:images -- --report` — review the planned per-file table
   **before** any bytes change.
2. Run for real; re-run the `git ls-tree` size listing; report before/after totals
   plus a per-file table for everything touched.
3. `npm run build` passes.
4. Confirm every image is still the same photograph at the same aspect ratio, and
   that no `.svg`/`.gif` was modified (`git status` should show none).
5. Visual spot-check at rendered sizes: About hero, Home backgrounds,
   Research/SA²TP/Software team photos, Outreach tabling shots.
6. Lighthouse mobile on `/` and `/about` — Performance and LCP, before and after.

### Verification honesty

Steps 5 and 6 cannot be self-certified by the implementing agent. Byte counts,
dimensions, and build status are machine-checkable; *"no visible degradation"* on
a photograph is not, and a Lighthouse run needs a real browser. The implementer
must produce a side-by-side contact sheet of every touched image at its rendered
size so the maintainer's visual pass is quick, and must report steps 5–6 as
**pending maintainer confirmation** rather than claiming they passed.

---

## Rollback

Assets are overwritten in place; every original is recoverable from git history
(`git checkout HEAD~1 -- public/`). The work lands on a branch, not `main`.
