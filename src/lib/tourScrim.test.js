import fs from 'fs';
import path from 'path';
import { scrimBlocksClicks } from '../clubpm/tour/tourGeometry';

/** The scrim is only allowed to swallow clicks when the step's whole ask is
 *  "click the highlighted thing". Anywhere else, the click it swallows is the
 *  one the learner needed to make. */
test('blocks only on a step that advances by clicking the anchor', () => {
  expect(scrimBlocksClicks({ advance: { on: 'click' } })).toBe(true);
  expect(scrimBlocksClicks({ advance: { on: 'api', method: 'POST', path: '/api/x' } })).toBe(false);
  expect(scrimBlocksClicks({ advance: { on: 'route', match: '/clubpm/shop' } })).toBe(false);
  expect(scrimBlocksClicks({ advance: { on: 'next' } })).toBe(false);
});

test('a step with no advance rule, or no step at all, never blocks', () => {
  expect(scrimBlocksClicks({})).toBe(false);
  expect(scrimBlocksClicks(null)).toBe(false);
  expect(scrimBlocksClicks(undefined)).toBe(false);
});

/**
 * The regression that started this: outreach step 3/9 asks for a real POST, but
 * the click that fires it lands on a Save button inside a form that is not the
 * step's anchor. While the scrim blocked that click the step could never
 * advance. Assert it for every shipped step, not just that one — the same shape
 * appears in six walkthroughs.
 */
test('no shipped step blocks clicks while waiting on work outside its anchor', () => {
  const root = path.join(__dirname, '..', '..', 'docs', 'courses');
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.steps.json')) files.push(full);
    }
  })(root);

  expect(files.length).toBeGreaterThan(0);

  const unreachable = [];
  for (const file of files) {
    const tour = JSON.parse(fs.readFileSync(file, 'utf8'));
    tour.steps.forEach((step, i) => {
      if (step.advance?.on !== 'click' && scrimBlocksClicks(step)) {
        unreachable.push(`${tour.tourId} ${i + 1}/${tour.steps.length} ${step.id}`);
      }
    });
  }
  expect(unreachable).toEqual([]);
});
