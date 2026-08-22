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

  test('appends only one link for repeated calls on the same href', async () => {
    const first = loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
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
