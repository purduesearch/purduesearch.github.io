import React from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installCompactMedia } from '../layout/compactMediaTestUtils';
import { getShellReveal, requestShellReveal, SHELL_REVEAL_EVENT } from '../layout/shellOverlay';
import { TourProvider, effectiveStep, useTour } from './TourProvider';

jest.mock('../../api/clubPmClient', () => ({
  recordTourProgress: () => Promise.resolve(),
  reportTourBreakage: () => Promise.resolve(),
}));

const STEPS = [
  {
    id: 'the-rail', anchor: 'nav.sidebar', route: '*', title: 'Start here', body: 'desktop copy',
    placement: 'right', advance: { on: 'next' },
    compact: { anchor: 'nav.bar', body: 'phone copy', placement: 'top' },
  },
  {
    id: 'to-shop', anchor: 'nav.shop', route: '*', title: 'Shop', body: 'desktop shop',
    advance: { on: 'click' }, compact: { reveal: 'more', body: 'phone shop' },
  },
  { id: 'plain', anchor: 'shop.grid', route: '*', title: 'Grid', body: 'grid', advance: { on: 'next' } },
];

describe('effectiveStep', () => {
  it('runs the desktop step exactly as written', () => {
    expect(effectiveStep(STEPS[0], false)).toBe(STEPS[0]);
  });
  it('overlays the compact fields on phones', () => {
    expect(effectiveStep(STEPS[0], true)).toMatchObject({
      id: 'the-rail', anchor: 'nav.bar', body: 'phone copy', placement: 'top', title: 'Start here',
    });
    expect(effectiveStep(STEPS[2], true)).toBe(STEPS[2]);
  });
});

let tour;
function Grab() { tour = useTour(); return null; }

function renderTour(compact) {
  // A "*" step's reveal is scoped to the real window path (BrowserRouter keeps
  // it in step with the app; MemoryRouter does not, so set it here).
  window.history.pushState({}, '', '/clubpm');
  const media = installCompactMedia(compact);
  const seen = [];
  const onReveal = (e) => seen.push(e.detail.target);
  window.addEventListener(SHELL_REVEAL_EVENT, onReveal);
  const utils = render(
    <MemoryRouter initialEntries={['/clubpm']}>
      <TourProvider><Grab /></TourProvider>
    </MemoryRouter>
  );
  return {
    ...utils, seen,
    cleanup() { window.removeEventListener(SHELL_REVEAL_EVENT, onReveal); media.restore(); },
  };
}

afterEach(() => {
  requestShellReveal(null);
  sessionStorage.clear();
});

it('asks the phone shell to reveal More for a compact step, and clears it after', () => {
  const view = renderTour(true);
  try {
    act(() => tour.startTour({ sectionId: 's', tourId: 'x', steps: STEPS, preview: true }));
    expect(tour.step.anchor).toBe('nav.bar');
    expect(getShellReveal('/clubpm')).toBeNull();

    act(() => tour.next());
    expect(tour.step.body).toBe('phone shop');
    expect(getShellReveal('/clubpm')).toBe('more');
    // Sticky for a shell that mounts on the step's screen, not for one that
    // mounts because the learner followed the revealed link elsewhere.
    expect(getShellReveal('/clubpm/shop')).toBeNull();

    act(() => tour.pause());
    expect(getShellReveal('/clubpm')).toBeNull();
    expect(view.seen).toEqual(['more', null]);
  } finally {
    view.cleanup();
  }
});

it('never reveals anything on the desktop shell', () => {
  const view = renderTour(false);
  try {
    act(() => tour.startTour({ sectionId: 's', tourId: 'x', steps: STEPS, preview: true, resumeAt: 1 }));
    expect(tour.step.anchor).toBe('nav.shop');
    expect(tour.step.body).toBe('desktop shop');
    expect(getShellReveal('/clubpm')).toBeNull();
    expect(view.seen).toEqual([]);
  } finally {
    view.cleanup();
  }
});
