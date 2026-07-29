import { loadYouTubeApi, resetYouTubeApiCache } from './youtubeApi';

const tags = () => document.querySelectorAll('#youtube-iframe-api');

beforeEach(() => {
  resetYouTubeApiCache();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.YT;
  delete window.onYouTubeIframeAPIReady;
});

describe('loadYouTubeApi', () => {
  test('appends exactly one script no matter how many callers there are', () => {
    loadYouTubeApi();
    loadYouTubeApi();
    loadYouTubeApi();
    expect(tags()).toHaveLength(1);
  });

  test('every concurrent caller resolves with YT when the API signals ready', async () => {
    const a = loadYouTubeApi();
    const b = loadYouTubeApi();
    expect(a).toBe(b);

    window.YT = { Player: function Player() {} };
    window.onYouTubeIframeAPIReady();

    await expect(a).resolves.toBe(window.YT);
    await expect(b).resolves.toBe(window.YT);
  });

  test('resolves immediately when YT.Player already exists, without a script', async () => {
    window.YT = { Player: function Player() {} };
    await expect(loadYouTubeApi()).resolves.toBe(window.YT);
    expect(tags()).toHaveLength(0);
  });

  test('does not clobber a pre-existing onYouTubeIframeAPIReady owner', async () => {
    const prior = jest.fn();
    window.onYouTubeIframeAPIReady = prior;

    const promise = loadYouTubeApi();
    window.YT = { Player: function Player() {} };
    window.onYouTubeIframeAPIReady();

    await promise;
    expect(prior).toHaveBeenCalledTimes(1);
  });

  test('rejects on load failure and lets a later mount retry', async () => {
    const promise = loadYouTubeApi();
    document.getElementById('youtube-iframe-api').dispatchEvent(new Event('error'));
    await expect(promise).rejects.toThrow(/Failed to load/);

    // The failed tag is gone and the cache cleared, so the retry really re-adds it.
    expect(tags()).toHaveLength(0);
    loadYouTubeApi();
    expect(tags()).toHaveLength(1);
  });
});
