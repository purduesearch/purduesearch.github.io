// Lists every walkthrough step that targets a shell/navigation-level anchor.
// Usage: node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/scan-shell-tour-steps.mjs
import fs from 'node:fs';
import path from 'node:path';

const SHELL = /^(nav\.|topbar\.|project\.tab\.|dash\.|board\.memberchips$|board\.filters$)/;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.steps.json') ? [path.join(d, e.name)] : []);

const rows = [];
for (const f of walk('docs/courses')) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  (j.steps ?? []).forEach((s, i) => {
    if (!SHELL.test(s.anchor ?? '')) return;
    rows.push([
      path.relative('docs/courses', f).split(path.sep).join('/'),
      `${i}:${s.id ?? ''}`,
      s.anchor,
      s.advance?.on ?? '',
      (s.body ?? '').replace(/\s+/g, ' ').slice(0, 110),
    ]);
  });
}
console.log('| Step file | Step | Anchor | Advance | Body (truncated) |');
console.log('| --- | --- | --- | --- | --- |');
for (const r of rows) console.log(`| ${r.map((c) => String(c).replace(/\|/g, '\|')).join(' | ')} |`);
