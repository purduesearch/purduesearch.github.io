/**
 * Generates a self-hosted, subsetted Font Awesome 6 build.
 *
 *   node scripts/build-fa-subset.mjs [--report]
 *
 * Outputs:
 *   public/fa-subset.css        base + utility CSS, plus only the icons in use
 *   public/webfonts/*.woff2     subsetted solid / regular / brands fonts
 *
 * Replaces the `cdnjs.cloudflare.com/.../font-awesome/6.5.2/css/all.min.css`
 * link in public/index.html. Class names are unchanged, so no JSX changes are
 * needed and CLAUDE.md's "Font Awesome classes only" convention still holds.
 *
 * The non-icon parts of the CSS (`.fas`, `.fa-fw`, `.fa-spin`, @font-face, …)
 * are carried over verbatim from Font Awesome's own all.min.css so rendering is
 * byte-for-byte identical; only unused `.fa-<name>:before` rules are dropped.
 */
import fs from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';
import * as fontkit from 'fontkit';
import {
  REPO, FA_PKG, ICON_RULE_RE,
  scanUsage, readIconCodepoints, readIconFamilies, readExtras, UTILITY_CLASSES,
} from './fa-icon-scan.mjs';

const REPORT_ONLY = process.argv.includes('--report');

/**
 * Icons referenced in source that Font Awesome 6 *Free* does not ship. These
 * already render as nothing against the CDN build, so omitting them from the
 * subset changes nothing. Listed explicitly so genuine typos still fail.
 */
const KNOWN_UNAVAILABLE = new Map([
  ['calendar-star', 'Font Awesome Pro only — renders blank with the CDN build too'],
]);

const FONT_FILES = {
  solid: 'fa-solid-900',
  regular: 'fa-regular-400',
  brands: 'fa-brands-400',
};

const codepoints = readIconCodepoints();
const families = readIconFamilies();
const { hits, interpolated } = scanUsage();

// ---------------------------------------------------------------- resolve ---

for (const { style, name } of readExtras()) {
  if (!hits.has(name)) hits.set(name, { styles: new Set(), where: new Set() });
  const h = hits.get(name);
  if (style) h.styles.add({ fas: 'solid', far: 'regular', fab: 'brands' }[style]);
  h.where.add('scripts/fa-icons-extra.txt');
}

/** style -> Set of glyph characters */
const needed = { solid: new Set(), regular: new Set(), brands: new Set() };
const problems = [];
const warnings = [];
const resolved = [];

for (const [name, info] of [...hits].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (UTILITY_CLASSES.has(name)) continue;

  if (KNOWN_UNAVAILABLE.has(name)) {
    warnings.push(`fa-${name}: ${KNOWN_UNAVAILABLE.get(name)} (${[...info.where][0]})`);
    continue;
  }

  const glyph = codepoints.get(name);
  if (!glyph) {
    problems.push(
      `fa-${name} is not a Font Awesome 6 Free icon — used at ${[...info.where].slice(0, 3).join(', ')}`,
    );
    continue;
  }

  const available = families.get(name) ?? new Set(['solid']);
  // Styles actually written at the call sites; default to solid, except for
  // brands-only icons which can only come from the brands font.
  let want = new Set(info.styles);
  if (want.size === 0) want = new Set([available.has('brands') && available.size === 1 ? 'brands' : 'solid']);

  for (const style of want) {
    const use = available.has(style) ? style : [...available][0];
    if (!use || !needed[use]) {
      problems.push(`fa-${name}: no free style available (wanted ${style})`);
      continue;
    }
    needed[use].add(glyph);
    resolved.push([name, use]);
  }
}

// Interpolation stems can never be resolved statically; every possible value
// must be declared in fa-icons-extra.txt. Surface them so a new one is noticed.
const stemReport = [...interpolated].map(
  ([stem, where]) => `  fa-${stem === '(bare)' ? '' : stem + '-'}\${…}  ${[...where].slice(0, 2).join(', ')}${where.size > 2 ? ` (+${where.size - 2} more)` : ''}`,
);

console.log(`Font Awesome subset: ${resolved.length} icon/style pairs from ${hits.size} names`);
for (const [style, set] of Object.entries(needed)) console.log(`  ${style.padEnd(8)} ${set.size} glyphs`);
if (warnings.length) {
  console.log('\nWarnings (unchanged from current behaviour):');
  for (const w of warnings) console.log('  ! ' + w);
}
console.log('\nRuntime-built icon classes (must be covered by fa-icons-extra.txt):');
for (const l of stemReport) console.log(l);

if (problems.length) {
  console.error('\nERROR: unresolved icon names:');
  for (const p of problems) console.error('  x ' + p);
  console.error('\nAdd them to scripts/fa-icons-extra.txt or fix the class name.');
  process.exit(1);
}

if (REPORT_ONLY) process.exit(0);

// ---------------------------------------------------------------- subset ----

const outFontDir = path.join(REPO, 'public', 'webfonts');
fs.mkdirSync(outFontDir, { recursive: true });

const shipped = new Set();
let totalBytes = 0;
let originalBytes = 0;

