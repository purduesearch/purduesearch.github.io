// Framework-free carousel enhancer. The same markup is produced by the editor
// NodeView (BlogGallery.jsx), the server renderer (blogRender.ts) and therefore
// the preview and published page — so one enhancer serves all of them. The
// carousel is fully usable without this script: the track is a scroll-snap
// strip, so swipe and trackpad scrolling work on their own. This adds arrows,
// dots and keyboard support.

/** Clamped index arithmetic; exported so it can be tested without a DOM. */
export function nextIndex(current, delta, count) {
  if (count <= 0) return 0;
  const from = Math.min(Math.max(current, 0), count - 1);
  return Math.min(Math.max(from + delta, 0), count - 1);
}

function enhance(root) {
  if (root.dataset.carouselReady === '1') return;
  const track = root.querySelector('.cpm-blog-carousel-track');
  if (!track) return;
  const slides = Array.from(track.querySelectorAll('.cpm-blog-carousel-slide'));
  if (!slides.length) return;

  const dots = Array.from(root.querySelectorAll('.cpm-blog-carousel-dot'));
  const prev = root.querySelector('.cpm-blog-carousel-prev');
  const next = root.querySelector('.cpm-blog-carousel-next');
  let index = 0;

  const paint = () => {
    dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === slides.length - 1;
  };

  const goTo = (i) => {
    index = nextIndex(index, i - index, slides.length);
    slides[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    paint();
  };

  prev?.addEventListener('click', () => goTo(nextIndex(index, -1, slides.length)));
  next?.addEventListener('click', () => goTo(nextIndex(index, 1, slides.length)));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  root.setAttribute('tabindex', '0');
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    goTo(nextIndex(index, e.key === 'ArrowRight' ? 1 : -1, slides.length));
  });

  // Keep dots in sync when the reader swipes or scrolls the track directly.
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const i = slides.indexOf(entry.target);
        if (i >= 0) { index = i; paint(); }
      }
    }, { root: track, threshold: 0.6 });
    slides.forEach((s) => io.observe(s));
  }

  root.dataset.carouselReady = '1';
  paint();
}

/** Enhance every carousel inside `container` (default: the whole document). */
export function initBlogCarousels(container) {
  const scope = container || (typeof document !== 'undefined' ? document : null);
  if (!scope) return;
  scope.querySelectorAll('[data-carousel]').forEach(enhance);
}

export default initBlogCarousels;
