# Perf task 3 — Optimize the image library

> Paste this whole file as the opening prompt of a new session.

## Context

`purduesearch.github.io` is a static React 19 (CRA) site on GitHub Pages. Read
`CLAUDE.md` first. Images in `public/` are served as-is at their committed size.

Verified against `main`: **196 images totalling ~35 MB**, of which **34 exceed
300 kB**. The worst offenders:

| Size | File |
|------|------|
| 3,215 kB | `public/about/About_Hero.webp` |
| 2,049 kB | `public/bg-2.jpg` |
| 1,778 kB | `public/analogs_bg.jpg` |
| 1,318 kB | `public/astrousa/babyPlants.webp` |
| 1,040 kB | `public/bg.jpg` |
| 1,009 kB | `public/outreach/Tabling_Outreach.webp` |
| 986 kB | `public/sa2tp/2023/IMG_0983.webp` |
| 919 kB | `public/research/group_work.webp` |
| 842 kB | `public/software/Win_Photo_Suits.webp` |
| 842 kB | `public/research/2022_23/Team_Photo.webp` |

Reproduce the full list yourself:

```
git ls-tree -r main -- public | awk '{print $3, $4}' | grep -Ei '\.(webp|jpg|jpeg|png)$' \
  | while read sha path; do echo "$(( $(git cat-file -s $sha) / 1024 )) kB $path"; done | sort -rn
```

Most of these are display-limited: they render into containers far narrower than
their intrinsic pixel width, so the extra resolution is pure waste. Several are
`.webp` already but were exported at full camera resolution.

## Goal

Cut total image weight hard (target: no single image over ~250 kB, total under
~8 MB) with **no visible quality loss at the sizes they actually render**.

## Approach

1. **Measure intrinsic vs rendered size.** For the top ~34 files, find where each
   is referenced (`rg -n "About_Hero" src`) and what container width it renders
   into. Hero/background images rarely need more than 1920px wide; card and
   thumbnail images often need ≤800px.
2. **Resize then recompress.** No ImageMagick/ffmpeg is installed on this machine
   and the task should not install system tooling. Two workable options:
   - `sharp` as a dev dependency (`npm i -D sharp`) driving a one-off Node
     script — best quality control, handles webp/jpg/png uniformly.
   - PowerShell + `System.Drawing` (already used successfully in this repo for
     `bg.jpg`): load, downscale preserving aspect, re-encode JPEG at quality
     ~60, dispose objects **before** overwriting the file. Cannot write webp.
   Prefer `sharp`; it can output webp at quality ~75 which will beat the
   originals substantially.
3. **Keep the same filenames and formats** so no JSX changes are needed. This is
   an asset-only change wherever possible.
4. **Consider `srcset`** for the handful of true hero images if a single size
   can't serve both mobile and desktop well — but only after the bulk
   recompression, and only where it earns its complexity.
5. Spot-check each result visually. Backgrounds sitting under a dark overlay
   (e.g. `bg.jpg`, `bg-2.jpg`, `analogs_bg.jpg`) tolerate aggressive compression;
   team photos and anything with faces or fine text need a gentler hand.

## Constraints

- No content changes — same images, same filenames, same crops. Do not
  substitute or remove photographs.
- Brand tokens and CSS untouched.
- `npm run build` must pass.
- If you add `sharp`, it must be a **devDependency** and the script committed
  under e.g. `scripts/optimize-images.js` so the work is reproducible.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Verification (required)

1. Re-run the size listing above and report before/after totals plus a per-file
   table for everything you touched.
2. Load the affected pages and confirm no visible degradation — About hero,
   Home backgrounds, Research/SA²TP/Software team photos, Outreach tabling shots.
3. Lighthouse mobile on `/` and `/about`: record Performance and LCP before and
   after. `About_Hero.webp` at 3.2 MB is very likely `/about`'s LCP element.

## Note on branch state

Figures are from `main`. If `feat/interactive-upgrade` is merged, `bg.jpg` has
already been recompressed (1,040 kB → 148 kB, downscaled to 1920px wide) — skip
it and re-measure the rest.
