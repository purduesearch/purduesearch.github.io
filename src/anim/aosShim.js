// In-bundle replacement for the AOS CDN library. Honors the data-aos
// attributes already in JSX (fade-up / fade-left / fade-right +
// data-aos-delay), one-shot like AOS.init({ once: true }).
const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let io = null;

function observe(el) {
  if (el.dataset.aosDone) return;
  const delay = parseInt(el.getAttribute('data-aos-delay') || '0', 10);
  if (delay) el.style.transitionDelay = `${delay}ms`;
  io.observe(el);
}

export function initAosShim() {
  if (reduced()) {
    document.documentElement.classList.add('aos-off');
    return;
  }
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('aos-animate');
      e.target.dataset.aosDone = '1';
      io.unobserve(e.target);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-aos]').forEach(observe);

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.hasAttribute?.('data-aos')) observe(node);
        node.querySelectorAll?.('[data-aos]').forEach(observe);
      }
    }
  });
  mo.observe(document.getElementById('root'), { childList: true, subtree: true });
}
