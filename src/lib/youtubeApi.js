// Promise-cached loader for the YouTube IFrame Player API.
//
// The API has exactly one entry point — a global `onYouTubeIframeAPIReady`
// callback that fires once, for whoever happens to own the global at that
// moment. Two components each appending the script and each assigning that
// global means the first one silently never resolves. So: one <script> tag
// ever, one callback, one shared promise handed to every caller.

const SCRIPT_ID = 'youtube-iframe-api';
const SCRIPT_SRC = 'https://www.youtube.com/iframe_api';

let apiPromise = null;

/** True once `YT.Player` is constructible. */
function isReady(win) {
  return Boolean(win && win.YT && typeof win.YT.Player === 'function');
}

/**
 * Resolve with `window.YT` once the IFrame API is loaded. Safe to call from any
 * number of components concurrently; every call after the first returns the
 * same promise. A load failure rejects *and* clears the cache so a later mount
 * (e.g. after the network comes back) can retry.
 */
export function loadYouTubeApi() {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('YouTube API needs a browser environment'));
      return;
    }
    if (isReady(window)) { resolve(window.YT); return; }

    // Chain rather than clobber: something else may legitimately own this
    // global already (another loader, a widget script).
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') {
        try { previous(); } catch { /* a third-party callback must not break us */ }
      }
      resolve(window.YT);
    };

    // The tag may already be in flight from a previous mount whose promise was
    // reset by an error; in that case the callback above is all we need.
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener('error', () => {
      script.remove();
      apiPromise = null;
      reject(new Error('Failed to load the YouTube IFrame API'));
    }, { once: true });
    (document.body || document.head).appendChild(script);
  }).catch((err) => {
    apiPromise = null;
    throw err;
  });

  return apiPromise;
}

/** Test seam — drops the cached promise so each case starts clean. */
export function resetYouTubeApiCache() {
  apiPromise = null;
}

export default loadYouTubeApi;