for (const [style, glyphs] of Object.entries(needed)) {
  const base = FONT_FILES[style];
  if (glyphs.size === 0) {
    console.log(`\n${style}: unused, not shipped`);
    continue;
  }
  const srcPath = path.join(FA_PKG, 'webfonts', `${base}.woff2`);
  const src = fs.readFileSync(srcPath);
  const text = [...glyphs].join('');
  const out = await subsetFont(src, text, { targetFormat: 'woff2' });
  fs.writeFileSync(path.join(outFontDir, `${base}.woff2`), out);
  shipped.add(base);
  totalBytes += out.length;
  originalBytes += src.length;

  // Verify every requested glyph survived the subset.
  const font = fontkit.create(out);
  const missing = [...glyphs].filter((ch) => {
    const g = font.glyphForCodePoint(ch.codePointAt(0));
    return !g || g.id === 0;
  });
  if (missing.length) {
    console.error(
      `\nERROR: ${base}.woff2 is missing ${missing.length} glyph(s): ` +
        missing.map((c) => 'U+' + c.codePointAt(0).toString(16)).join(' '),
    );
    process.exit(1);
  }

  console.log(
    `\n${style}: ${glyphs.size} glyphs  ${(src.length / 1024).toFixed(1)} kB -> ` +
      `${(out.length / 1024).toFixed(1)} kB  (verified)`,
  );
}

// ------------------------------------------------------------------- css ----

const srcCss = fs.readFileSync(path.join(FA_PKG, 'css', 'all.min.css'), 'utf8');

// Drop every icon-content rule; the used ones are re-emitted below.
let css = srcCss.replace(new RegExp(ICON_RULE_RE.source, 'g'), '');

// Point @font-face at the local subsets (woff2 only) and drop faces whose font
// we do not ship — currently fa-v4compatibility, since no v4 class names are used.
css = css.replace(/@font-face\{[^}]*\}/g, (block) => {
  const m = /url\(\.\.\/webfonts\/([a-z0-9-]+)\.woff2\)/i.exec(block);
  if (!m || !shipped.has(m[1])) return '';
  return block.replace(
    /src:[^;}]*/,
    `src:url(webfonts/${m[1]}.woff2) format("woff2")`,
  );
});

// Re-emit only the icons in use, grouping names that share a glyph.
const byGlyph = new Map();
for (const [name] of resolved) {
  const glyph = codepoints.get(name);
  if (!byGlyph.has(glyph)) byGlyph.set(glyph, new Set());
  byGlyph.get(glyph).add(name);
}
const iconRules = [...byGlyph]
  .map(([glyph, names]) => {
    const hex = glyph.codePointAt(0).toString(16);
    const sel = [...names].sort().map((n) => `.fa-${n}:before`).join(',');
    return `${sel}{content:"\\${hex}"}`;
  })
  .sort()
  .join('');

const pkgVersion = JSON.parse(fs.readFileSync(path.join(FA_PKG, 'package.json'), 'utf8')).version;
const header =
  `/*!\n * Font Awesome Free ${pkgVersion} — self-hosted subset (${byGlyph.size} icons).\n` +
  ` * GENERATED by scripts/build-fa-subset.mjs — do not edit by hand.\n` +
  ` * Add runtime-built icon names to scripts/fa-icons-extra.txt, then\n` +
  ` * run: npm run build:icons\n` +
  ` * License: https://fontawesome.com/license/free (CC BY 4.0 / SIL OFL 1.1 / MIT)\n */\n`;

const outCssPath = path.join(REPO, 'public', 'fa-subset.css');
fs.writeFileSync(outCssPath, header + css + iconRules);

// ---------------------------------------------------------------- verify ----
// Re-read what was actually written and confirm every icon in use resolves all
// the way through: CSS rule -> codepoint -> glyph in the shipped font file.
{
  const writtenCss = fs.readFileSync(outCssPath, 'utf8');
  const emitted = new Map();
  const re = new RegExp(ICON_RULE_RE.source, 'g');
  let m;
  while ((m = re.exec(writtenCss))) {
    for (const sel of m[1].split(',')) {
      emitted.set(sel.trim().replace(/^\.fa-/, '').replace(/:before$/, ''), m[2]);
    }
  }

  const fonts = {};
  for (const [style, base] of Object.entries(FONT_FILES)) {
    const p = path.join(outFontDir, `${base}.woff2`);
    if (fs.existsSync(p)) fonts[style] = fontkit.create(fs.readFileSync(p));
  }

  const broken = [];
  for (const [name, style] of resolved) {
    const hex = emitted.get(name);
    if (!hex) {
      broken.push(`fa-${name}: no rule in fa-subset.css`);
      continue;
    }
    const font = fonts[style];
    if (!font) {
      broken.push(`fa-${name}: ${style} font was not written`);
      continue;
    }
    const glyph = font.glyphForCodePoint(parseInt(hex, 16));
    if (!glyph || glyph.id === 0) broken.push(`fa-${name}: U+${hex} missing from ${FONT_FILES[style]}.woff2`);
  }

  if (broken.length) {
    console.error(`\nERROR: ${broken.length} icon(s) would render as a blank box:`);
    for (const b of broken.slice(0, 20)) console.error('  x ' + b);
    process.exit(1);
  }
  console.log(`\nVerified ${resolved.length} icon/style pairs resolve to a real glyph.`);
}

console.log(
  `\nCSS  ${(srcCss.length / 1024).toFixed(1)} kB -> ${((header.length + css.length + iconRules.length) / 1024).toFixed(1)} kB`,
);
console.log(
  `Fonts ${(originalBytes / 1024).toFixed(1)} kB -> ${(totalBytes / 1024).toFixed(1)} kB`,
);
console.log(`\nWrote public/fa-subset.css and public/webfonts/ (${shipped.size} fonts)`);
