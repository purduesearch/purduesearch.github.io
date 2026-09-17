// Turns evidence/browser/metrics.json (+ metrics-extras.json) into a readable table.
// Usage: node docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/scripts/summarize-baselines.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, '../evidence/browser');
const m = JSON.parse(fs.readFileSync(path.join(DIR, 'metrics.json'), 'utf8'));
const x = fs.existsSync(path.join(DIR, 'metrics-extras.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'metrics-extras.json'), 'utf8')) : { captures: [] };

const lines = [
  '# Production baseline measurements (fixture API)',
  '',
  `Generated ${m.generatedAt} from \`metrics.json\`; extras ${x.generatedAt ?? '—'}. Production React components served by \`npm start\`; API answered by \`scripts/fixture-api.mjs\` (fixture data, not a real account). Chrome headless, device emulation (mobile viewport + touch for phone/landscape; mouse for desktop). **Emulation, not a device test.**`,
  '',
  '"Layout width" is `innerWidth` after load (the layout viewport). When it exceeds the device width, content is wider than the phone: at the initial scale of 1 the extra width sits off-screen to the right and the page pans sideways (verified on Tasks at 390: visual viewport 390, scale 1, scrollWidth 463).',
  '',
  '| Capture | URL after load | Layout width (device) | Controls <44px in view | Observations |',
  '| --- | --- | --- | --- | --- |',
];
for (const c of m.captures) {
  const notes = [];
  if (c.note) notes.push(c.note);
  if (c.projectMain) notes.push(`project main ${c.projectMain.width}px`);
  if (c.assigneePanel) notes.push(`assignee panel ${c.assigneePanel.width}px`);
  if (c.composer) notes.push(`composer top at ${c.composer.top}px (viewport ${c.viewport.vh}px)`);
  if (c.taskModal) notes.push(`task modal ${c.taskModal.width}px wide`);
  const beyond = (c.interactiveBeyondRightEdge || []).map((b) => b.text || b.el).filter(Boolean);
  if (beyond.length) notes.push(`controls past right edge: ${beyond.slice(0, 4).join('; ')}`);
  lines.push(`| [${c.name}](${path.basename(c.file)}) | \`${c.url}\` | ${c.viewport.innerWidth} (${c.viewport.deviceWidth}) | ${c.under44InView} / ${c.interactiveInView} | ${notes.join('; ').replace(/\|/g, '\\|')} |`);
}
lines.push('', '## Supplementary captures (`capture-extras.mjs`)', '', '| Capture | URL | Layout width (device) | Sidebar px | Project main px | Note |', '| --- | --- | --- | --- | --- | --- |');
for (const c of x.captures) lines.push(`| [${c.name}](${path.basename(c.file)}) | \`${c.url}\` | ${c.innerWidth} (${c.deviceWidth}) | ${c.sidebar ?? '—'} | ${c.projectMain ?? '—'} | ${c.note} |`);
lines.push('', '## Navigation, history and request probes', '', '```json', JSON.stringify({ history: m.history, navigationRequests: m.navigationRequests }, null, 2), '```', '',
  'Console errors seen during the run (fixture gaps included):', '', ...m.consoleErrors.map((e) => `- \`${String(e).slice(0, 160)}\``), '');
fs.writeFileSync(path.join(DIR, 'SUMMARY.md'), lines.join('\n'));
console.log(`wrote ${path.join(DIR, 'SUMMARY.md')} (${m.captures.length} + ${x.captures.length} captures)`);
