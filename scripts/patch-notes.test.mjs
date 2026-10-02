import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, buildPayload, buildSections, nextVersion, noteFor, parseSubject, parseVersion, scopeLabel, touchesConstellation,
} from './patch-notes.core.mjs';

const commit = (subject, files = ['src/components/clubpm/TaskModal.jsx'], trailer = '') =>
  ({ sha: 'abcdef1234567890', subject, files, trailer });

test('parses conventional subjects', () => {
  assert.deepEqual(parseSubject('feat(lab): find lab time together'),
    { type: 'feat', scope: 'lab', breaking: false, description: 'find lab time together' });
  assert.deepEqual(parseSubject('fix!: drop legacy route'),
    { type: 'fix', scope: null, breaking: true, description: 'drop legacy route' });
  assert.equal(parseSubject('ready to publish').type, null);
});

test('only Constellation paths count, and tests/docs do not', () => {
  assert.equal(touchesConstellation(['backend/src/api/tasks.ts']), true);
  assert.equal(touchesConstellation(['src/clubpm/ClubPmAuth.jsx']), true);
  assert.equal(touchesConstellation(['src/pages/Home.jsx', 'public/search-theme.css']), false);
  assert.equal(touchesConstellation(['backend/src/services/labVisitService.test.ts']), false);
  assert.equal(touchesConstellation(['backend/AGENTS.md']), false);
  assert.equal(touchesConstellation(['src/pages/Home.jsx', 'backend/src/app.ts']), true);
});

test('scope labels use overrides, then title case', () => {
  assert.equal(scopeLabel('github'), 'GitHub');
  assert.equal(scopeLabel('lab-schedule'), 'Lab Schedule');
  assert.equal(scopeLabel(null), null);
});

test('member-facing types become notes; others are dropped', () => {
  assert.equal(noteFor(commit('feat(vault): geometry diff')).text, 'Geometry diff');
  assert.equal(noteFor(commit('fix: keep popover on screen.')).text, 'Keep popover on screen');
  assert.equal(noteFor(commit('refactor: split TaskModal')), null);
  assert.equal(noteFor(commit('docs(lab): document modules')), null);
  assert.equal(noteFor(commit('ready to publish')), null);
  assert.equal(noteFor(commit('feat: new hero', ['src/pages/Home.jsx'])), null);
});

test('Patch-Note trailer rewrites, forces, or skips a note', () => {
  const rewritten = noteFor(commit('feat(lab): LabVisit model and pure core', undefined, 'Check in to the lab from your phone'));
  assert.equal(rewritten.text, 'Check in to the lab from your phone');
  assert.equal(rewritten.type, 'feat');
  assert.equal(rewritten.scope, 'Lab');

  const forced = noteFor(commit('Refactor footer', ['src/pages/Home.jsx'], 'Sidebar links open faster'));
  assert.equal(forced.type, CONFIG.fallbackType);

  assert.equal(noteFor(commit('feat: internal flag', undefined, 'skip')), null);
  assert.equal(noteFor(commit('feat: internal flag', undefined, 'SKIP')), null);
});

test('config overrides fix pushed commits and beat the trailer', () => {
  const config = { ...CONFIG, overrides: { abcdef1: 'Better words', abc: 'too short to match' } };
  assert.equal(noteFor(commit('feat: worse words', undefined, 'Trailer words'), config).text, 'Better words');
  assert.equal(noteFor(commit('feat: worse words'), { ...CONFIG, overrides: { abcdef12: 'skip' } }), null);
  assert.equal(noteFor(commit('feat: kept'), { ...CONFIG, overrides: { abc: 'skip' } }).text, 'Kept');
});

test('sections keep config order, landing order, and drop duplicates', () => {
  const commits = [ // git log order: newest first
    commit('fix: second fix'),
    commit('feat: shiny thing'),
    commit('fix: first fix'),
    commit('fix: first fix'),
    commit('chore: bump deps'),
  ];
  const sections = buildSections(commits);
  assert.deepEqual(sections.map(s => s.title), ['New', 'Fixed']);
  assert.deepEqual(sections[1].items.map(i => i.text), ['First fix', 'Second fix']);
  assert.equal(sections[0].items[0].sha, 'abcdef12');
});

test('versions: feat bumps minor, otherwise patch; first release is the baseline', () => {
  assert.deepEqual(parseVersion('constellation-v1.4.2'), [1, 4, 2]);
  assert.equal(parseVersion('v1.4.2'), null);
  assert.equal(parseVersion('constellation-v1.4'), null);
  assert.equal(nextVersion(null, []), CONFIG.firstVersion);
  assert.equal(nextVersion([1, 4, 2], buildSections([commit('feat: x')])), '1.5.0');
  assert.equal(nextVersion([1, 4, 2], buildSections([commit('fix: x')])), '1.4.3');
});

test('payload is newest first with numeric version order', () => {
  const payload = buildPayload([
    { version: '1.9.0', date: 'a', baseline: false, sections: [] },
    { version: '1.10.0', date: 'b', baseline: false, sections: [] },
    { version: '1.0.0', date: 'c', baseline: true, sections: [] },
  ], 'now');
  assert.equal(payload.current, '1.10.0');
  assert.deepEqual(payload.releases.map(r => r.version), ['1.10.0', '1.9.0', '1.0.0']);
  assert.equal(buildPayload([], 'now').current, null);
});
