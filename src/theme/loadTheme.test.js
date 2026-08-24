import { loadTheme, lazyWithTheme, __resetThemeCacheForTests } from './loadTheme';

describe('loadTheme', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    __resetThemeCacheForTests();
  });

  test('appends a stylesheet link carrying the marker attribute', async () => {
    const promise = loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    const link = document.head.querySelector('link[data-ares-theme]');
    expect(link).not.toBeNull();
    expect(link.rel).toBe('stylesheet');
    expect(link.getAttribute('href')).toBe('/ares-theme.css?v=1');
    link.onload();
    await promise;
  });

  test('resolves on error so a missing sheet degrades instead of hanging', async () => {
    const promise = loadTheme('/missing.css', 'data-missing-theme');
    document.head.querySelector('link[data-missing-theme]').onerror();
    await expect(promise).resolves.toBeUndefined();
  });

  test('appends only one link for repeated calls on the same href, and serves the same memoized promise', async () => {
    const first = loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    const second = loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    // Identity, not just equal resolution: only true if the pending Map served
    // the second call. A DOM-guard-only implementation (no memo) would still
    // pass the "one link" assertion below but would return a *different*
    // promise object each time, so this line alone is the memo's regression test.
    expect(second).toBe(first);
    document.head.querySelector('link[data-ares-theme]').onload();
    await first;
    expect(document.head.querySelectorAll('link[data-ares-theme]')).toHaveLength(1);
  });

  test('two different themes each get their own link', async () => {
    loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    loadTheme('/clubpm-theme.css?v=1', 'data-clubpm-theme');
    expect(document.head.querySelector('link[data-ares-theme]')).not.toBeNull();
    expect(document.head.querySelector('link[data-clubpm-theme]')).not.toBeNull();
  });

  test('bumping the href under the same marker (a cache-bust) appends a second link and actually loads', async () => {
    const first = loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    document.head.querySelector('link[data-ares-theme][href="/ares-theme.css?v=1"]').onload();
    await first;

    const second = loadTheme('/ares-theme.css?v=2', 'data-ares-theme');
    const links = document.head.querySelectorAll('link[data-ares-theme]');
    expect(links).toHaveLength(2);
    const v2Link = document.head.querySelector('link[data-ares-theme][href="/ares-theme.css?v=2"]');
    expect(v2Link).not.toBeNull();

    // The new promise must not already be resolved by the stale v=1 link
    // sitting in <head> under the same marker — it must wait for v=2's own
    // load event.
    let resolved = false;
    second.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    v2Link.onload();
    await expect(second).resolves.toBeUndefined();
  });

  test('the same href under a different marker gets its own link', async () => {
    loadTheme('/shared.css?v=1', 'data-ares-theme');
    loadTheme('/shared.css?v=1', 'data-other-theme');
    expect(document.head.querySelectorAll('link[href="/shared.css?v=1"]')).toHaveLength(2);
    expect(document.head.querySelector('link[data-ares-theme][href="/shared.css?v=1"]')).not.toBeNull();
    expect(document.head.querySelector('link[data-other-theme][href="/shared.css?v=1"]')).not.toBeNull();
  });

  test('lazyWithTheme resolves to the module', async () => {
    const mod = { default: 'Component' };
    const wrapped = lazyWithTheme('/ares-theme.css?v=1', 'data-ares-theme')(
      () => Promise.resolve(mod),
    );
    const pending = wrapped();
    document.head.querySelector('link[data-ares-theme]').onload();
    await expect(pending).resolves.toBe(mod);
  });
});
