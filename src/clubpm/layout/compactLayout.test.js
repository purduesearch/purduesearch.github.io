import fs from 'fs';
import path from 'path';
import postcss from 'postcss';
import { act, renderHook } from '@testing-library/react';
import {
  COMPACT_QUERY, COMPACT_STORAGE_KEY, isCompactEnabled, setCompactPreview,
  useCompactLayout,
} from './compactLayout';
import { installCompactMedia } from './compactMediaTestUtils';

const ROOT = path.resolve(__dirname, '../../..');
const COMPACT_SELECTOR = /pm-shell--compact|\.pm-m-/;
const PORTAL_PARTS = new Set(['.pm-m-layer', '.pm-m-dialog', '.pm-m-sheet-head', '.pm-m-icon-btn', '.pm-m-sheet-body', '.pm-m-sheet-foot']);
// Existing feature overrides reviewed against the pre-connector stylesheet.
// These exact selectors cover runtime compact markers, shared task animations,
// and reusable portal parts. New shell/nav rules do not inherit this exception.
// Follow-up: move true shell feature overrides into the canonical media block
// as a dedicated layout change, leaving shared desktop/phone rules separate.
const EXISTING_FEATURE_OVERRIDES = new Set([
  // Body-marked portal controls (see src/AGENTS.md).
  'body.pm-m-compact .cpm-member-combobox-option',
  'body.pm-m-compact .pm-albums-overlay',
  'body.pm-m-compact .pm-albums-dialog',
  'body.pm-m-compact .pm-albums-photos',
  'body.pm-m-compact .pm-albums-back',
  'body.pm-m-compact .pm-albums-icon-btn',
  // Roll-up controls and task state/animation counterparts.
  '.pm-shell--compact .cpm-rollup-filter',
  '.pm-shell--compact .pm-m-task-group',
  '.pm-shell--compact .pm-task-check.pm-m-task-status--in_progress',
  '.pm-shell--compact .pm-task-check.pm-m-task-status--done',
  '.pm-shell--compact .pm-task-check.pm-m-task-status--done path',
  '[data-completion-id] :is(.cpm-task-row-compact-name, .pm-m-task-title)',
  '[data-completion-status="DONE"] :is(.cpm-task-row-compact-name, .pm-m-task-title)',
  '[data-completion-status="DONE"] :is(.cpm-priority-bars, .pm-m-task-priority)',
  '.pm-shell--compact .pm-task-landing .pm-task-check',
  '.pm-task-landing :is(.cpm-task-row-compact-name, .pm-m-task-title)',
  '.pm-task-landing :is(.cpm-priority-bars, .pm-m-task-priority, .cpm-avatar-stack)',
  '.pm-task-celebrating :is(.cpm-task-row-compact-name, .pm-m-task-title)',
  '.pm-task-celebrating :is(.cpm-priority-bars, .pm-m-task-priority)',
  '.pm-task-celebrating :is(.cpm-task-row-compact-name, .pm-m-task-title, .cpm-priority-bars, .pm-m-task-priority, .cpm-avatar-stack)',
  '.pm-m-task-grip',
  '.pm-shell--compact .pm-m-task-grip',
  '.pm-m-task-grip:focus-visible',
  '.pm-shell--compact .pm-task-check.pm-m-task-status--blocked',
  // Existing project header presentation.
  '.pm-shell--compact .cpm-project-main--scroll-header',
  '.pm-shell--compact .cpm-project-main--scroll-header > .pm-proj-hero',
  '.pm-shell--compact .pm-proj-details',
  '.pm-shell--compact .pm-proj-details.pm-proj-hero--m-hidden',
  // Task studio MobileSheet portals.
  '.pm-task-attachment-sheet .pm-m-sheet-body',
  '.pm-m-layer .pm-task-studio-footer',
  '.pm-m-layer.pm-shell--compact .pm-task-create-studio .pm-task-create-form > .pm-task-create-fields',
  ':is(.pm-m-task-detail, .pm-m-task-create-layer, .pm-task-attachment-sheet) .pm-m-sheet-head h2',
]);

