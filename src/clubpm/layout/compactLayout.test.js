import fs from 'fs';
import path from 'path';
import { act, renderHook } from '@testing-library/react';
import {
  COMPACT_QUERY, COMPACT_STORAGE_KEY, isCompactEnabled, setCompactPreview,
  useCompactLayout,
} from './compactLayout';
import { installCompactMedia } from './compactMediaTestUtils';

const ROOT = path.resolve(__dirname, '../../..');

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
    const block = contract.match(/```text\n([\s\S]*?)```/)[1].replace(/\s*\n\s*/g, ' ').trim();
    expect(block).toBe(COMPACT_QUERY);
  });

  it('is the exact @media condition wrapping every compact rule in clubpm-theme.css', () => {
    const css = fs.readFileSync(path.join(ROOT, 'public/clubpm-theme.css'), 'utf8');
    const opener = `@media ${COMPACT_QUERY} {`;
    const start = css.indexOf(opener);
    expect(start).toBeGreaterThan(-1);
    expect(css.indexOf(opener, start + 1)).toBe(-1);

    // Walk to the block's closing brace; every compact selector must be inside.
    let depth = 0;
    let end = start + opener.length - 1;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
    const outside = stripComments(css.slice(0, start) + css.slice(end + 1));
    expect(outside).not.toMatch(/pm-shell--compact|\.pm-m-/);
    expect(stripComments(css.slice(start, end))).toMatch(/\.pm-shell--compact \.pm-m-nav\b/);
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
