#!/usr/bin/env node
/**
 * Minify the hand-written stylesheets that CRA copies verbatim out of public/.
 *
 * react-scripts only minifies CSS that goes through the webpack pipeline
 * (src/**, emitted to build/static/css/). Everything in public/ is copied
 * byte-for-byte, so search-theme.css shipped as ~200 kB of source with all its
 * comments — and style.min.css shipped unminified despite the name. Both are
 * render-blocking <link>s in index.html, which is what the SEO audits flagged
 * as "Minify your CSS files".
 *
 * This runs as part of `postbuild` and rewrites the copies in build/ only.
 * The sources in public/ stay readable and editable, which the CSS conventions
 * in CLAUDE.md depend on (new rules get appended to the bottom of these files).
 *
 * IMPORTANT: level 1 optimizations only. Level 2 merges and reorders rules,
 * and clubpm-theme.css is a verbatim tail slice of the pre-split stylesheet
 * whose cascade order is load-bearing. Whitespace and comments only.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import CleanCSS from 'clean-css';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');

// Stylesheets that live in public/ and are copied straight into build/.
const TARGETS = [
  'search-theme.css',
  'clubpm-theme.css',
  'style.min.css',
  'fa-subset.css',
  'ares-theme.css',
];

const cleaner = new CleanCSS({
  level: 1,
  rebase: false,
  returnPromise: false,
});

const kb = bytes => `${(bytes / 1024).toFixed(1)} kB`;

if (!existsSync(buildDir)) {
  console.error('[minify-css] build/ not found — run `npm run build` first.');
  process.exit(1);
}

let totalBefore = 0;
let totalAfter = 0;
let failed = false;

for (const name of TARGETS) {
  const file = join(buildDir, name);
  if (!existsSync(file)) {
    console.warn(`[minify-css] skip ${name} (not in build/)`);
    continue;
  }

  const before = statSync(file).size;
  const source = readFileSync(file, 'utf8');
  const out = cleaner.minify(source);

  if (out.errors.length) {
    console.error(`[minify-css] ${name}: ${out.errors.join('; ')}`);
    failed = true;
    continue;
  }
  for (const warning of out.warnings) {
    console.warn(`[minify-css] ${name}: ${warning}`);
  }

  // Preserve the BOM if the source had one; some of these files are UTF-8 with
  // BOM and clean-css strips it.
  const styles = source.charCodeAt(0) === 0xfeff ? `﻿${out.styles}` : out.styles;

  writeFileSync(file, styles, 'utf8');
  const after = Buffer.byteLength(styles, 'utf8');
  totalBefore += before;
  totalAfter += after;
  console.log(
    `[minify-css] ${name.padEnd(20)} ${kb(before).padStart(9)} -> ${kb(after).padStart(9)}` +
    `  (-${Math.round((1 - after / before) * 100)}%)`
  );
}

if (totalBefore) {
  console.log(
    `[minify-css] total ${kb(totalBefore)} -> ${kb(totalAfter)} ` +
    `(-${Math.round((1 - totalAfter / totalBefore) * 100)}%)`
  );
}

process.exit(failed ? 1 : 0);
