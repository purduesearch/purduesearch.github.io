import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTier, TIERS, CONVERT_TO_WEBP } from './optimize-images.config.mjs';

test('hero files get the 1920px tier', () => {
  const r = resolveTier('business/buisness.webp');
  assert.equal(r.mode, 'photo');
  assert.equal(r.tier, 'hero');
  assert.equal(r.maxEdge, 1920);
});

test('unlisted photos fall back to the content tier', () => {
  const r = resolveTier('research/group_work.webp');
  assert.equal(r.tier, 'content');
  assert.equal(r.maxEdge, 1100);
});

test('officer headshots get the 500px tier', () => {
  assert.equal(resolveTier('officers/henry.webp').maxEdge, 500);
  assert.equal(resolveTier('officers/advisors/bera.webp').maxEdge, 500);
});

test('instagram images get the 800px social tier', () => {
  assert.equal(resolveTier('ig/Voss_ig.webp').maxEdge, 800);
});

test('per-file edge overrides beat the tier default', () => {
  assert.equal(resolveTier('about/About_Hero.webp').maxEdge, 1800);
  assert.equal(resolveTier('Purdue_Sky.webp').maxEdge, 1280);
});

test('alpha artwork is routed to the art tier at native size', () => {
  for (const p of [
    'clubpm/badges/rank/cadet.webp',
    'outreach/companies/nasa.webp',
  ]) {
    const r = resolveTier(p);
    assert.equal(r.mode, 'art', `${p} should be art`);
    assert.equal(r.maxEdge, null);
  }
});

test('svg and gif are skipped before any decode', () => {
  for (const p of ['icons/atom-solid.svg', 'icons/animat-checkmark.gif']) {
    assert.equal(resolveTier(p).mode, 'skip', `${p} must be skipped`);
  }
});

test('unknown formats are skipped rather than mangled', () => {
  assert.equal(resolveTier('foo/bar.avif').mode, 'skip');
  assert.equal(resolveTier('foo/README').mode, 'skip');
});

test('art tier wins over the extension whitelist for badges', () => {
  assert.equal(resolveTier('clubpm/badges/mythic/ethereal_chair.webp').mode, 'art');
});

test('backslash paths are normalised', () => {
  assert.equal(resolveTier('officers\\henry.webp').maxEdge, 500);
});

test('the four conversion targets are registered', () => {
  for (const p of ['bg-2.jpg', 'analogs_bg.jpg', 'news/seti.jpg', 'news/fundraising.png']) {
    assert.ok(CONVERT_TO_WEBP.has(p), `${p} should convert`);
  }
});

test('tier table matches the approved spec', () => {
  assert.deepEqual(TIERS, { hero: 1920, content: 1100, social: 800, headshot: 500 });
});

import { chooseOutput } from './optimize-images.mjs';

test('never-grow: a larger re-encode is discarded', () => {
  const original = Buffer.alloc(100);
  const encoded = Buffer.alloc(140);
  const r = chooseOutput(original, encoded);
  assert.equal(r.kept, 'original');
  assert.equal(r.buf.length, 100);
});

test('never-grow: a smaller re-encode is kept', () => {
  const r = chooseOutput(Buffer.alloc(100), Buffer.alloc(40));
  assert.equal(r.kept, 'encoded');
  assert.equal(r.buf.length, 40);
});

test('never-grow: an equal-size re-encode keeps the original', () => {
  const r = chooseOutput(Buffer.alloc(100), Buffer.alloc(100));
  assert.equal(r.kept, 'original');
});
