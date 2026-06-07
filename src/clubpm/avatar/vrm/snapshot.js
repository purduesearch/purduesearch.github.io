// Captures a head+shoulders PNG from the live avatar preview canvas and POSTs
// it to the backend. The Editor's <Canvas> must be mounted with
// `preserveDrawingBuffer: true` — otherwise React-Three-Fiber's default
// behavior is to clear the framebuffer before toBlob can read it (PNG comes
// back transparent).
//
// We rely on the Editor wrapping the canvas in a [data-avatar-preview]
// container; locating by that attribute keeps the snapshot decoupled from
// any specific Three.js / R3F internals.

const ENDPOINT = "/api/avatar/portrait";

function findPreviewCanvas() {
  const host = document.querySelector("[data-avatar-preview]");
  if (!host) return null;
  return host.querySelector("canvas");
}

export function capturePortrait() {
  return new Promise((resolve, reject) => {
    const canvas = findPreviewCanvas();
    if (!canvas) {
      reject(new Error("No avatar preview canvas mounted"));
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Canvas produced no blob (preserveDrawingBuffer off?)"));
        return;
      }
      try {
        const form = new FormData();
        form.append("portrait", blob, "portrait.png");
        const res = await fetch(ENDPOINT, {
          method:      "POST",
          body:        form,
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          reject(new Error(`Portrait upload failed (${res.status}): ${text}`));
          return;
        }
        resolve(await res.json());
      } catch (err) {
        reject(err);
      }
    }, "image/png");
  });
}
