import { loadClubPmTheme, lazyWithClubPmTheme } from './loadClubPmTheme';
import { __resetThemeCacheForTests } from '../theme/loadTheme';
import fs from 'fs';
import path from 'path';

describe('loadClubPmTheme compatibility wrapper', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    __resetThemeCacheForTests();
  });

  test('still uses the stable /clubpm-theme.css URL and data-clubpm-theme marker', async () => {
    const promise = loadClubPmTheme();
    const link = document.head.querySelector('link[data-clubpm-theme]');
    expect(link.getAttribute('href')).toBe('/clubpm-theme.css?v=22');
    const shell = fs.readFileSync(path.resolve(__dirname, '../../public/index.html'), 'utf8');
    expect(shell).toContain(`l.href = '${link.getAttribute('href')}'`);
    link.onload();
    await promise;
  });

  test('lazyWithClubPmTheme keeps its single-argument signature', async () => {
    const mod = { default: 'Shell' };
    const pending = lazyWithClubPmTheme(() => Promise.resolve(mod))();
    document.head.querySelector('link[data-clubpm-theme]').onload();
    await expect(pending).resolves.toBe(mod);
  });
});
