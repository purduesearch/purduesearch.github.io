// Deck import: PDF in, CourseSlide rows out.
//
// The server normalizes .pptx and Google Slides links to a PDF; everything from
// there is this one path. Rendering here rather than on the backend avoids a
// native rasterizer dependency and yields each page's text in the same pass.
//
// pdfjs-dist is imported lazily so its ~1 MB never lands in a public-page bundle
// — this module is only reachable from /clubpm/*.

import { apiBaseUrl, authHeaders } from '../../../api/clubPmClient';

const RENDER_SCALE = 2; // ~1600px wide for a 4:3 deck; sharp on a retina stage

let pdfjsPromise = null;

async function loadPdfJs() {
  // The legacy build is the one react-scripts 5 can transpile — the modern
  // build ships syntax CRA's babel target chokes on.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // The worker ships with the package and is emitted into the build by
    // webpack's asset handling, so this stays self-contained — a CDN URL would
    // break the CSP and offline dev.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }
  return pdfjs;
}

/** Cached so re-importing a second deck does not re-download the library. */
function pdfJs() {
  if (!pdfjsPromise) pdfjsPromise = loadPdfJs().catch((err) => { pdfjsPromise = null; throw err; });
  return pdfjsPromise;
}

/** Ask the server to turn whatever the author gave us into a PDF. */
async function fetchSourcePdf({ sectionId, file, url, signal }) {
  const endpoint = `${apiBaseUrl}/api/outreach/courses/sections/${sectionId}/deck/source`;

  let res;
  if (file) {
    const body = new FormData();
    body.append('deck', file);
    res = await fetch(endpoint, {
      method: 'POST', credentials: 'include', headers: authHeaders(), body, signal,
    });
  } else {
    res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    });
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || 'Could not load that deck');
  }
  return res.arrayBuffer();
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function uploadPage({ sectionId, index, blob, text, width, height, signal }) {
  const body = new FormData();
  body.append('image', blob, `slide-${index}.png`);
  body.append('index', String(index));
  body.append('text', text ?? '');
  body.append('width', String(width));
  body.append('height', String(height));
  const res = await fetch(
    `${apiBaseUrl}/api/outreach/courses/sections/${sectionId}/slides`,
    { method: 'POST', credentials: 'include', headers: authHeaders(), body, signal }
  );
  if (!res.ok) throw new Error(`Slide ${index + 1} failed to upload`);
  return res.json();
}

/**
 * Import a deck end to end.
 *
 * The caller passes EITHER `file` (.pdf or .pptx) or `url` (Google Slides).
 * `onProgress({ done, total, label })` fires per page. `signal` aborts.
 *
 * The existing deck is NOT cleared here — the caller clears it only after this
 * resolves, so a failed or cancelled import leaves the previous deck intact.
 */
export async function importDeck({ sectionId, file, url, onProgress, signal }) {
  const sourceKind = url ? 'GSLIDES'
    : file?.type === 'application/pdf' ? 'PDF'
      : 'PPTX';
  const sourceName = file?.name || url || 'Deck';

  onProgress?.({ done: 0, total: 0, label: 'Converting…' });
  const buffer = await fetchSourcePdf({ sectionId, file, url, signal });

  const pdfjs = await pdfJs();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const total = doc.numPages;

  const slides = [];
  try {
    for (let pageNum = 1; pageNum <= total; pageNum += 1) {
      if (signal?.aborted) throw new Error('Import cancelled');
      onProgress?.({ done: pageNum - 1, total, label: `Rendering slide ${pageNum} of ${total}` });

      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      const content = await page.getTextContent();
      const text = content.items.map((i) => i.str ?? '').join(' ').replace(/\s+/g, ' ').trim();

      const blob = await canvasToBlob(canvas);
      // Free the bitmap immediately — a 60-slide deck at scale 2 will otherwise
      // hold ~60 full-size canvases alive until GC catches up.
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      slides.push(await uploadPage({
        sectionId, index: pageNum - 1, blob, text,
        width: Math.round(viewport.width), height: Math.round(viewport.height), signal,
      }));
      onProgress?.({ done: pageNum, total, label: `Uploaded slide ${pageNum} of ${total}` });
    }
  } finally {
    // Releases the worker-side document even when the import was cancelled.
    void doc.destroy();
  }

  return { slides, sourceKind, sourceName };
}

export default importDeck;
