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
  // Post-conversion names. These four are in CONVERT_TO_WEBP, so the .jpg
  // sources no longer exist; listing the old names left them tiered 'content'
  // (1100px) on any later run, which would have quietly shrunk a full-bleed bg.
  'analogs_bg.webp',
  'bg.webp',
  'bg-2.webp',
  'astrousa/Group_Photo_ASTRO.webp',
  'bg.jpg',
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

/**
 * Plotted figures, CFD output, and UI screenshots: photographic in the sense
 * that they are dense and full-frame, but carrying small hard-edged type
 * (axis labels, colourbar ticks, on-screen readouts) that the default q75
 * photo profile visibly rings around and smears. Encoded lossy but at a
 * higher quality, at the normal content cap.
 *
 * Directory-scoped rather than file-listed. public/ares/ also holds two actual
 * photographs, and q88 on a photograph costs a few kB over q75 and nothing
 * else — cheaper than a hand-maintained list that silently mis-tiers the next
 * figure someone drops in beside them.
 */
export const FIGURE_DIRS = ['ares/'];

/** Whitelist, not a blocklist: an unrecognised format is skipped, never mangled. */
export const RASTER_EXT = new Set(['.webp', '.jpg', '.jpeg', '.png']);

/** Re-encoded to .webp under a new extension; references updated in src/. */
export const CONVERT_TO_WEBP = new Set([
  'bg-2.jpg',
  'analogs_bg.jpg',
  'news/seti.jpg',
  'news/fundraising.png',
  'bg.jpg',
  'research/2023_24/hydroponics/hydro.jpg',
]);

/**
 * Multi-frame images, opted in by hand. The extension gate skips every .gif by
 * default because a plain sharp() decode keeps only frame 1, and that loss is
 * irreversible on a committed asset. Anything listed here is decoded with
 * `animated: true` and encoded to animated webp at native size instead.
 *
 * Both the source name and the .webp it converts to must be listed: after the
 * first run the source is gone and the output has to keep resolving to this
 * mode, or the next run would decode the animated webp with animated:false and
 * flatten it to a single frame.
 */
export const ANIMATED = new Set([
  'research/Barker_Breakdown.gif',
  'research/Barker_Breakdown.webp',
]);

/** Encoder settings for ANIMATED entries. Lossy, but frames dominate the budget. */
export const ANIMATED_WEBP = { quality: 75, effort: 6 };

/**
 * Frame-width cap for ANIMATED entries, applied as width only.
 *
 * The tier system's longest-edge fit:'inside' cannot be used here: sharp
 * represents an animated image as a vertical filmstrip (6 frames of 972x648
 * decode as one 972x3888 buffer), so a longest-edge cap would clamp the
 * filmstrip height and squash every frame. Width-only keeps the aspect ratio.
 *
 * 330px is 3x the 110px .prof-img-container box these render in — the only
 * consumer today — with headroom for a 2x display.
 */
export const ANIMATED_MAX_WIDTH = 330;

/** Encoder settings. */
export const PHOTO_WEBP = { quality: 75, effort: 6 };
export const ART_WEBP = { nearLossless: true, quality: 80, effort: 6 };
/** See FIGURE_DIRS — lossy, but high enough to keep small axis type readable. */
export const FIGURE_WEBP = { quality: 88, effort: 6 };

/**
 * @param {string} relPath path relative to public/, any separator style
 * @returns {{mode:'photo'|'art'|'figure'|'animated'|'skip', tier?:string, maxEdge?:number|null, reason?:string}}
 */
export function resolveTier(relPath) {
  const p = relPath.replace(/\\/g, '/');
  const dot = p.lastIndexOf('.');
  const ext = dot === -1 ? '' : p.slice(dot).toLowerCase();

  // Hand-listed multi-frame files are decoded with animated:true, so they run
  // ahead of the extension gate that otherwise skips every .gif.
  if (ANIMATED.has(p)) {
    return { mode: 'animated', tier: 'animated', maxEdge: null };
  }

  // Extension gate runs first: sharp flattens animated GIFs to a single frame
  // and rasterises SVGs, both irreversible on committed assets.
  if (!RASTER_EXT.has(ext)) {
    return { mode: 'skip', reason: `non-raster extension "${ext || '(none)'}"` };
  }

  if (ART_DIRS.some((d) => p.startsWith(d))) {
    return { mode: 'art', tier: 'art', maxEdge: null };
  }

  if (FIGURE_DIRS.some((d) => p.startsWith(d))) {
    return { mode: 'figure', tier: 'figure', maxEdge: TIERS.content };
  }

  let tier;
  if (HEADSHOT_DIRS.some((d) => p.startsWith(d))) tier = 'headshot';
  else if (SOCIAL_DIRS.some((d) => p.startsWith(d))) tier = 'social';
  else if (HERO_FILES.has(p)) tier = 'hero';
  else tier = 'content';

  return { mode: 'photo', tier, maxEdge: EDGE_OVERRIDES[p] ?? TIERS[tier] };
}
