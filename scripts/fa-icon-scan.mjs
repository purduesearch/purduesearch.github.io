/**
 * Shared icon-inventory scanner for the Font Awesome subset build.
 *
 * Collects every Font Awesome icon name the site can render, from four sources:
 *   1. `fas|far|fab fa-<name>` pairs  — style is known, so the family is known.
 *   2. Loose `fa-<name>` tokens       — style unknown; defaults to solid.
 *   3. Bare `icon="<name>"` props     — TaskModal-style helpers that build
 *                                       `fas fa-${icon}` at runtime.
 *   4. `scripts/fa-icons-extra.txt`   — hand-maintained list for names that are
 *                                       only ever produced by interpolation or
 *                                       stored in the database.
 *
 * A purely static `fa-` grep is NOT sufficient for this codebase — see the
 * extras file for the specific cases that proved it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');

export const FA_PKG = path.join(REPO, 'node_modules', '@fortawesome', 'fontawesome-free');

/** Files/dirs scanned for icon usage. */
const SCAN_TARGETS = [
  'src',
  'backend/src',
  'backend/prisma',
  'public/index.html',
  'public/search-theme.css',
  'public/clubpm-theme.css',
];

const SCAN_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.scss']);

/**
 * FA6 utility/modifier classes. These share the `fa-` prefix but are not icons,
 * so they must never be looked up as glyphs. Anything matching `fa-*` that is
 * neither a known icon nor listed here is reported as unresolved.
 */
const UTILITY_CLASSES = new Set([
  'fa', 'fas', 'far', 'fab', 'fal', 'fad',
  'classic', 'solid', 'regular', 'brands', 'duotone', 'sharp',
  '2xs', 'xs', 'sm', 'lg', 'xl', '2xl',
  ...Array.from({ length: 10 }, (_, i) => `${i + 1}x`),
  'fw', 'ul', 'li', 'border', 'pull-left', 'pull-right',
  'beat', 'fade', 'beat-fade', 'bounce', 'flip', 'shake',
  'spin', 'spin-reverse', 'spin-pulse', 'pulse',
  'rotate-90', 'rotate-180', 'rotate-270', 'rotate-by',
  'flip-horizontal', 'flip-vertical', 'flip-both',
  'stack', 'stack-1x', 'stack-2x', 'inverse',
  'sr-only', 'sr-only-focusable', 'swap-opacity', 'width-auto',
]);

/**
 * Matches one icon-content rule in Font Awesome's minified CSS, including the
 * grouped form used for aliases:
 *   `.fa-pencil-alt:before,.fa-pencil:before{content:"\f303"}`
 * Group 1 is the whole selector list, group 2 the hex codepoint.
 */
export const ICON_RULE_RE = new RegExp(
  '((?:\\.fa-[a-z0-9-]+:before,)*\\.fa-[a-z0-9-]+:before)\\{content:"\\\\([0-9a-f]+)"\\}',
  'g',
);

/**
 * Parse Font Awesome's own CSS into `name -> glyph`. Every selector in a
 * grouped rule is recorded, so v5 aliases (`fa-times`, `fa-edit`, …) resolve
 * exactly as they do against the CDN build.
 */