// These two reusable MobileSheet portals intentionally also support desktop.
// Shell/nav selectors must still stay in COMPACT_QUERY; only scoped portal parts
// can override their shared dialog styles outside it.
function isPortalOverride(selector) {
  if (!/^\.(?:pm-lab-checkout-layer|pm-skills-layer)(?=[\s.:[#>+~]|$)/.test(selector)) return false;
  if ((selector.match(/\.pm-m-[\w-]+/g) || []).some(part => !PORTAL_PARTS.has(part))) return false;
  if (selector.includes('pm-shell--compact') && !/^\.[^\s>+~]*\.pm-shell--compact\b/.test(selector)) return false;
  return true;
}

function compactLeaks(css) {
  const leaks = [];
  postcss.parse(css).walkRules(rule => {
    for (const raw of rule.selectors) {
      const selector = raw.replace(/\s+/g, ' ').trim();
      if (COMPACT_SELECTOR.test(selector) && !isPortalOverride(selector) && !EXISTING_FEATURE_OVERRIDES.has(selector)) leaks.push(selector);
    }
  });
  return leaks;
}

afterEach(() => {
  window.localStorage.clear();
});

describe('COMPACT_QUERY', () => {
  it('is the condition recorded in the Phase 0 contract', () => {
    expect(COMPACT_QUERY).toBe(
      '(max-width: 767.98px), (pointer: coarse) and (hover: none) and (max-width: 1023.98px) and (max-height: 499.98px)'
    );
    const contract = fs.readFileSync(
      path.join(ROOT, 'docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/contracts.md'), 'utf8');
    const block = contract.match(/```text\r?\n([\s\S]*?)```/)[1].replace(/\s*\r?\n\s*/g, ' ').trim();
    expect(block).toBe(COMPACT_QUERY);
  });

  it('keeps compact shell navigation in the exact media query with only reviewed feature overrides', () => {
    const css = fs.readFileSync(path.join(ROOT, 'public/clubpm-theme.css'), 'utf8');
    const opener = `@media ${COMPACT_QUERY} {`;
    const start = css.indexOf(opener);
    expect(start).toBeGreaterThan(-1);
    expect(css.indexOf(opener, start + 1)).toBe(-1);

    // Walk to the block's closing brace; all shell/nav rules must be inside.
    let depth = 0;
    let end = start + opener.length - 1;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
    const outside = stripComments(css.slice(0, start) + css.slice(end + 1));
    expect(compactLeaks(outside)).toEqual([]);
    expect(stripComments(css.slice(start, end))).toMatch(/\.pm-shell--compact \.pm-m-nav\b/);
  });

  it('allows scoped portal parts while rejecting shell/nav rules outside the query', () => {
    expect(compactLeaks('.pm-lab-checkout-layer.pm-m-layer.pm-shell--compact .pm-m-dialog { width: 100%; }\n.pm-skills-layer .pm-m-sheet-head { padding: 20px; }')).toEqual([]);
    expect(compactLeaks('.pm-m-nav { width: auto; }')).toEqual(['.pm-m-nav']);
    expect(compactLeaks('.pm-shell--compact .pm-m-nav { width: auto; }')).toEqual(['.pm-shell--compact .pm-m-nav']);
    expect(compactLeaks('.pm-skills-layer .pm-m-nav { width: auto; }')).toEqual(['.pm-skills-layer .pm-m-nav']);
    expect(compactLeaks('body.pm-m-compact .pm-m-nav { width: auto; }')).toEqual(['body.pm-m-compact .pm-m-nav']);
    expect(compactLeaks('.pm-shell--compact .unreviewed-feature { width: auto; }')).toEqual(['.pm-shell--compact .unreviewed-feature']);
    expect(compactLeaks('.pm-m-dialog { width: auto; }')).toEqual(['.pm-m-dialog']);
    expect(compactLeaks('.pm-skills-layer-lookalike .pm-m-dialog { width: auto; }')).toEqual(['.pm-skills-layer-lookalike .pm-m-dialog']);
    expect(compactLeaks('.pm-skills-layer .pm-m-dialog, .pm-m-nav { width: auto; }')).toEqual(['.pm-m-nav']);
  });
});

describe('enablement switch', () => {
  it('defaults on, and the build value "off" disables it', () => {
    expect(isCompactEnabled(undefined)).toBe(true);
    expect(isCompactEnabled('on')).toBe(true);
    expect(isCompactEnabled('off')).toBe(false);
    expect(isCompactEnabled(' OFF ')).toBe(false);
  });

  it('lets the per-browser preview override the build value both ways', () => {
    window.localStorage.setItem(COMPACT_STORAGE_KEY, 'on');
    expect(isCompactEnabled('off')).toBe(true);
    window.localStorage.setItem(COMPACT_STORAGE_KEY, 'off');
    expect(isCompactEnabled('on')).toBe(false);
    window.localStorage.setItem(COMPACT_STORAGE_KEY, 'garbage');
    expect(isCompactEnabled('on')).toBe(true);
  });
});

describe('useCompactLayout', () => {
  it('follows the media query and the preview switch live, with one listener', () => {
    const media = installCompactMedia(false);
    try {
      const { result, unmount } = renderHook(() => useCompactLayout());
      expect(result.current).toBe(false);

      act(() => media.set(true));
      expect(result.current).toBe(true);

      act(() => setCompactPreview('off'));
      expect(result.current).toBe(false);

      act(() => setCompactPreview(null));
      expect(result.current).toBe(true);

      act(() => media.set(false));
      expect(result.current).toBe(false);

      expect(media.listenerCount()).toBe(1);
      unmount();
      expect(media.listenerCount()).toBe(0);
    } finally {
      media.restore();
    }
  });

  it('never forces the phone layout onto a viewport that fails the query', () => {
    const media = installCompactMedia(false);
    try {
      window.localStorage.setItem(COMPACT_STORAGE_KEY, 'on');
      const { result } = renderHook(() => useCompactLayout());
      expect(result.current).toBe(false);
    } finally {
      media.restore();
    }
  });
});
