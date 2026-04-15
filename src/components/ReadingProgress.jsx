import { useEffect, useRef } from 'react';

const ReadingProgress = () => {
  const barRef = useRef(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let rafId = null;
    const update = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        const scrollTop  = window.scrollY;
        const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width  = docHeight > 0 ? `${(scrollTop / docHeight) * 100}%` : '0%';
        rafId = null;
      });
    };

    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={barRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: 3,
        width: '0%',
        background: 'var(--color-accent)',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  );
};

export default ReadingProgress;