export function readIconCodepoints() {
  const cssPath = path.join(FA_PKG, 'css', 'all.min.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const map = new Map();
  const re = new RegExp(ICON_RULE_RE.source, 'g');
  let m;
  while ((m = re.exec(css))) {
    const glyph = String.fromCodePoint(parseInt(m[2], 16));
    for (const sel of m[1].split(',')) {
      const name = sel.trim().replace(/^\.fa-/, '').replace(/:before$/, '');
      if (name) map.set(name, glyph);
    }
  }
  if (map.size === 0) throw new Error('Parsed 0 icons from all.min.css — FA layout changed?');
  return map;
}

/** name -> Set of free styles ("solid" | "regular" | "brands"). */
export function readIconFamilies() {
  const meta = JSON.parse(
    fs.readFileSync(path.join(FA_PKG, 'metadata', 'icon-families.json'), 'utf8'),
  );
  const styles = new Map();
  for (const [name, def] of Object.entries(meta)) {
    const free = new Set(
      (def.familyStylesByLicense?.free ?? [])
        .filter((f) => f.family === 'classic')
        .map((f) => f.style),
    );
    for (const alias of [name, ...(def.aliases?.names ?? [])]) {
      styles.set(alias, new Set([...(styles.get(alias) ?? []), ...free]));
    }
  }
  return styles;
}

function walk(target, out) {
  const abs = path.join(REPO, target);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    out.push(abs);
    return;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = path.join(target, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (SCAN_EXT.has(path.extname(entry.name))) out.push(path.join(REPO, rel));
  }
}

export function readExtras() {
  const p = path.join(HERE, 'fa-icons-extra.txt');
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(fas|far|fab)\s+fa-([a-z0-9-]+)$/.exec(l) || /^fa-([a-z0-9-]+)$/.exec(l);
      if (!m) throw new Error(`fa-icons-extra.txt: cannot parse line "${l}"`);
      return m.length === 3 ? { style: m[1], name: m[2] } : { style: null, name: m[1] };
    });
}

const STYLE_OF = { fas: 'solid', far: 'regular', fab: 'brands' };

/**
 * @returns {{ hits: Map<string, {styles:Set<string>, where:Set<string>}>, interpolated: Map<string,Set<string>> }}
 */
export function scanUsage() {
  const files = [];
  for (const t of SCAN_TARGETS) walk(t, files);

  /** name -> { styles, where } */
  const hits = new Map();
  /** truncated `fa-foo-${...}` stems -> locations, for reporting */
  const interpolated = new Map();

  const add = (name, style, where) => {
    if (!hits.has(name)) hits.set(name, { styles: new Set(), where: new Set() });
    const h = hits.get(name);
    if (style) h.styles.add(style);
    h.where.add(where);
  };

  const pairRe = /\b(fas|far|fab)\s+fa-([a-z0-9-]+)/g;
  const looseRe = /\bfa-([a-z0-9-]*)/g;
  const bareRe = /\b(?:icon|actionIcon)="([a-z0-9-]+)"/g;

  for (const abs of files) {
    const rel = path.relative(REPO, abs).replace(/\\/g, '/');
    const text = fs.readFileSync(abs, 'utf8');
    const lineOf = (idx) => text.slice(0, idx).split('\n').length;

    // A token is an interpolation stem when the name is empty or ends in a
    // dash — i.e. `fa-${x}` or `fa-arrow-${x}`. Those cannot be resolved
    // statically and must be declared in fa-icons-extra.txt.
    // `fa-sync-alt${cond}` is NOT a stem: the icon name is complete and the
    // interpolation only appends a second class.
    const noteStem = (raw, where) => {
      const stem = raw.replace(/-+$/, '') || '(bare)';
      if (!interpolated.has(stem)) interpolated.set(stem, new Set());
      interpolated.get(stem).add(where);
    };

    // A `fa-` token that runs into `.` or `/` is part of a path or filename
    // (`webfonts/fa-solid-900.woff2`, `fa-subset.css`), not a class name.
    const isFilePath = (end) => text[end] === '.' || text[end] === '/';

    let m;
    while ((m = pairRe.exec(text))) {
      const where = `${rel}:${lineOf(m.index)}`;
      if (isFilePath(m.index + m[0].length)) continue;
      if (m[2] === '' || m[2].endsWith('-')) noteStem(m[2], where);
      else add(m[2], STYLE_OF[m[1]], where);
    }
    while ((m = looseRe.exec(text))) {
      const raw = m[1];
      const where = `${rel}:${lineOf(m.index)}`;
      if (isFilePath(m.index + m[0].length)) continue;
      if (raw === '' || raw.endsWith('-')) noteStem(raw, where);
      else add(raw, null, where);
    }
    while ((m = bareRe.exec(text))) {
      // Helpers render these as `fas fa-${icon}`; some call sites already
      // include the `fa-` prefix, which the loose pass above catches.
      const name = m[1].replace(/^fa-/, '');
      add(name, 'solid', `${rel}:${lineOf(m.index)}`);
    }
  }

  return { hits, interpolated };
}

export { UTILITY_CLASSES };
