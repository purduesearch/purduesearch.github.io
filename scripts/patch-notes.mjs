#!/usr/bin/env node
// Constellation patch notes from git history. Rules: scripts/patch-notes.core.mjs.
// Guide: docs/PATCH-NOTES.md.
//
//   node scripts/patch-notes.mjs generate   write public/constellation-patch-notes.json (prebuild/prestart; never fails)
//   node scripts/patch-notes.mjs preview    print what the next release would contain
//   node scripts/patch-notes.mjs release    tag HEAD as the next version when it has member-facing changes (does not push)

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, buildPayload, buildSections, compareVersions, nextVersion, parseVersion } from './patch-notes.core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(ROOT, 'public/constellation-patch-notes.json');

function git(...args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

/** Releases, oldest first: [{ tag, version: [maj, min, patch], date }]. */
function listTags() {
  const out = git('for-each-ref', '--format=%(refname:short)%1f%(creatordate:iso-strict)', `refs/tags/${CONFIG.tagPrefix}*`);
  return out.split('\n').filter(Boolean)
    .map(line => {
      const [tag, date] = line.split('\x1f');
      return { tag, version: parseVersion(tag), date };
    })
    .filter(t => t.version)
    .sort((a, b) => compareVersions(a.version, b.version));
}

/** Commits in a revision range, newest first: [{ sha, subject, trailer, files }]. */
function commitsIn(range) {
  const format = `%x1e%H%x1f%s%x1f%(trailers:key=${CONFIG.trailer},valueonly,separator=%x1d)`;
  const out = git('log', '--no-merges', `--format=${format}`, '--name-only', range);
  return out.split('\x1e').filter(r => r.trim()).map(record => {
    const [header, ...rest] = record.split('\n');
    const [sha, subject, trailers = ''] = header.split('\x1f');
    return {
      sha,
      subject,
      trailer: trailers.split('\x1d')[0] ?? '',
      files: rest.map(f => f.trim()).filter(Boolean),
    };
  });
}

function assertFullHistory() {
  if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
    throw new Error('shallow clone — check out with fetch-depth: 0 so tags and history are present');
  }
}

function formatSections(sections) {
  if (!sections.length) return '  (no member-facing changes)';
  return sections.map(s => [
    `${s.title}:`,
    ...s.items.map(i => `  - ${i.scope ? `${i.scope}: ` : ''}${i.text}`),
  ].join('\n')).join('\n');
}

function unreleased() {
  const tags = listTags();
  const last = tags[tags.length - 1] ?? null;
  const sections = last ? buildSections(commitsIn(`${last.tag}..HEAD`)) : [];
  return { last, sections, version: nextVersion(last?.version ?? null, sections) };
}

function generate() {
  let payload;
  try {
    assertFullHistory();
    const tags = listTags();
    const recent = tags.slice(-(CONFIG.maxReleases + 1));
    const releases = recent.map((t, i) => {
      const previous = i > 0 ? recent[i - 1] : tags[tags.length - recent.length - 1];
      return {
        version: t.version.join('.'),
        date: t.date,
        baseline: !previous,
        sections: previous ? buildSections(commitsIn(`${previous.tag}..${t.tag}`)) : [],
      };
    });
    payload = buildPayload(releases, new Date().toISOString());
  } catch (err) {
    // A missing git binary or a shallow checkout must never break a build:
    // the page shows its empty state instead.
    console.warn(`[patch-notes] ${err.message}; writing an empty file`);
    payload = buildPayload([], new Date().toISOString());
  }
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[patch-notes] ${payload.releases.length} release(s), current ${payload.current ?? 'none'}`);
}

function preview() {
  assertFullHistory();
  const { last, sections, version } = unreleased();
  if (!last) {
    console.log(`No ${CONFIG.tagPrefix}* tag yet — the next release creates the ${version} baseline.`);
    return;
  }
  console.log(`Since ${last.tag} → ${CONFIG.tagPrefix}${version}\n${formatSections(sections)}`);
}

function release() {
  assertFullHistory();
  const { last, sections, version } = unreleased();
  if (last && sections.length === 0) {
    console.log(`[patch-notes] nothing member-facing since ${last.tag}; no release today`);
    return;
  }
  const tag = `${CONFIG.tagPrefix}${version}`;
  const message = last
    ? `Constellation ${version}\n\n${formatSections(sections)}\n`
    : `Constellation ${version}\n\nPatch-notes baseline: later releases list changes since this commit.\n`;
  git('tag', '-a', tag, '-m', message, 'HEAD');
  console.log(`[patch-notes] tagged ${tag}\n${message}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
}

const commands = { generate, preview, release };
const command = commands[process.argv[2]];
if (!command) {
  console.error(`usage: node scripts/patch-notes.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}
try {
  command();
} catch (err) {
  console.error(`[patch-notes] ${err.message}`);
  process.exit(1);
}
